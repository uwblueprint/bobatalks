import {
  Message,
  EmbedBuilder,
  TextChannel,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  MessageActionRowComponentBuilder,
  ButtonInteraction,
  Guild,
} from 'discord.js';

import { updateFlower } from './googleSheetsService.js';

/**
 * Checks if a message should go through moderation workflow.
 * This happens when a flower entry has consent for website publishing.
 *
 * Note: This function is called by the flower submission process directly
 * when a user provides consent for website publishing.
 */
export async function handleFlowerChannelMessage(message: Message) {
  // Ignore bot messages
  if (message.author.bot) return;

  // Check if this is the test flowers channel
  // You can configure this channel name via environment variable
  const flowersChannelName = process.env.FLOWERS_CHANNEL_NAME || 'test-flowers';
  if (message.channel.type !== 0 || message.channel.name !== flowersChannelName) {
    return;
  }

  // Check if the message is from a flower submission (has an embed with flower data)
  if (message.embeds.length === 0) return;

  const embed = message.embeds[0];
  // Check if this is a flower embed (has the flower title and footer)
  if (
    !embed.title?.includes('New Flower Submission') ||
    !embed.footer?.text?.includes('Flower ID:')
  ) {
    return;
  }

  // Extract flower ID from footer
  const footerText = embed.footer.text;
  const flowerIdMatch = footerText.match(/Flower ID: ([a-f0-9-]+)/i);
  if (!flowerIdMatch) {
    console.warn('Could not extract flower ID from embed footer');
    return;
  }

  const flowerId = flowerIdMatch[1];

  // Send to moderation workflow channel
  await sendToModerationWorkflow(message, flowerId);
}

/**
 * Posts the flower submission to the moderation-workflow channel for approval.
 * Can be called directly with flower data or from a message.
 */
async function sendToModerationWorkflow(message: Message, flowerId: string) {
  if (!message.guild) return;

  try {
    // Find the moderation-workflow channel
    const modChannel = message.guild.channels.cache.find(
      (channel) => channel.name === 'moderation-workflow' && channel.isTextBased(),
    ) as TextChannel | undefined;

    if (!modChannel) {
      console.warn(
        'moderation-workflow channel not found. Please create a private channel named "moderation-workflow" for moderation.',
      );
      return;
    }

    const embed = message.embeds[0];
    const messageContent = embed.description || 'No content';
    const submittedBy = embed.fields?.find((f) => f.name === 'Submitted by')?.value || 'Unknown';
    const imageUrl = embed.image?.url;
    const discordUsername = message.author.username;

    // Create moderation embed similar to flowers-mod style
    const modEmbed = new EmbedBuilder()
      .setColor('#FFD700') // Gold color for moderation
      .setTitle('🔍 Jump to Message →')
      .setURL(message.url)
      .addFields(
        {
          name: '📛 Submitted by',
          value: `${discordUsername} (Display: ${submittedBy})`,
          inline: true,
        },
        {
          name: '⏰ Submitted at',
          value: `<t:${Math.floor(message.createdTimestamp / 1000)}:F>`,
          inline: false,
        },
        {
          name: '📝 Message Content',
          value:
            messageContent.length > 1024
              ? messageContent.substring(0, 1021) + '...'
              : messageContent,
          inline: false,
        },
        {
          name: '📊 Status',
          value: '⏳ Awaiting moderation decision',
          inline: false,
        },
      )
      .setFooter({
        text: `Flower ID: ${flowerId} | Requires approval for website publication`,
      })
      .setTimestamp();

    // Embed the image if one was attached
    if (imageUrl) {
      modEmbed.setImage(imageUrl);
    }

    // Create approve/decline buttons
    const buttons = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`moderationApprove_${flowerId}`)
        .setLabel('✅ Approve for Website')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`moderationDecline_${flowerId}`)
        .setLabel('❌ Decline')
        .setStyle(ButtonStyle.Danger),
    );

    await modChannel.send({
      content: '🌸 **New Flower Submission for Review**',
      embeds: [modEmbed],
      components: [buttons],
    });

    console.log(`Posted flower ${flowerId} to moderation workflow channel`);
  } catch (error) {
    console.error('Error sending to moderation workflow:', error);
  }
}

/**
 * Sends a flower submission directly to the moderation workflow.
 * This is called from the flower submission process when a user provides consent.
 */
