#!/bin/bash
# Prein AI - Hetzner VM Setup Script
# Run this once on a fresh Ubuntu/Debian VM to configure everything

set -e

echo "========================================="
echo "  Prein AI - Hetzner VM Setup"
echo "========================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run as root: sudo bash setup-vm.sh"
    exit 1
fi

# Configuration
APP_USER="prein"
APP_DIR="/opt/prein-ai"
REPO_URL="${REPO_URL:-https://github.com/YOUR_USERNAME/prein-ai.git}"

echo "[1/8] Creating application user..."
if ! id "$APP_USER" &>/dev/null; then
    useradd -m -s /bin/bash "$APP_USER"
    echo "Created user: $APP_USER"
else
    echo "User $APP_USER already exists"
fi

echo ""
echo "[2/8] Installing system dependencies..."
apt-get update
apt-get install -y curl git unzip

echo ""
echo "[3/8] Installing Bun..."
if [ ! -f "/home/$APP_USER/.bun/bin/bun" ]; then
    sudo -u "$APP_USER" bash -c 'curl -fsSL https://bun.sh/install | bash'
    echo "Bun installed"
else
    echo "Bun already installed"
fi

echo ""
echo "[4/8] Installing Caddy (reverse proxy)..."
if ! command -v caddy &>/dev/null; then
    apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
    apt-get update
    apt-get install -y caddy
    echo "Caddy installed"
else
    echo "Caddy already installed"
fi

echo ""
echo "[5/8] Cloning/updating repository..."
if [ ! -d "$APP_DIR" ]; then
    mkdir -p "$APP_DIR"
    chown "$APP_USER:$APP_USER" "$APP_DIR"
    sudo -u "$APP_USER" git clone "$REPO_URL" "$APP_DIR"
    echo "Repository cloned to $APP_DIR"
else
    echo "Repository already exists at $APP_DIR"
    cd "$APP_DIR"
    sudo -u "$APP_USER" git pull origin main || true
fi

echo ""
echo "[6/8] Installing application dependencies..."
cd "$APP_DIR/todo-site"
sudo -u "$APP_USER" /home/$APP_USER/.bun/bin/bun install

echo ""
echo "[7/8] Setting up Caddy basic auth..."
if [ ! -f "/etc/caddy/env" ]; then
    echo ""
    echo ">>> Setting up basic auth credentials <<<"
    read -rp "Enter basic auth username: " AUTH_USER
    read -rsp "Enter basic auth password: " AUTH_PASS
    echo ""

    HASH=$(caddy hash-password --plaintext "$AUTH_PASS")

    echo "BASIC_AUTH_USER=$AUTH_USER" > /etc/caddy/env
    echo "BASIC_AUTH_HASH=$HASH" >> /etc/caddy/env
    chmod 600 /etc/caddy/env
    echo "Caddy auth credentials saved to /etc/caddy/env"

    # Create systemd override so Caddy loads the env file
    mkdir -p /etc/systemd/system/caddy.service.d
    printf '[Service]\nEnvironmentFile=/etc/caddy/env\n' > /etc/systemd/system/caddy.service.d/env.conf
    echo "Caddy systemd override created"
else
    echo "Caddy env file already exists at /etc/caddy/env"
fi

echo ""
echo "[8/8] Installing systemd services..."

# Copy service files
cp "$APP_DIR/deploy/prein-ai-todo.service" /etc/systemd/system/

# Copy Caddy config
cp "$APP_DIR/deploy/Caddyfile" /etc/caddy/Caddyfile

# Reload systemd
systemctl daemon-reload

# Enable and start services
systemctl enable prein-ai-todo caddy
systemctl restart prein-ai-todo caddy

echo ""
echo "========================================="
echo "  Setup Complete!"
echo "========================================="
echo ""
echo "Services status:"
echo ""
systemctl status prein-ai-todo --no-pager -l || true
echo ""
systemctl status caddy --no-pager -l || true
echo ""
echo "========================================="
echo "  Next Steps:"
echo "========================================="
echo ""
echo "1. If using a domain, edit Caddy config:"
echo "   sudo nano /etc/caddy/Caddyfile"
echo "   Replace ':80' with your domain for auto-HTTPS"
echo ""
echo "2. Restart services after changes:"
echo "   sudo systemctl restart prein-ai-todo caddy"
echo ""
echo "3. Set up GitHub Actions secrets for CI/CD:"
echo "   - HETZNER_HOST: Your VM IP (e.g., 123.45.67.89)"
echo "   - HETZNER_USER: $APP_USER"
echo "   - HETZNER_SSH_KEY: Your SSH private key"
echo "   - BASIC_AUTH_USER: Username for basic auth"
echo "   - BASIC_AUTH_PASSWORD: Password for basic auth (plaintext; hashed during deploy)"
echo ""
echo "4. Access your app:"
echo "   - Todo App: http://YOUR_IP/"
echo ""
echo "Logs:"
echo "   journalctl -u prein-ai-todo -f"
echo "   journalctl -u caddy -f"
echo ""
