# Production coturn Deployment on Hetzner VPS

This guide walks through deploying coturn with ephemeral TURN credentials on a Hetzner VPS for production use.

## Prerequisites

- **VPS**: Hetzner CX22 (approx. $4/month), Ubuntu 22.04 LTS
- **Domain**: A domain name you own (e.g., `turn.yourdomain.com`)
- **Signaling Server**: Running on Fly.io with `TURN_SHARED_SECRET` environment variable set

## Step 1: DNS Setup

Create an A record pointing your turn domain to your Hetzner VPS public IP:

```
turn.yourdomain.com  A  <your-vps-public-ip>
```

Wait for DNS propagation (usually 5-15 minutes). Verify with:

```bash
dig turn.yourdomain.com
```

## Step 2: Initial Server Setup

### SSH Access

```bash
ssh root@<your-vps-public-ip>
```

### Update System

```bash
apt-get update
apt-get upgrade -y
apt-get install -y curl wget ufw
```

### Configure Firewall (ufw)

```bash
ufw default deny incoming
ufw default allow outgoing

# TURN/TURNS
ufw allow 3478/udp
ufw allow 3478/tcp
ufw allow 5349/udp
ufw allow 5349/tcp

# Relay ports
ufw allow 49152:65535/udp
ufw allow 49152:65535/tcp

# SSH (important!)
ufw allow 22/tcp

ufw enable
```

Verify rules:
```bash
ufw status
```

## Step 3: Install Docker

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Verify
docker --version
```

## Step 4: Install Let's Encrypt TLS Certificates

### Install certbot

```bash
apt-get install -y certbot python3-certbot-standalone
```

### Obtain Certificate

```bash
certbot certonly --standalone -d turn.yourdomain.com
```

Follow the prompts. Certificates will be stored in `/etc/letsencrypt/live/turn.yourdomain.com/`.

### Auto-Renewal

Create a cron job to auto-renew certificates:

```bash
crontab -e
```

Add this line to renew 30 days before expiration and reload coturn:

```
0 0 * * * certbot renew --quiet && docker restart coturn
```

## Step 5: Deploy coturn

### Clone Configuration

Copy the production config to your VPS (or create it manually):

```bash
mkdir -p /opt/coturn
cd /opt/coturn
```

Create `/opt/coturn/turnserver.conf` with the contents from `coturn/turnserver.prod.conf`, but **replace placeholders**:

- `<CHANGE_ME>` → Replace with the **same value** as your Fly.io signaling server's `TURN_SHARED_SECRET` environment variable
- `<YOUR_DOMAIN>` → Replace with your actual domain (e.g., `turn.yourdomain.com`)

Example:
```
listening-port=3478
tls-listening-port=5349

fingerprint
use-auth-secret
static-auth-secret=your-actual-shared-secret-here

realm=turn.yourdomain.com

cert=/etc/letsencrypt/live/turn.yourdomain.com/fullchain.pem
pkey=/etc/letsencrypt/live/turn.yourdomain.com/privkey.pem
...
```

### Run coturn Container

```bash
docker run -d --name coturn \
  --restart unless-stopped \
  --network host \
  -v /opt/coturn/turnserver.conf:/etc/turnserver.conf:ro \
  -v /etc/letsencrypt:/etc/letsencrypt:ro \
  coturn/coturn:4.8-alpine \
  -c /etc/turnserver.conf
```

### Verify Running

```bash
docker ps | grep coturn
docker logs coturn
```

You should see verbose logs indicating the server is listening on ports 3478 and 5349.

## Step 6: Credential Alignment

**Critical**: The `static-auth-secret` in your `turnserver.conf` **must match** the `TURN_SHARED_SECRET` environment variable on your Fly.io signaling server.

The signaling server uses this shared secret to generate **ephemeral TURN credentials** on-the-fly using HMAC-SHA1:

```
username = <unix-timestamp>
password = HMAC-SHA1(shared-secret, username)
```

Clients receive these credentials and authenticate to coturn. If the shared secret doesn't match, authentication fails.

**To update the secret:**

1. Change `static-auth-secret` in `/opt/coturn/turnserver.conf`
2. Update `TURN_SHARED_SECRET` on Fly.io (deploy new version or use `fly secrets set`)
3. Restart coturn: `docker restart coturn`

## Step 7: Testing

### Option A: Using `turnutils_uclient`

Install on a test machine:

```bash
apt-get install -y coturn  # Installs turnutils
```

Test connectivity:

```bash
turnutils_uclient -v -u <username> -w <password> turn.yourdomain.com
```

For ephemeral credentials, you'll need to generate them using the shared secret (see your signaling server code).

### Option B: Using Trickle ICE Web Tool

1. Visit: https://webrtc.github.io/samples/web/content/trickle-ice/
2. Configure:
   - TURN server: `turn:turn.yourdomain.com:3478?transport=udp`
   - Username: `<ephemeral-username-from-signaling-server>`
   - Password: `<ephemeral-password-from-signaling-server>`
3. Click "Add Server" and gather candidates

Success = candidates with `typ relay` should appear, meaning coturn is relaying traffic.

## Step 8: Monitoring & Logs

### View Real-Time Logs

```bash
docker logs -f coturn
```

### Check Resource Usage

```bash
docker stats coturn
```

### Verify Certificate Expiration

```bash
certbot certificates
```

## Troubleshooting

### coturn Not Starting

```bash
docker logs coturn
```

Common issues:
- Port already in use: Check `netstat -tulpn | grep 3478`
- Certificate path wrong: Verify cert exists in `/etc/letsencrypt/live/<domain>/`
- Config syntax error: Use `turnserver -c /opt/coturn/turnserver.conf -v` to validate

### Clients Can't Connect

1. Verify DNS resolves: `dig turn.yourdomain.com`
2. Verify firewall rules: `ufw status`
3. Verify credentials match: Signaling server's `TURN_SHARED_SECRET` == coturn's `static-auth-secret`
4. Check logs for auth errors: `docker logs coturn | grep -i auth`

### Certificate Renewal Failed

```bash
# Manual renewal
certbot renew --force-renewal

# Check cron logs
grep CRON /var/log/syslog | tail -20
```

## Deployment Architecture Summary

```
Client (Netlify)
    ↓ (WebRTC Signaling)
Signaling Server (Fly.io)
    ├─ Generates ephemeral TURN credentials
    │  (using TURN_SHARED_SECRET)
    └─ Sends to client
    
    ↓ (WebRTC Media Relay)
coturn Server (Hetzner VPS)
    └─ Validates with static-auth-secret
    └─ Relays media between peers
```

## Security Notes

- TLS is mandatory (`tls-listening-port=5349`)
- Private network relay is disabled (`denied-peer-ip` blocks 10.0.0.0, 172.16.0.0, 192.168.0.0 ranges)
- Old TLS versions disabled (`no-tlsv1`, `no-tlsv1_1`)
- CLI disabled (`no-cli`) — only config file
- Rate limiting enabled (`total-quota=100`, `stale-nonce=600`)

## Next Steps

1. Set up monitoring/alerts for certificate expiration
2. Consider backing up `/etc/letsencrypt` periodically
3. Monitor coturn logs for abuse patterns (e.g., excessive relay attempts)
4. Test failover/multi-region deployment if needed
