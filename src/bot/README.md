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

| Command       | Description                                                                                                    |
| ------------- | -------------------------------------------------------------------------------------------------------------- |
| `/ping`       | Health check - replies with "🏓 Pong!"                                                                         |
| `/serverinfo` | Displays server statistics (name, member count, creation date)                                                 |
| `/userinfo`   | Shows information about a user (or yourself)                                                                   |
| `/poll`       | Creates an interactive poll with up to 5 options                                                               |
| `/welcome`    | Sends a welcome message to a user                                                                              |
| `/flower`     | Submit a flower 💐 — supports mentions, image attachments, website consent, and a draft preview before posting |

The bot listens for slash command interactions and responds accordingly. It includes error handling and uses embeds for formatted responses.

### 🌸 Flower Command Details

The `/flower` command opens an interactive modal form where users can submit messages of celebration, acknowledgement, or encouragement.

**Options (set before the modal opens):**

| Option         | Type                  | Description                                              |
| -------------- | --------------------- | -------------------------------------------------------- |
| `mention_user` | User (optional)       | Who the flower is for — enables a real ping notification |
| `image`        | Attachment (optional) | Image to include with the flower                         |

**Modal fields:**

| Field        | Required | Description                                                           |
| ------------ | -------- | --------------------------------------------------------------------- |
| Your Message | Yes      | The flower message (10–1000 characters)                               |
| Your Name    | No       | Display name — leave blank to post anonymously or as Discord username |

**Submission flow:**

1. Run `/flower` (optionally select `mention_user` and/or attach an image)
2. Fill out the modal
3. Answer whether to share your Discord username (if no name provided) and consent to website feature
4. **Review the final preview** — shows author, ping target, website consent, and image status
5. Click **Confirm & Post**, **Edit** (reopens modal with prefilled values), or **Cancel**

**Mention system:**

- Select `mention_user` to ping someone — the bot guarantees a real notification fires
- Use `@name` in your message to place the mention inline; the bot fuzzy-matches against the selected user's username, display name, and server nickname (supports Latin, CJK, Cyrillic)
- If no `@token` matches closely, the mention is appended at the end automatically

**Other features:**

- Content filter (profanity) on message and name fields
- Auto-reacts with 🌸 on the public post
- Custom emoji shortcodes (`:meow_wow:`) are resolved to proper Discord tokens before posting
- External server emoji tokens are stripped (bot can only render emojis from its own servers)
- All submissions logged to `flowers-mod` channel for admin auditing
- Approved submissions sent to `#moderation-workflow` for website review

**Example messages:**

- "I finally landed my first internship!"
- "Flowers to @jeff for the new job and completing his move!!"

#### 🔐 Setting Up the Flowers-Mod Channel (Admin Only)

To enable admin logging and prevent spam/abuse of the flower command, create a private moderation channel.

##### Step-by-Step Setup Instructions:

**1. Create a channel named "flowers-mod" in your Discord server**

**2. Configure channel permissions to make it private:**

- Go to Channel Settings → Permissions
- Click on `@everyone` and set "View Channel" to ❌ (red X/deny)
- Click "+ Add members or roles"
- Select your admin/moderator role(s)
- For each admin role, grant these permissions (set to ✅ green checkmark):
  - View Channel
  - Read Message History (so they can see past logs)
  - Send Messages (optional, for adding notes)

**3. Ensure the bot has permissions in this channel:**

- In the same Permissions settings, click "+ Add members or roles"
- Add your bot's role
- Grant the bot these permissions (set to ✅ green checkmark):
  - View Channel
  - Send Messages
  - Embed Links

##### Permission Visibility Explanation:

Discord channels use permission overwrites to control access. When you remove `@everyone`'s "View Channel" permission, the channel becomes **hidden from regular members**. Only users/roles with explicit "View Channel" permission can see it. This ensures that only admins/mods you designate can view the flower usage logs.

##### What Gets Logged:

Every time someone uses `/flower`, the bot sends a streamlined log to `flowers-mod` containing:

- **Clickable title** that links directly to the public flower message (click "🔍 Jump to message →")
- Full username (to identify who sent it)
- Display name (shows if they're anonymous or what name they provided)
- Exact timestamp (for tracking submission patterns)
- Full message content (to detect spam or inappropriate content)
- **Embedded image** (the actual image displayed right in the log for easy debugging)
- Flower ID from Google Sheets (for cross-referencing)

##### Why This Matters:

- **Spam Prevention**: Track if someone is overusing the command
- **Anonymous Accountability**: Even anonymous submissions are logged for admins
- **Audit Trail**: Full traceability for moderation purposes
- **Privacy**: Only designated admins can see this sensitive information

---

## 📚 Resources

- [discord.js Documentation](https://discord.js.org/)
- [Discord Developer Portal](https://discord.com/developers/applications)
