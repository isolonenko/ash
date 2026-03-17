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

[[ -z "$DOMAIN" ]] && fatal "Usage: curl -fsSL https://raw.githubusercontent.com/isolonenko/the-chat/master/deploy/install.sh | sudo bash -s -- --domain <domain> --email <email>"
[[ -z "$EMAIL" ]]  && fatal "Missing required argument: --email <email>"

# ── Preflight ────────────────────────────────────────────

if [[ $EUID -ne 0 ]]; then
  fatal "This script must be run as root (or with sudo)"
fi

# ── Install git if missing ───────────────────────────────

if ! command -v git &>/dev/null; then
  info "git not found — installing..."
  if command -v apt-get &>/dev/null; then
    apt-get update -qq && apt-get install -y -qq git
  elif command -v dnf &>/dev/null; then
    dnf install -y -q git
  elif command -v yum &>/dev/null; then
    yum install -y -q git
  elif command -v apk &>/dev/null; then
    apk add --quiet git
  else
    fatal "Could not install git — unknown package manager. Install git manually and re-run."
  fi
  info "git installed successfully"
else
  info "git found: $(git --version)"
fi

# ── Clone repo ───────────────────────────────────────────

INSTALL_DIR="/opt/the-chat"

if [[ -d "$INSTALL_DIR" ]]; then
  info "Existing installation found at ${INSTALL_DIR} — pulling latest..."
  git -C "$INSTALL_DIR" pull --ff-only
else
  info "Cloning the-chat to ${INSTALL_DIR}..."
  git clone https://github.com/isolonenko/the-chat.git "$INSTALL_DIR"
fi

# ── Run bootstrap ────────────────────────────────────────

info "Running bootstrap..."
exec "$INSTALL_DIR/deploy/bootstrap.sh" --domain "$DOMAIN" --email "$EMAIL"
