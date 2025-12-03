# 🤖 BobaTalks Discord Bot

A lightweight Discord bot built with discord.js v14 and TypeScript.

---

## 🚀 Running Locally

### 1. Configure Environment Variables

Create a `.env` file in the project root:

```bash
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_client_id_here
GUILD_ID=your_guild_id_here
```

**How to get these values:**

1. **DISCORD_TOKEN & CLIENT_ID**:
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Select your application (or create one)
   - **CLIENT_ID**: Copy from "General Information" → "Application ID"
   - **DISCORD_TOKEN**: Go to "Bot" tab → "Reset Token" or "Copy"

2. **GUILD_ID** (Server ID):
   - Enable Developer Mode: Discord Settings → Advanced → Developer Mode ✅
   - Right-click your server → "Copy Server ID"

### 2. Install Dependencies

```bash
npm ci
```

### 3. Google Drive Setup (Optional)

To enable image uploads for the `/flower` command, you need to generate a Google Refresh Token.

1. Ensure `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set in your `.env` file.
2. Run the auth setup script:

```bash
npx tsx src/bot/setupGoogleAuth.ts
```

3. Follow the URL, authorize the app, and paste the code back into the terminal.
4. Add the generated `GOOGLE_REFRESH_TOKEN` to your `.env` file.

**Token Expiration:**
Refresh tokens are long-lived but may expire if:

- The Google Cloud app is in "Testing" status (expires in 7 days).
- You manually revoke access in your Google Account.
- The token is unused for 6 months.
- The limit of 50 tokens per user account is exceeded.
- The password for your Google account is reset

If your token stops working, simply run the script again to generate a new one.

### 4. Register Commands (First Time Only)

```bash
npm run register
```

### 5. Start the Bot

**Development mode** (auto-reload):

```bash
npm run dev
```

**Production mode**:

```bash
npm run build
npm start
```

---

## 📋 What This Bot Does

The bot currently supports the following slash commands:

| Command       | Description                                                                          |
| ------------- | ------------------------------------------------------------------------------------ |
| `/ping`       | Health check - replies with "🏓 Pong!"                                               |
| `/serverinfo` | Displays server statistics (name, member count, creation date)                       |
| `/userinfo`   | Shows information about a user (or yourself)                                         |
| `/poll`       | Creates an interactive poll with up to 5 options                                     |
| `/welcome`    | Sends a welcome message to a user                                                    |
| `/flower`     | Submit a flower 💐 - a message of acknowledgement, congratulations, or encouragement |

The bot listens for slash command interactions and responds accordingly. It includes error handling and uses embeds for formatted responses.

### 🌸 Flower Command Details

The `/flower` command opens an interactive modal form where users can submit messages of celebration, acknowledgement, or encouragement. This replicates the BobaTalks Google Form experience.

**Features:**

- **Message Field** (Required): Your celebration or acknowledgement message (10-1000 characters)
- **Name Field** (Optional): Your name or leave blank to remain anonymous
- **Image URL** (Optional): Link to your photo or any image (dog, graphic, etc.)
- **Content Validation**: Simple profanity filter to keep messages positive and respectful
- **Public Posting**: Submissions are posted to the channel with a beautiful embed
- **Agreement**: By submitting, users agree to be featured on the BobaTalks website
- **Admin Logging**: All submissions are logged to the `flowers-mod` channel for spam prevention and auditing

**Example Uses:**

- "I finally landed my first internship!"
- "Shoutout to Eileen for being so supportive at my event last weekend!"

#### 🔐 Setting Up the Flowers-Mod Channel (Admin Only)

To enable admin logging and prevent spam/abuse of the flower command, create a private moderation channel:

1. **Create the Channel:**
   - Create a new text channel named exactly `flowers-mod` in your Discord server

2. **Make it Private (Admin-Only):**
   - Go to Channel Settings → Permissions
   - Click on `@everyone` and set "View Channel" to ❌ (red X/deny)
   - Click "+ Add members or roles"
   - Add your admin/moderator roles
   - For each admin role, set these permissions to ✅ (green checkmark):
     - View Channel
     - Read Message History
     - Send Messages (optional, for notes)

3. **Grant Bot Access:**
   - In the same Permissions settings, add your bot's role
   - Grant these permissions to the bot:
     - View Channel ✅
     - Send Messages ✅
     - Embed Links ✅

**What Gets Logged:**

Every time someone uses `/flower`, the bot sends a streamlined log to `flowers-mod` containing:

- **Clickable title** that links directly to the public flower message (click "🔍 Jump to message →")
- Full username (to identify who sent it)
- Display name (shows if they're anonymous or what name they provided)
- Exact timestamp (for tracking submission patterns)
- Full message content (to detect spam or inappropriate content)
- **Embedded image** (the actual image displayed right in the log for easy debugging)
- Flower ID from Google Sheets (for cross-referencing)

**Why This Matters:**

- **Spam Prevention**: Track if someone is overusing the command
- **Anonymous Accountability**: Even anonymous submissions are logged for admins
- **Audit Trail**: Full traceability for moderation purposes
- **Privacy**: Only designated admins can see this sensitive information

---

## 📚 Resources

- [discord.js Documentation](https://discord.js.org/)
- [Discord Developer Portal](https://discord.com/developers/applications)
