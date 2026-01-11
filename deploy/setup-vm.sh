#!/bin/bash
# Setup script for Hetzner VM
# Run this once to configure the server

set -e

echo "=== Prein AI VM Setup ==="

# Create user
if ! id "prein" &>/dev/null; then
    echo "Creating prein user..."
    sudo useradd -m -s /bin/bash prein
    sudo usermod -aG sudo prein
fi

# Install Bun
echo "Installing Bun..."
sudo -u prein bash -c 'curl -fsSL https://bun.sh/install | bash'

# Clone repo (first time) or update
if [ ! -d "/opt/prein-ai" ]; then
    echo "Cloning repository..."
    sudo mkdir -p /opt/prein-ai
    sudo chown prein:prein /opt/prein-ai
    sudo -u prein git clone https://github.com/YOUR_USERNAME/prein-ai.git /opt/prein-ai
else
    echo "Repository already exists, pulling latest..."
    cd /opt/prein-ai
    sudo -u prein git pull origin main
fi

# Install dependencies
echo "Installing dependencies..."
cd /opt/prein-ai
sudo -u prein /home/prein/.bun/bin/bun install

# Create .env file if it doesn't exist
if [ ! -f "/opt/prein-ai/.env" ]; then
    echo "Creating .env file..."
    sudo -u prein bash -c 'cat > /opt/prein-ai/.env << EOF
ANTHROPIC_API_KEY=your-api-key-here
PORT=3000
EOF'
    echo "⚠️  Please edit /opt/prein-ai/.env and add your ANTHROPIC_API_KEY"
fi

# Install systemd service
echo "Installing systemd service..."
sudo cp /opt/prein-ai/deploy/prein-ai.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable prein-ai
sudo systemctl start prein-ai

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Service status:"
sudo systemctl status prein-ai --no-pager
echo ""
echo "Next steps:"
echo "1. Edit /opt/prein-ai/.env with your ANTHROPIC_API_KEY"
echo "2. Run: sudo systemctl restart prein-ai"
echo "3. Set up GitHub secrets for CI/CD:"
echo "   - HETZNER_HOST: Your VM IP address"
echo "   - HETZNER_USER: prein (or root)"
echo "   - HETZNER_SSH_KEY: Your SSH private key"
