import 'dotenv/config';

import { Client, Events, GatewayIntentBits, Interaction, MessageFlags } from 'discord.js';

import {
  flowerCommand,
  handleFlowerModalSubmit,
  handleFlowerConsentButton,
  handleFlowerShareUsernameButton,
} from './commands/flower.js';
import {
  handleFlowerChannelMessage,
  handleModerationApprove,
  handleModerationDecline,
} from './moderationWorkflow.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    // GatewayIntentBits.GuildMembers, // Uncomment if you enable this privileged intent in Discord Developer Portal
  ],
});

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Logged in as ${c.user.tag}`);
  console.log(`📊 Serving ${c.guilds.cache.size} server(s)`);
});

// Listen for messages in the flowers channel for moderation workflow
client.on(Events.MessageCreate, async (message) => {
  try {
    await handleFlowerChannelMessage(message);
  } catch (error) {
    console.error('Error handling flower channel message:', error);
  }
});

client.on('interactionCreate', async (interaction: Interaction) => {
  // Handle button interactions
  if (interaction.isButton()) {
    try {
      if (interaction.customId.startsWith('flowerConsent_')) {
        await handleFlowerConsentButton(interaction);
      } else if (interaction.customId.startsWith('flowerShareUsername_')) {
        await handleFlowerShareUsernameButton(interaction);
      } else if (interaction.customId.startsWith('moderationApprove_')) {
        await handleModerationApprove(interaction);
      } else if (interaction.customId.startsWith('moderationDecline_')) {
        await handleModerationDecline(interaction);
      }
    } catch (error) {
      console.error('Error handling button interaction:', error);
      try {
        if (interaction.deferred) {
          await interaction.editReply({
            content: 'An error occurred while processing your interaction.',
            components: [],
          });
        } else if (!interaction.replied) {
          await interaction.reply({
            content: 'An error occurred while processing your interaction.',
            flags: MessageFlags.Ephemeral,
          });
        } else {
          await interaction.followUp({
            content: 'An error occurred while processing your interaction.',
            flags: MessageFlags.Ephemeral,
          });
        }
      } catch (replyError) {
        // If we can't reply (e.g., interaction expired), just log it
        console.error('Error sending error message to user:', replyError);
      }
    }
    return;
  }

  // Handle modal submissions
  if (interaction.isModalSubmit()) {
    try {
      if (interaction.customId === 'flowerModal') {
        await handleFlowerModalSubmit(interaction);
      }
    } catch (error) {
      console.error('Error handling modal submission:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'An error occurred while processing your submission.',
          flags: MessageFlags.Ephemeral,
        });
      }
    }
    return;
  }

  // Handle slash commands
  if (!interaction.isChatInputCommand()) return;

  try {
    switch (interaction.commandName) {
      case 'flower':
        await flowerCommand(interaction);
        break;
      default:
        await interaction.reply({ content: 'Unknown command!', flags: MessageFlags.Ephemeral });
    }
  } catch (error) {
    console.error('Error handling command:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred while executing this command.',
        flags: MessageFlags.Ephemeral,
      });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
