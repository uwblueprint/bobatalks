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

### 3. Register Commands (First Time Only)

```bash
npm run register
```

### 4. Start the Bot

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

**Example Uses:**

- "I finally landed my first internship!"
- "Shoutout to Eileen for being so supportive at my event last weekend!"

---

## 📚 Resources

- [discord.js Documentation](https://discord.js.org/)
- [Discord Developer Portal](https://discord.com/developers/applications)
