# Complete Setup Guide

Follow these steps to get your Discord bot auto-deploying to EC2.

## Part 1: GitHub Secrets Setup

### Step 1: Add GitHub Secrets

Go to your GitHub repository:

```
Your Repo → Settings → Secrets and variables → Actions → New repository secret
```

Add these **2 secrets**:

#### Secret 1: `EC2_HOST`

- **Name:** `EC2_HOST`
- **Value:** Your EC2 public IP address or hostname
- Example: `3.23.45.67` or `ec2-3-23-45-67.us-east-2.compute.amazonaws.com`

#### Secret 2: `EC2_SSH_KEY`

- **Name:** `EC2_SSH_KEY`
- **Value:** Your entire SSH private key file (`.pem` file)
- Open your `.pem` file in a text editor and copy **everything**:

```
-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA...
(all the lines)
...your key content...
-----END RSA PRIVATE KEY-----
```

## Part 2: EC2 Instance Setup

### Step 1: SSH into your EC2 instance

```bash
ssh -i your-key.pem ubuntu@your-ec2-ip
```

### Step 2: Run the setup script

Copy the commands below and paste them into your EC2 terminal:

```bash
# Update system
sudo apt-get update

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify Node.js installation
node --version  # Should show v20.x.x
npm --version

# Install PM2 globally
sudo npm install -g pm2

# Create project directory
mkdir -p ~/bobatalks/logs
cd ~/bobatalks

# Setup PM2 to start on system boot
pm2 startup systemd -u ubuntu --hp /home/ubuntu
```

### Step 3: Run the sudo command

After running `pm2 startup`, PM2 will print a command like:

```bash
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u ubuntu --hp /home/ubuntu
```

**Copy and run that exact command** (it will be different for your system).

### Step 4: Create your .env file

Since you mentioned you already have your .env on EC2, verify it exists:

```bash
cd ~/bobatalks
ls -la .env
```

If it doesn't exist or you need to update it:

```bash
nano ~/bobatalks/.env
```

Add your Discord credentials:

```
DISCORD_TOKEN=your_actual_discord_token
DISCORD_CLIENT_ID=your_actual_client_id
```

Save and exit:

- Press `Ctrl + X`
- Press `Y` to confirm
- Press `Enter`

Verify it was created:

```bash
cat ~/bobatalks/.env
```

## Part 3: Initial Deployment

### Option A: Trigger Manual Deploy from GitHub

1. Go to your GitHub repository
2. Click **Actions** tab
3. Click **Deploy BobaTalks Flowers Bot on pm2 (EC2 Instance)**
4. Click **Run workflow** button
5. Select `main` branch
6. Click green **Run workflow** button

Wait for it to complete, then SSH into EC2:

```bash
ssh -i your-key.pem ubuntu@your-ec2-ip
cd ~/bobatalks
node dist/bot/registerCommands.js  # Register Discord commands
pm2 status  # Check if bot is running
pm2 logs bobatalks  # View logs
```

### Option B: Manual First Deployment

If you prefer to test manually first:

```bash
# On your local machine
npm run build
scp -r -i your-key.pem dist package.json package-lock.json pm2.config.cjs ubuntu@your-ec2-ip:~/bobatalks/

# SSH into EC2
ssh -i your-key.pem ubuntu@your-ec2-ip
cd ~/bobatalks
npm ci --omit=dev
node dist/bot/registerCommands.js  # Register Discord commands

pm2 start pm2.config.cjs
pm2 save
pm2 status
```

## Part 4: Verify Everything Works

### Check PM2 Status

```bash
pm2 status
# Should show: bobatalks | online

```

### View Logs

```bash
pm2 logs bobatalks
# Should show bot connecting to Discord

```

### Check if bot is online in Discord

- Open Discord
- Check if your bot appears online

- Try a slash command like `/ping`

## Troubleshooting

### Bot shows as offline in Discord

```bash
pm2 logs bobatalks --lines 50
# Look for errors about DISCORD_TOKEN
```

### .env file missing

```bash
cd ~/bobatalks
cat .env  # Should show your Discord token
```

### PM2 not running

```bash
pm2 list
pm2 start pm2.config.cjs
```

### Commands not registered

```bash
cd ~/bobatalks
node dist/bot/registerCommands.js
```

## Deployment Schedule

After setup, deployments happen automatically:

- ✅ **Every day at 4 AM Toronto time** (9 AM UTC)
- ✅ **Manual trigger** anytime from GitHub Actions
- ✅ **Tests run** on every push to main (but doesn't deploy)

## Useful PM2 Commands

```bash
pm2 status              # Check bot status
pm2 logs bobatalks      # View logs (live)
pm2 restart bobatalks   # Restart bot
pm2 stop bobatalks      # Stop bot
pm2 reload bobatalks    # Reload with zero downtime
pm2 monit               # Real-time monitoring
pm2 save                # Save current process list
```

## Next Steps

1. ✅ Complete EC2 setup
2. ✅ Add GitHub secrets
3. ✅ Verify .env file on EC2
4. ✅ Run first deployment
5. ✅ Register Discord commands
6. ✅ Test bot in Discord
7. 🎉 Enjoy automated daily deployments!