export async function sendFlowerToModeration(
  guild: Guild | null,
  flowerId: string,
  messageUrl: string,
  messageContent: string,
  submittedBy: string,
  discordUsername: string,
  imageUrl?: string,
  timestamp?: Date,
) {
  if (!guild) {
    console.warn('Cannot send to moderation: guild is null');
    return;
  }

  try {
    // Find the moderation-workflow channel
    const modChannel = guild.channels.cache.find(
      (channel) => channel.name === 'moderation-workflow' && channel.isTextBased(),
    ) as TextChannel | undefined;

    if (!modChannel) {
      console.warn(
        'moderation-workflow channel not found. Please create a private channel named "moderation-workflow" for moderation.',
      );
      return;
    }

    // Create moderation embed similar to flowers-mod style
    const modEmbed = new EmbedBuilder()
      .setColor('#FFD700') // Gold color for moderation
      .setTitle('🔍 Jump to Message →')
      .setURL(messageUrl)
      .addFields(
        {
          name: '📛 Submitted by',
          value: `${discordUsername} (Display: ${submittedBy})`,
          inline: true,
        },
        {
          name: '⏰ Submitted at',
          value: `<t:${Math.floor((timestamp || new Date()).getTime() / 1000)}:F>`,
          inline: false,
        },
        {
          name: '📝 Message Content',
          value:
            messageContent.length > 1024
              ? messageContent.substring(0, 1021) + '...'
              : messageContent,
          inline: false,
        },
        {
          name: '📊 Status',
          value: '⏳ Awaiting moderation decision',
          inline: false,
        },
      )
      .setFooter({
        text: `Flower ID: ${flowerId} | Requires approval for website publication`,
      })
      .setTimestamp();

    // Embed the image if one was attached
    if (imageUrl) {
      modEmbed.setImage(imageUrl);
    }

    // Create approve/decline buttons
    const buttons = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`moderationApprove_${flowerId}`)
        .setLabel('✅ Approve for Website')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`moderationDecline_${flowerId}`)
        .setLabel('❌ Decline')
        .setStyle(ButtonStyle.Danger),
    );

    await modChannel.send({
      content: '🌸 **New Flower Submission for Review**',
      embeds: [modEmbed],
      components: [buttons],
    });

    console.log(`Posted flower ${flowerId} to moderation workflow channel`);
  } catch (error) {
    console.error('Error sending to moderation workflow:', error);
  }
}

/**
 * Handles the approve button click in the moderation workflow.
 */
export async function handleModerationApprove(interaction: ButtonInteraction) {
  const customId = interaction.customId;
  if (!customId.startsWith('moderationApprove_')) return;

  const flowerId = customId.replace('moderationApprove_', '');

  try {
    // Defer the reply to give us time to process
    await interaction.deferUpdate();

    // Update the flower in Google Sheets to set approved = true
    await updateFlower(flowerId, 'approved', 'true');

    // Update the message to show it's been approved
    const originalEmbed = interaction.message.embeds[0];
    const updatedEmbed = EmbedBuilder.from(originalEmbed)
      .setColor('#00FF00') // Green for approved
      .spliceFields(3, 1, {
        name: '📊 Status',
        value: `✅ **APPROVED** by <@${interaction.user.id}> at <t:${Math.floor(Date.now() / 1000)}:F>`,
        inline: false,
      });

    await interaction.editReply({
      content: '✅ **Approved for Website Publication**',
      embeds: [updatedEmbed],
      components: [], // Remove buttons after action
    });

    console.log(`Flower ${flowerId} approved by ${interaction.user.username}`);
  } catch (error) {
    console.error('Error approving flower:', error);
    await interaction.followUp({
      content: '❌ An error occurred while approving this flower. Please try again.',
      ephemeral: true,
    });
  }
}

/**
 * Handles the decline button click in the moderation workflow.
 */
export async function handleModerationDecline(interaction: ButtonInteraction) {
  const customId = interaction.customId;
  if (!customId.startsWith('moderationDecline_')) return;

  const flowerId = customId.replace('moderationDecline_', '');

  try {
    // Defer the reply to give us time to process
    await interaction.deferUpdate();

    // Update the flower in Google Sheets to set approved = false (it already defaults to false, but we'll be explicit)
    await updateFlower(flowerId, 'approved', 'false');

    // Update the message to show it's been declined
    const originalEmbed = interaction.message.embeds[0];
    const updatedEmbed = EmbedBuilder.from(originalEmbed)
      .setColor('#FF0000') // Red for declined
      .spliceFields(3, 1, {
        name: '📊 Status',
        value: `❌ **DECLINED** by <@${interaction.user.id}> at <t:${Math.floor(Date.now() / 1000)}:F>`,
        inline: false,
      });

    await interaction.editReply({
      content: '❌ **Declined for Website Publication**',
      embeds: [updatedEmbed],
      components: [], // Remove buttons after action
    });

    console.log(`Flower ${flowerId} declined by ${interaction.user.username}`);
  } catch (error) {
    console.error('Error declining flower:', error);
    await interaction.followUp({
      content: '❌ An error occurred while declining this flower. Please try again.',
      ephemeral: true,
    });
  }
}
