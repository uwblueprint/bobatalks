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

export interface ModerationFlowerData {
  flowerId: string;
  messageUrl: string;
  messageContent: string;
  flowersDisplayName: string;
  discordUsername: string;
  userId: string;
  serverNickname: string;
  avatarUrl: string;
  imageUrl?: string | undefined;
  timestamp?: Date | undefined;
}

function findGuildEmoji(guild: Guild, name: string): string {
  const emoji = guild.emojis.cache.find((e) => e.name === name);
  return emoji ? `${emoji} ` : '';
}

export async function sendFlowerToModeration(guild: Guild | null, data: ModerationFlowerData) {
  if (!guild) {
    console.warn('Cannot send to moderation: guild is null');
    return;
  }

  try {
    const modChannel = guild.channels.cache.find(
      (channel) => channel.name === 'moderation-workflow' && channel.isTextBased(),
    ) as TextChannel | undefined;

    if (!modChannel) {
      console.warn(
        'moderation-workflow channel not found. Please create a private channel named "moderation-workflow" for moderation.',
      );
      return;
    }

    const modmailEmoji = findGuildEmoji(guild, 'modmail_BT') || '📢 ';

    const authorName = `${data.serverNickname} (@${data.discordUsername}) || ${data.flowersDisplayName}`;

    const messageLink = `[Message →](${data.messageUrl})`;
    const truncatedContent =
      data.messageContent.length > 1024
        ? data.messageContent.substring(0, 1021) + '...'
        : data.messageContent;

    const modEmbed = new EmbedBuilder()
      .setColor('#FFD700')
      .setAuthor({ name: authorName, iconURL: data.avatarUrl })
      .addFields(
        {
          name: '🏵 Pending',
          value: 'Needs Review',
          inline: true,
        },
        {
          name: `${modmailEmoji}Message`,
          value: `${messageLink}\n${truncatedContent}`,
          inline: false,
        },
      )
      .setFooter({ text: `🌸 ID: ${data.flowerId}` })
      .setTimestamp(data.timestamp || new Date());

    if (data.imageUrl) {
      modEmbed.setImage(data.imageUrl);
    }

    const buttons = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`moderationApprove_${data.flowerId}`)
        .setLabel('✅ Approve for Website')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`moderationDecline_${data.flowerId}`)
        .setLabel('❌ Decline')
        .setStyle(ButtonStyle.Danger),
    );

    await modChannel.send({
      embeds: [modEmbed],
      components: [buttons],
    });

    console.log(`Posted flower ${data.flowerId} to moderation workflow channel`);
  } catch (error) {
    console.error('Error sending to moderation workflow:', error);
  }
}

export async function handleModerationApprove(interaction: ButtonInteraction) {
  const customId = interaction.customId;
  if (!customId.startsWith('moderationApprove_')) return;

  const flowerId = customId.replace('moderationApprove_', '');

  try {
    await interaction.deferUpdate();
    await updateFlower(flowerId, 'approved', 'true');

    const originalEmbed = interaction.message.embeds[0];
    const updatedEmbed = EmbedBuilder.from(originalEmbed)
      .setColor('#00FF00')
      .spliceFields(0, 1, {
        name: '✅ Approved',
        value: `<t:${Math.floor(Date.now() / 1000)}:F> | Reviewed by <@${interaction.user.id}>`,
        inline: false,
      });

    await interaction.editReply({
      embeds: [updatedEmbed],
      components: [],
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

export async function handleModerationDecline(interaction: ButtonInteraction) {
  const customId = interaction.customId;
  if (!customId.startsWith('moderationDecline_')) return;

  const flowerId = customId.replace('moderationDecline_', '');

  try {
    await interaction.deferUpdate();
    await updateFlower(flowerId, 'approved', 'false');

    const originalEmbed = interaction.message.embeds[0];
    const updatedEmbed = EmbedBuilder.from(originalEmbed)
      .setColor('#FF0000')
      .spliceFields(0, 1, {
        name: '❌ Declined',
        value: `<t:${Math.floor(Date.now() / 1000)}:F> | Reviewed by <@${interaction.user.id}>`,
        inline: false,
      });

    await interaction.editReply({
      embeds: [updatedEmbed],
      components: [],
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
