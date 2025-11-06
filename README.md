# 🌸 BobaTalks Flowers Bot

A UW Blueprint x BobaTalks project that automates the **Flowers** tradition — letting students celebrate wins through a Discord bot and displaying approved posts on the BobaTalks website.

---

## 🧭 Overview

This project includes:

- **Discord Bot** – Collects "Flowers" submissions and handles moderation.
- **Web App (Next.js)** – Displays approved Flowers on the BobaTalks site.
- **Database (Supabase)** – Stores submissions and approvals securely.
- **CI/CD** – Enforces code quality and consistency through GitHub Actions.

---

## ⚙️ Tech Stack

| Layer        | Technology                                      |
| ------------ | ----------------------------------------------- |
| Bot          | Node.js + TypeScript + discord.js               |
| Web          | Next.js 15 + Tailwind CSS                       |
| Database     | Supabase (PostgreSQL)                           |
| CI/CD        | GitHub Actions                                  |
| Code Quality | ESLint, Prettier, Husky, TypeScript strict mode |

---

## ✅ Local Setup Checklist

| Check                  | Command                             | Expected Result                     |
| ---------------------- | ----------------------------------- | ----------------------------------- |
| Node.js installed      | `node -v`                           | ≥ 22.x                              |
| npm installed          | `npm -v`                            | shows a version number              |
| Dependencies installed | `npm ci`                            | completes without errors            |
| Linting passes         | `npm run lint`                      | no errors or warnings               |
| Formatting passes      | `npm run format -- --check .`       | no changed files                    |
| TypeScript clean       | `npx tsc --noEmit`                  | no type errors                      |
| Precommit works        | `git commit -m "test: husky check"` | runs precommit checks automatically |

---

## 🧑‍💻 Getting Started

### 1️⃣ Clone the repository

```bash
git clone https://github.com/uwblueprint/bobatalks-flowers.git
cd bobatalks-flowers
```

### 2️⃣ Install dependencies

```bash
npm ci
```

### 3️⃣ Set up environment variables

```bash
cp .env.example .env
```

_Fill in the placeholder values_

### 4️⃣ Run code quality checks locally

```bash
npm run lint
npm run format -- --check .
npx tsc --noEmit
```

If these three pass, your setup is perfect ✅.

---

## 🥪 Verifying Pre-commit Hooks

We use **Husky** + **lint-staged** to enforce formatting before commits.

Test it:

```bash
git add .
git commit -m "test: check husky hook"
```

Expected: Prettier and ESLint run automatically before committing.

If hooks don’t run:

```bash
npx husky install
```

---

## 🧱 Continuous Integration (CI)

Every push and PR triggers **GitHub Actions** to run:

- ✅ Linting (`npm run lint`)
- ✅ Formatting check (`npm run format -- --check .`)
- ✅ TypeScript check (`npx tsc --noEmit`)

PRs can’t be merged unless these checks pass.

To simulate CI locally:

```bash
npm ci
npm run lint
npm run format -- --check .
npx tsc --noEmit
```

---

## 🔧 Common Fix Commands

| Issue                        | Fix                                                 |
| ---------------------------- | --------------------------------------------------- |
| ESLint errors                | `npm run lint --fix`                                |
| Prettier issues              | `npm run format`                                    |
| Husky hook not running       | `npx husky install`                                 |
| TypeScript “No inputs found” | Create a `src/` folder or place `.ts` files at root |

---

## 👩‍💻 Contributing Guidelines

1. Create a new branch:

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Commit using [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat:` → new feature
   - `fix:` → bug fix
   - `chore:` → tooling / configs

3. Push and open a PR — CI must pass before merging.

---

## 🧮 Scripts Summary

| Command                       | Description                           |
| ----------------------------- | ------------------------------------- |
| `npm run lint`                | Run ESLint                            |
| `npm run format`              | Format with Prettier                  |
| `npm run format -- --check .` | Check Prettier formatting (read-only) |
| `npx tsc --noEmit`            | Type-check only                       |
| `npx husky install`           | Reinstall Git hooks                   |
| `npm run dev`                 | Run Discord bot in dev mode           |
| `npm run build`               | Build TypeScript to JavaScript        |
| `npm run register`            | Register Discord slash commands       |
| `npm start`                   | Run built Discord bot                 |

---

## 🤖 Discord Bot

The Discord bot code is located in `src/bot/`. See [src/bot/README.md](src/bot/README.md) for detailed bot documentation.

---

## 🚀 Deployment to EC2

The bot auto-deploys daily at **4 AM Toronto time** (9 AM UTC) via GitHub Actions.

### Prerequisites

**1. Add GitHub Secrets** (`Settings → Secrets and variables → Actions`):

- `EC2_HOST` → Your EC2 IP address
- `EC2_SSH_KEY` → Your entire `.pem` file contents

**2. Setup EC2** (one-time):

```bash
ssh -i your-key.pem ubuntu@your-ec2-ip

# Install Node.js 20 & PM2
sudo apt-get update
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pm2

# Setup project
mkdir -p ~/bobatalks/logs
cd ~/bobatalks

# Create .env file
nano .env
# Add: DISCORD_TOKEN=... and DISCORD_CLIENT_ID=...

# Enable PM2 on boot
pm2 startup systemd -u ubuntu --hp /home/ubuntu
# Run the sudo command that PM2 prints
```

**3. Deploy**:

- **Auto**: Pushes to `main` deploy at 4 AM daily
- **Manual**: GitHub → Actions → "Deploy BobaTalks" → Run workflow

**4. Register commands** (after first deploy):

```bash
ssh -i your-key.pem ubuntu@your-ec2-ip
cd ~/bobatalks
node dist/bot/registerCommands.js
pm2 logs bobatalks
```

### Useful PM2 Commands

```bash
pm2 status              # Check status
pm2 logs bobatalks      # View logs
pm2 restart bobatalks   # Restart
pm2 reload bobatalks    # Zero-downtime reload
```

---

> 💡 _Run this one-liner to confirm everything works:_
>
> ```bash
> npm run lint && npm run format -- --check . && npx tsc --noEmit
> ```
>
> ✅ If you see no output — congrats, your setup is perfect!
