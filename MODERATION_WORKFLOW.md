# Moderation Workflow

## Overview

The moderation workflow system automatically routes flower submissions that have website consent to a private moderation channel for approval before they appear on the BobaTalks website.

## How It Works

### 1. Flower Submission with Consent

When a user submits a flower using the `/flower` command and provides consent for website publication:

1. The flower is posted to the public flowers channel (e.g., `test-flowers`)
2. The flower data is saved to Google Sheets with `website: true` and `approved: false`
3. An entry is logged to the `flowers-mod` channel for audit purposes
4. **NEW**: The flower is automatically sent to the `moderation-workflow` channel for approval

### 2. Moderation Channel

The `moderation-workflow` channel displays pending flowers with:

- **Flower ID**: Unique identifier for tracking
- **Submitted by**: Display name (or "Anonymous")
- **Original Message**: Link to jump to the public post
- **Timestamp**: When the flower was submitted
- **Message Content**: The full flower message
- **Image**: If an image was attached
- **Status**: Current approval status
- **Action Buttons**:
  - ✅ **Approve for Website**: Marks the flower as approved
  - ❌ **Decline**: Keeps the flower declined (not approved)

### 3. Approval Actions

When a moderator clicks a button:

#### Approve (✅)

- Updates the Google Sheets entry: `approved: true`
- Changes the embed color to green
- Updates the status field to show who approved and when
- Removes the action buttons
- Logs the approval action

#### Decline (❌)

- Updates the Google Sheets entry: `approved: false`
- Changes the embed color to red
- Updates the status field to show who declined and when
- Removes the action buttons
- Logs the decline action

### 4. Google Sheets Integration

The moderation workflow updates the `approved` field in the Google Sheets:

| Field         | Description                                                  |
| ------------- | ------------------------------------------------------------ |
| `id`          | Unique flower ID (UUID)                                      |
| `name`        | Optional display name                                        |
| `username`    | Optional Discord username                                    |
| `message`     | Flower message content                                       |
| `picture`     | Google Drive image URL (if provided)                         |
| `website`     | Whether user consented to website publication                |
| `approved`    | Whether moderator approved for website (updated by workflow) |
| `lastUpdated` | Timestamp of last update                                     |

## Setup Requirements

### 1. Create Required Channels

In your Discord server, create these private channels:

- **`moderation-workflow`**: Where pending flowers appear for approval
  - Should be restricted to moderators/admins only
  - This is where the approval workflow happens

- **`flowers-mod`**: Audit log for all flower submissions
  - Should be restricted to moderators/admins only
  - Already exists in your setup

### 2. Bot Permissions

The bot needs these intents enabled:

- `GatewayIntentBits.Guilds`
- `GatewayIntentBits.GuildMessages` (NEW)
- `GatewayIntentBits.MessageContent` (NEW - requires privileged intent)

⚠️ **Important**: You must enable the "Message Content Intent" in the Discord Developer Portal:

1. Go to https://discord.com/developers/applications
2. Select your bot application
3. Go to "Bot" settings
4. Enable "Message Content Intent" under "Privileged Gateway Intents"

### 3. Environment Variables

You can optionally configure the flowers channel name:

```env
FLOWERS_CHANNEL_NAME=test-flowers  # Default if not set
```

## Usage Flow Example

1. **User submits a flower**:

   ```
   /flower
   [Fills out modal with message and optional name]
   [Clicks "Yes" for website consent]
   ```

2. **Bot actions**:
   - Posts flower to `test-flowers` channel
   - Logs to `flowers-mod` channel
   - **Sends to `moderation-workflow` channel with approval buttons**

3. **Moderator reviews**:
   - Sees the flower in `moderation-workflow`
   - Reviews content and image
   - Clicks ✅ Approve or ❌ Decline

4. **Result**:
   - Google Sheets `approved` field is updated
   - Moderation message is updated with decision
   - Website can query only approved flowers

## Website Integration

When building the BobaTalks website, query the Google Sheets API for flowers where:

- `website = true` (user gave consent)
- `approved = true` (moderator approved)

This ensures only properly vetted content appears on the public website.

## Files Modified

- `src/bot/index.ts`: Added message event listener and button handlers
- `src/bot/commands/flower.ts`: Added call to moderation workflow on consent
- `src/bot/moderationWorkflow.ts`: **NEW** - Complete moderation workflow logic
- `src/bot/googleSheetsService.ts`: Already has `updateFlower()` function for approval updates

## Testing

To test the workflow:

1. Ensure `moderation-workflow` channel exists in your test server
2. Run `/flower` command
3. Provide consent for website publication
4. Check that the flower appears in `moderation-workflow` with buttons
5. Click "Approve" or "Decline"
6. Verify the Google Sheets entry is updated correctly

## Future Enhancements

Possible improvements:

- Add reason field for decline decisions
- Implement edit/revision workflow
- Add bulk approval/decline actions
- Create moderation dashboard with statistics
- Add notification to submitter when approved/declined
