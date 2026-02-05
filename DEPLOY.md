# Deployment Guide - Hetzner VM

This guide covers deploying Prein AI to a Hetzner Cloud VM.

## Architecture

```
Internet → Caddy (port 80/443) → Bun apps
                                 ├── claude-site (localhost:3001)
                                 └── todo-site (localhost:3002)
```

- **Caddy**: Reverse proxy with automatic HTTPS (Let's Encrypt)
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

### 3. Configure Environment

Edit the environment file:

```bash
sudo nano /opt/prein-ai/.env
```

Add your Anthropic API key:

```
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx
```

Restart services:

```bash
sudo systemctl restart prein-ai-claude
```

### 4. (Optional) Configure Domain & HTTPS

If you have a domain:

1. Point your domain's A record to your VM's IP
2. Edit Caddy config:
   ```bash
   sudo nano /etc/caddy/Caddyfile
   ```
3. Replace `:80` with your domain:
   ```
   yourdomain.com {
       handle /todo/* {
           uri strip_prefix /todo
           reverse_proxy localhost:3002
       }
       handle /* {
           reverse_proxy localhost:3001
       }
   }
   ```
4. Restart Caddy:
   ```bash
   sudo systemctl restart caddy
   ```

Caddy will automatically obtain and renew TLS certificates.

## CI/CD Setup

### GitHub Actions Secrets

Add these secrets to your GitHub repository:

1. Go to Settings → Secrets and variables → Actions
2. Add the following secrets:

| Secret | Description |
|--------|-------------|
| `HETZNER_HOST` | Your VM's IP address |
| `HETZNER_USER` | `prein` (the app user) |
| `HETZNER_SSH_KEY` | Your SSH private key (the one whose public key is on the VM) |

### SSH Key Setup

To allow GitHub Actions to deploy:

1. Generate a deploy key (on your local machine):
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/prein-deploy -C "github-actions-deploy"
   ```

2. Add the public key to VM:
   ```bash
   # SSH into your VM
   ssh root@YOUR_VM_IP

   # Add to prein user's authorized_keys
   echo "YOUR_PUBLIC_KEY" >> /home/prein/.ssh/authorized_keys
   ```

3. Add the private key to GitHub Secrets as `HETZNER_SSH_KEY`

### Deployment Flow

Every push to `main` triggers:
1. GitHub Actions connects to VM via SSH
2. Pulls latest code from repository
3. Installs dependencies
4. Restarts services

## Manual Operations

### View Logs

```bash
# Claude AI logs
journalctl -u prein-ai-claude -f

# Todo app logs
journalctl -u prein-ai-todo -f

# Caddy (proxy) logs
journalctl -u caddy -f
```

### Restart Services

```bash
# Individual
sudo systemctl restart prein-ai-claude
sudo systemctl restart prein-ai-todo

# All at once
sudo systemctl restart prein-ai-claude prein-ai-todo caddy
```

### Check Status

```bash
sudo systemctl status prein-ai-claude
sudo systemctl status prein-ai-todo
sudo systemctl status caddy
```

### Manual Deploy

```bash
cd /opt/prein-ai
git pull origin main
cd claude-site && ~/.bun/bin/bun install
cd ../todo-site && ~/.bun/bin/bun install
sudo systemctl restart prein-ai-claude prein-ai-todo
```

## Firewall (Optional but Recommended)

```bash
# Allow SSH, HTTP, HTTPS
sudo ufw allow ssh
sudo ufw allow http
sudo ufw allow https
sudo ufw enable
```

## File Locations

| File | Purpose |
|------|---------|
| `/opt/prein-ai/` | Application code |
| `/opt/prein-ai/.env` | Environment variables |
| `/etc/systemd/system/prein-ai-*.service` | Service definitions |
| `/etc/caddy/Caddyfile` | Reverse proxy config |

## Troubleshooting

### Service won't start

Check logs:
```bash
journalctl -u prein-ai-claude -n 50 --no-pager
```

### Port already in use

Check what's using the port:
```bash
sudo lsof -i :3001
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
