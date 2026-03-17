#!/usr/bin/env bash
set -euo pipefail

# ── Colors ───────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }
fatal() { error "$@"; exit 1; }

# ── Parse Arguments ──────────────────────────────────────

DOMAIN=""
EMAIL=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --email)  EMAIL="$2"; shift 2 ;;
    *) fatal "Unknown argument: $1" ;;
  esac
done

[[ -z "$DOMAIN" ]] && fatal "Missing required argument: --domain <domain>"
[[ -z "$EMAIL" ]]  && fatal "Missing required argument: --email <email>"

info "Deploying the-chat to ${DOMAIN}"

# ── Preflight ────────────────────────────────────────────

if [[ $EUID -ne 0 ]]; then
  fatal "This script must be run as root (or with sudo)"
fi

# ── Install Docker if Missing ────────────────────────────

install_docker_amzn() {
  info "Amazon Linux detected — installing Docker via dnf..."
  dnf install -y -q docker
  systemctl enable --now docker
  info "Docker installed successfully"

  local arch
  arch=$(uname -m)
  # buildx uses amd64/arm64 naming, not x86_64/aarch64
  local buildx_arch
  case "$arch" in
    x86_64)  buildx_arch="amd64" ;;
    aarch64) buildx_arch="arm64" ;;
    *)       buildx_arch="$arch" ;;
  esac

  mkdir -p /usr/local/libexec/docker/cli-plugins

  if ! docker compose version &>/dev/null; then
    info "Installing Docker Compose plugin..."
    curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-${arch}" \
      -o /usr/local/libexec/docker/cli-plugins/docker-compose
    chmod +x /usr/local/libexec/docker/cli-plugins/docker-compose
    info "Docker Compose plugin installed"
  fi

  if ! docker buildx version &>/dev/null; then
    info "Installing Docker Buildx plugin..."
    local buildx_version
    buildx_version=$(curl -fsSL https://api.github.com/repos/docker/buildx/releases/latest | grep '"tag_name"' | cut -d'"' -f4)
    curl -fsSL "https://github.com/docker/buildx/releases/download/${buildx_version}/buildx-${buildx_version}.linux-${buildx_arch}" \
      -o /usr/local/libexec/docker/cli-plugins/docker-buildx
    chmod +x /usr/local/libexec/docker/cli-plugins/docker-buildx
    info "Docker Buildx plugin installed"
  fi
}

install_docker_generic() {
  info "Installing Docker via get.docker.com..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
  info "Docker installed successfully"
}

if ! command -v docker &>/dev/null; then
  if [[ -f /etc/os-release ]] && grep -q 'amzn' /etc/os-release; then
    install_docker_amzn
  else
    install_docker_generic
  fi
else
  info "Docker found: $(docker --version)"
fi

if ! docker compose version &>/dev/null; then
  fatal "Docker Compose plugin not found. Install Docker Compose v2."
fi

# ── Detect Project Root ──────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOY_DIR="$SCRIPT_DIR"

info "Project root: ${PROJECT_ROOT}"
info "Deploy dir:   ${DEPLOY_DIR}"

# ── Generate Secrets ─────────────────────────────────────

ENV_FILE="${DEPLOY_DIR}/.env"

if [[ -f "$ENV_FILE" ]] && grep -q "TURN_SECRET=" "$ENV_FILE"; then
  info "Existing .env found — reusing secrets"
  source "$ENV_FILE"
else
  TURN_SECRET=$(openssl rand -hex 32)
  info "Generated new TURN_SECRET"
fi

# ── Detect External IP ───────────────────────────────────

EXTERNAL_IP=$(curl -s --max-time 5 ifconfig.me || \
              curl -s --max-time 5 api.ipify.org || \
              curl -s --max-time 5 icanhazip.com || \
              fatal "Could not detect external IP")

info "External IP: ${EXTERNAL_IP}"

# ── Write .env ───────────────────────────────────────────

cat > "$ENV_FILE" <<EOF
DOMAIN=${DOMAIN}
EMAIL=${EMAIL}
TURN_SECRET=${TURN_SECRET}
EXTERNAL_IP=${EXTERNAL_IP}
EOF

info "Wrote ${ENV_FILE}"

# ── Render Templates ─────────────────────────────────────

render_template() {
  local template="$1"
  local output="$2"
  sed \
    -e "s|{DOMAIN}|${DOMAIN}|g" \
    -e "s|{EMAIL}|${EMAIL}|g" \
    -e "s|{TURN_SECRET}|${TURN_SECRET}|g" \
    -e "s|{EXTERNAL_IP}|${EXTERNAL_IP}|g" \
    "$template" > "$output"
  info "Rendered ${output}"
}

render_template "${DEPLOY_DIR}/Caddyfile.template" "${DEPLOY_DIR}/Caddyfile"
render_template "${DEPLOY_DIR}/coturn/turnserver.conf.template" "${DEPLOY_DIR}/turnserver.conf"

# ── Build & Start ────────────────────────────────────────

info "Building and starting containers..."
docker compose -f "${DEPLOY_DIR}/docker-compose.yml" \
  --env-file "$ENV_FILE" \
  up -d --build

# ── Health Check ─────────────────────────────────────────

info "Waiting for services to become healthy..."

MAX_WAIT=120
ELAPSED=0

while [[ $ELAPSED -lt $MAX_WAIT ]]; do
  if curl -sf "https://${DOMAIN}/health" >/dev/null 2>&1; then
    echo ""
    info "═══════════════════════════════════════════════"
    info "  the-chat is live at https://${DOMAIN}"
    info "═══════════════════════════════════════════════"
    info ""
    info "  Useful commands:"
    info "    Logs:    docker compose -f ${DEPLOY_DIR}/docker-compose.yml logs -f"
    info "    Stop:    docker compose -f ${DEPLOY_DIR}/docker-compose.yml down"
    info "    Update:  git pull && ${0} --domain ${DOMAIN} --email ${EMAIL}"
    info ""
    exit 0
  fi
  echo -n "."
  sleep 2
  ELAPSED=$((ELAPSED + 2))
done

warn "Health check timed out after ${MAX_WAIT}s"
warn "Services may still be starting. Check logs:"
warn "  docker compose -f ${DEPLOY_DIR}/docker-compose.yml logs"
exit 1
