# Deployment Guide

This project uses GitHub Actions for automated deployment to EC2 with PM2 process management.

## Workflow Overview

- **Test Job**: Runs on every push to `main`, scheduled runs, and manual triggers
- **Deploy Job**: Only runs on scheduled (daily at 09:00 UTC) or manual triggers

## Prerequisites

### 1. EC2 Setup

On your EC2 instance, you need to:

```bash
# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Create project directory
mkdir -p ~/bobatalks/logs
cd ~/bobatalks

# Create .env file with your Discord credentials
nano .env
```

Add your Discord bot credentials to `.env`:

```
DISCORD_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_client_id_here
```

### 2. GitHub Secrets

Add these secrets to your GitHub repository (Settings → Secrets and variables → Actions):

- `EC2_HOST`: Your EC2 instance public IP or hostname
- `EC2_SSH_KEY`: Your EC2 SSH private key (the entire content of your `.pem` file)

### 3. Initial Deployment

For the first deployment, manually SSH into your EC2 and set up PM2:

```bash
cd ~/bobatalks
# After first deploy runs, register Discord commands
node dist/bot/registerCommands.js
```

## How It Works

### On Every Push to Main:

1. Runs tests
2. Builds the project
3. Creates an artifact
4. **Does NOT deploy** (only tests)

### On Schedule (Daily at 09:00 UTC) or Manual Trigger:

1. Runs tests
2. Builds the project
3. Deploys to EC2
4. Extracts files
5. Installs production dependencies
6. Reloads PM2 process

## Manual Deployment

You can trigger a manual deployment from GitHub:

1. Go to Actions tab
2. Select "Nightly Deploy"
3. Click "Run workflow"
4. Select branch and run

## PM2 Commands

SSH into your EC2 instance to manage the bot:

```bash
# Check status
pm2 status

# View logs
pm2 logs bobatalks

# Restart
pm2 restart bobatalks

# Stop
pm2 stop bobatalks

# Monitor
pm2 monit
```

## Troubleshooting

### Bot won't start

- Check if `.env` file exists on EC2: `cat ~/bobatalks/.env`
- Check PM2 logs: `pm2 logs bobatalks`

### Deployment fails

- Verify GitHub secrets are set correctly
- Check GitHub Actions logs for specific errors
- Ensure EC2 security group allows SSH (port 22)

### PM2 process not reloading

- SSH into EC2 and manually run: `pm2 reload bobatalks`
- Check if PM2 is running: `pm2 list`
