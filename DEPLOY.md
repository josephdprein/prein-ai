# Deployment Guide - Hetzner VM

This guide covers deploying the Todo application to a Hetzner Cloud VM.

## Architecture

```
Internet → Caddy (port 80/443, basic auth) → Todo app (localhost:3002)
```

- **Caddy**: Reverse proxy with basic auth and automatic HTTPS
- **systemd**: Process management with auto-restart
- **GitHub Actions**: CI/CD pipeline for automatic deployments

## Prerequisites

1. A Hetzner Cloud VM (Ubuntu 22.04+ recommended)
2. SSH access to your VM
3. A GitHub repository for this code
4. (Optional) A domain name pointed to your VM's IP

## Quick Setup

### 1. Create a Hetzner VM

1. Go to [Hetzner Cloud Console](https://console.hetzner.cloud/)
2. Create a new project (or use existing)
3. Create a new server:
   - **Location**: Choose nearest to you
   - **Image**: Ubuntu 22.04
   - **Type**: CX22 (2 vCPU, 4GB RAM) is sufficient
   - **SSH Key**: Add your SSH public key

### 2. Run Setup Script

SSH into your VM and run:

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/prein-ai.git /opt/prein-ai

# Run setup script
cd /opt/prein-ai
sudo bash deploy/setup-vm.sh
```

The setup script will prompt you for a basic auth username and password.

### 3. (Optional) Configure Domain & HTTPS

If you have a domain:

1. Point your domain's A record to your VM's IP
2. Edit Caddy config:
   ```bash
   sudo nano /etc/caddy/Caddyfile
   ```
3. Replace `:80` with your domain:
   ```
   yourdomain.com {
       basicauth {
           {$BASIC_AUTH_USER} {$BASIC_AUTH_HASH}
       }
       reverse_proxy localhost:3002
   }
   ```
4. Restart Caddy:
   ```bash
   sudo systemctl restart caddy
   ```

Caddy will automatically obtain and renew TLS certificates.

## CI/CD Setup

### GitHub Actions Secrets

Add these secrets to your GitHub repository (Settings → Secrets and variables → Actions):

| Secret | Description |
|--------|-------------|
| `HETZNER_HOST` | Your VM's IP address |
| `HETZNER_USER` | `prein` (the app user) |
| `HETZNER_SSH_KEY` | SSH private key for deployment |
| `BASIC_AUTH_USER` | Username for basic auth |
| `BASIC_AUTH_PASSWORD` | Password for basic auth (plaintext; hashed on the server during deploy) |

The CI pipeline hashes the password on the server using `caddy hash-password` and writes it to `/etc/caddy/env`. The password is never stored in plaintext on disk.

### SSH Key Setup

To allow GitHub Actions to deploy:

1. Generate a deploy key (on your local machine):
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/prein-deploy -C "github-actions-deploy"
   ```

2. Add the public key to VM:
   ```bash
   ssh root@YOUR_VM_IP
   echo "YOUR_PUBLIC_KEY" >> /home/prein/.ssh/authorized_keys
   ```

3. Add the private key to GitHub Secrets as `HETZNER_SSH_KEY`

### Deployment Flow

Every push to `main` triggers:
1. GitHub Actions connects to VM via SSH
2. Pulls latest code from repository
3. Installs dependencies
4. Restarts the todo service and Caddy
5. Hashes `BASIC_AUTH_PASSWORD` and writes credentials to Caddy env file

## Manual Operations

### View Logs

```bash
# Todo app logs
journalctl -u prein-ai-todo -f

# Caddy (proxy) logs
journalctl -u caddy -f
```

### Restart Services

```bash
sudo systemctl restart prein-ai-todo caddy
```

### Check Status

```bash
sudo systemctl status prein-ai-todo
sudo systemctl status caddy
```

### Manual Deploy

```bash
cd /opt/prein-ai
git pull origin main
cd todo-site && ~/.bun/bin/bun install
sudo systemctl restart prein-ai-todo
```

### Change Basic Auth Password

```bash
# Generate new hash
caddy hash-password --plaintext 'newpassword'

# Edit the env file
sudo nano /etc/caddy/env

# Restart Caddy
sudo systemctl restart caddy
```

## Firewall (Optional but Recommended)

```bash
sudo ufw allow ssh
sudo ufw allow http
sudo ufw allow https
sudo ufw enable
```

## File Locations

| File | Purpose |
|------|---------|
| `/opt/prein-ai/` | Application code |
| `/etc/systemd/system/prein-ai-todo.service` | Service definition |
| `/etc/caddy/Caddyfile` | Reverse proxy config |
| `/etc/caddy/env` | Basic auth credentials (username + bcrypt hash) |
| `/etc/systemd/system/caddy.service.d/env.conf` | Caddy systemd override to load env file |

## Troubleshooting

### Service won't start

Check logs:
```bash
journalctl -u prein-ai-todo -n 50 --no-pager
```

### Port already in use

Check what's using the port:
```bash
sudo lsof -i :3002
```

### Caddy certificate issues

Check Caddy logs and ensure your domain points to the VM:
```bash
dig yourdomain.com
journalctl -u caddy -n 50 --no-pager
```

### GitHub Actions deploy fails

1. Verify secrets are set correctly
2. Test SSH manually: `ssh -i /path/to/key prein@YOUR_VM_IP`
3. Check the Actions log for specific errors
