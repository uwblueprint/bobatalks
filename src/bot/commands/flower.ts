import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ModalSubmitInteraction,
  EmbedBuilder,
  ModalActionRowComponentBuilder,
  MessageActionRowComponentBuilder,
  MessageFlags,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  TextChannel,
  Guild,
} from 'discord.js';
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity';

import { saveDiscordImageToDrive } from '../googleDriveImages.js';
import { createFlower, deleteFlower } from '../googleSheetsService.js';
import { sendFlowerToModeration } from '../moderationWorkflow.js';

export const flower = new SlashCommandBuilder()
  .setName('flower')
  .setDescription(
    'Submit a flower 💐 - a message of acknowledgement, congratulations, or encouragement',
  )
  .addAttachmentOption((option) =>
    option
      .setName('image')
      .setDescription('Upload an image (PNG, JPEG, etc.) - optional')
      .setRequired(false),
  );

// Content filter using obscenity library
const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

function containsInappropriateContent(text: string): boolean {
  return matcher.hasMatch(text);
}

/**
 * Logs flower command usage to the private flowers-mod channel for admin auditing.
 * This helps prevent spam and tracks anonymous submissions.
 */
async function logFlowerUsageToModChannel(
  guild: Guild | null,
  logData: {
    username: string;
    discriminator: string;
    timestamp: Date;
    message: string;
    nameProvided?: string;
    flowerId?: string;
    messageUrl?: string;
    imageUrl?: string;
  },
) {
  if (!guild) {
    console.warn('Cannot log flower usage: guild is null');
    return;
  }

  try {
    // Find the flowers-mod channel
    const modChannel = guild.channels.cache.find(
      (channel) => channel.name === 'flowers-mod' && channel.isTextBased(),
    ) as TextChannel | undefined;

    if (!modChannel) {
      console.warn(
        'flowers-mod channel not found. Please create a private channel named "flowers-mod" for logging.',
      );
      return;
    }

    // Create audit log embed
    const logEmbed = new EmbedBuilder()
      .setColor('#FFA500') // Orange color for mod logs
      .setTitle(logData.messageUrl ? '🔍 Jump to message →' : '🔍 Flower Command Usage Log')
      .setURL(logData.messageUrl || null)
      .addFields(
        {
          name: '📛 Username',
          value:
            logData.discriminator === '0'
              ? logData.username
              : `${logData.username}#${logData.discriminator}`,
          inline: true,
        },
        {
          name: '🏷️ Display Name',
          value: logData.nameProvided || '_(Anonymous)_',
          inline: true,
        },
        {
          name: '⏰ Timestamp',
          value: `<t:${Math.floor(logData.timestamp.getTime() / 1000)}:F>`,
          inline: false,
        },
        {
          name: '📝 Message Content',
          value:
            logData.message.length > 1024
              ? logData.message.substring(0, 1021) + '...'
              : logData.message,
          inline: false,
        },
      )
      .setFooter({
        text: `Flower ID: ${logData.flowerId || 'N/A'} | For admin use only`,
      })
      .setTimestamp();

    // Embed the image if one was attached
    if (logData.imageUrl) {
      logEmbed.setImage(logData.imageUrl);
    }

    await modChannel.send({ embeds: [logEmbed] });
  } catch (error) {
    console.error('Error logging flower usage to mod channel:', error);
  }
}

// Temporary storage for image attachments and submission data (userId -> data)
const pendingSubmissions = new Map<
  string,
  {
    attachment?: { url: string; contentType: string; filename: string };
    message: string;
    name: string;
    username: string;
    hasConsent?: boolean;
    shareDiscordUsername?: boolean;
  }
>();

export async function flowerCommand(interaction: ChatInputCommandInteraction) {
  // Get the attachment if provided
  const attachment = interaction.options.getAttachment('image');

  // Validate attachment is an image if provided
  if (attachment) {
    const contentType = attachment.contentType || '';
    if (!contentType.startsWith('image/')) {
      await interaction.reply({
        content: '❌ Please upload an image file (PNG, JPEG, etc.).',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Store attachment data for later use in modal submit
    pendingSubmissions.set(interaction.user.id, {
      attachment: {
        url: attachment.url,
        contentType: attachment.contentType || 'image/png',
        filename: attachment.name,
      },
      message: '',
      name: '',
      username: interaction.user.username,
    });
  } else {
    // Initialize with no attachment
    pendingSubmissions.set(interaction.user.id, {
      message: '',
      name: '',
      username: interaction.user.username,
    });
  }

  // Create modal form
  const modal = new ModalBuilder().setCustomId('flowerModal').setTitle('Submit Flowers 💐');

  // Message input (required)
  const messageInput = new TextInputBuilder()
    .setCustomId('flowerMessage')
    .setLabel('Your Message')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder(
      'Example: "I finally landed my first internship!" or "Shoutout to Eileen for being so supportive!"',
    )
    .setRequired(true)
    .setMaxLength(1000)
    .setMinLength(10);

  // Name input (optional)
  const nameInput = new TextInputBuilder()
    .setCustomId('flowerName')
    .setLabel('Your Name (Optional)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g. John Doe')
    .setRequired(false)
    .setMaxLength(100);

  // Add inputs to modal
  const messageRow = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
    messageInput,
  );
  const nameRow = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(nameInput);

  // Add components
  modal.addComponents(messageRow, nameRow);

  // Show the modal
  await interaction.showModal(modal);
}

export async function handleFlowerModalSubmit(interaction: ModalSubmitInteraction) {
  // Defensive check: ensure this is the correct modal
  if (interaction.customId !== 'flowerModal') return;

  // Get form inputs
  const message = interaction.fields.getTextInputValue('flowerMessage');
  const nameInput = interaction.fields.getTextInputValue('flowerName')?.trim() || '';

  // Validate content - check the actual name input, not the fallback
  if (
    containsInappropriateContent(message) ||
    (nameInput && containsInappropriateContent(nameInput))
  ) {
    // Clean up submission data
    pendingSubmissions.delete(interaction.user.id);
    await interaction.reply({
      content:
        '❌ Your submission contains inappropriate language. Please keep your message positive and respectful.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Get stored submission data (attachment)
  const submissionData = pendingSubmissions.get(interaction.user.id);

  if (!submissionData) {
    await interaction.reply({
      content: '❌ An error occurred. Please try the command again.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Update submission data with message and name
  submissionData.message = message;
  submissionData.name = nameInput;

  // Reply to modal submission
  await interaction.reply({
    content: '✅ Thank you for your submission! Please answer the question below.',
    flags: MessageFlags.Ephemeral,
  });

  // If name is provided, directly ask about website consent
  // If name is not provided, first ask about sharing Discord username
  if (nameInput && nameInput.trim() !== '') {
    // Name provided: directly ask about website consent
    await interaction.followUp({
      content: '💖 Would you like to consent to feature your submission on the BobaTalks website?',
      flags: MessageFlags.Ephemeral,
      components: [
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('flowerConsent_yes')
            .setLabel('Yes')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('flowerConsent_no')
            .setLabel('No')
            .setStyle(ButtonStyle.Danger),
        ),
      ],
    });
  } else {
    // No name provided: first ask about sharing Discord username
    await interaction.followUp({
      content: '💖 Would you like to share your Discord username with this submission?',
      flags: MessageFlags.Ephemeral,
      components: [
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('flowerShareUsername_yes')
            .setLabel('Yes')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('flowerShareUsername_no')
            .setLabel('No')
            .setStyle(ButtonStyle.Danger),
        ),
      ],
    });
  }
}

export async function handleFlowerShareUsernameButton(interaction: ButtonInteraction) {
  const customId = interaction.customId;
  if (!customId.startsWith('flowerShareUsername_')) return;

  const shareUsername = customId === 'flowerShareUsername_yes';

  // Get stored submission data
  const submissionData = pendingSubmissions.get(interaction.user.id);

  if (!submissionData) {
    await interaction.reply({
      content: '❌ Your submission data was not found. Please try the command again.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Update shareDiscordUsername preference
  submissionData.shareDiscordUsername = shareUsername;

  // Now ask about website consent
  await interaction.update({
    content: '💖 Would you like to consent to feature your submission on the BobaTalks website?',
    components: [
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('flowerConsent_yes')
          .setLabel('Yes')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('flowerConsent_no')
          .setLabel('No')
          .setStyle(ButtonStyle.Danger),
      ),
    ],
  });
}

export async function handleFlowerConsentButton(interaction: ButtonInteraction) {
  const customId = interaction.customId;
  if (!customId.startsWith('flowerConsent_')) return;

  const hasConsent = customId === 'flowerConsent_yes';

  // Get stored submission data
  const submissionData = pendingSubmissions.get(interaction.user.id);

  if (!submissionData) {
    await interaction.reply({
      content: '❌ Your submission data was not found. Please try the command again.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Update consent
  submissionData.hasConsent = hasConsent;

  // Show loading message immediately
  await interaction.update({
    content: '⏳ Processing your submission... (uploading image, saving to sheets, etc.)',
    components: [], // Remove buttons
  });

  // Process the flower submission directly
  await processFlowerSubmission(interaction, submissionData);
}

function createFlowerEmbed(
  message: string,
  displayName: string,
  attachmentData?: { url: string; contentType: string; filename: string },
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor('#FF69B4') // Pink color for flowers
    .setTitle('🌸🌺🌼💐')
    .setDescription(message)
    .setFooter({ text: `Submitted by ${displayName} • Thank you for celebrating with us! 🌸` });

  // Add image if provided
  if (attachmentData) {
    embed.setImage(attachmentData.url);
  }

  return embed;
}

function createResponseMessage(hasConsent: boolean, imageUploadFailed?: boolean): string {
  let message =
    '✅ Your flower has been submitted! Thank you for sharing and celebrating with the community! 🌸';

  if (imageUploadFailed) {
    message +=
      '\n\n⚠️ Note: There was an issue uploading your image, but your message was still submitted successfully.';
  }

  if (hasConsent) {
    message +=
      '\n\n💖 Thank you for consenting to feature your submission on the BobaTalks website!';
  }

  return message;
}

async function rollbackFlowerEntry(createdFlowerId: string): Promise<void> {
  try {
    await deleteFlower(createdFlowerId);
    console.log(`Successfully rolled back flower entry with ID ${createdFlowerId}`);
  } catch (deleteError) {
    console.error('Error deleting flower during rollback:', deleteError);
  }
}

async function processFlowerSubmission(
  interaction: ButtonInteraction,
  submissionData: {
    attachment?: { url: string; contentType: string; filename: string };
    message: string;
    name: string;
    username: string;
    hasConsent?: boolean;
    shareDiscordUsername?: boolean;
  },
) {
  const {
    attachment: attachmentData,
    message,
    name: nameInput,
    username,
    hasConsent = false,
    shareDiscordUsername = false,
  } = submissionData;

  let createdFlowerId: string | undefined;
  let driveImageUrl: string | undefined;

  try {
    // Upload image to Google Drive if attachment exists
    if (attachmentData) {
      try {
        // Create a timeout promise that rejects after 1 minute
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error('Google Drive upload timed out after 1 minute'));
          }, 60000); // 1 minute = 60000ms
        });

        // Race between the upload and the timeout
        driveImageUrl = await Promise.race([
          saveDiscordImageToDrive(attachmentData.url),
          timeoutPromise,
        ]);
        console.log(`Successfully uploaded image to Google Drive: ${driveImageUrl}`);
      } catch (uploadError) {
        console.error('Error uploading image to Google Drive:', uploadError);
        // Continue without image rather than failing the entire submission
        driveImageUrl = undefined;
      }
    }

    // Create flower entry in Google Sheets with drive link
    const createdFlower = await createFlower({
      name: nameInput || undefined,
      username: shareDiscordUsername ? username : undefined,
      message: message,
      picture: driveImageUrl,
      website: hasConsent,
    });

    createdFlowerId = createdFlower.id;

    // Determine display name based on name field and Discord username sharing preference
    let displayName: string;
    const nameIsEmpty = !nameInput || nameInput.trim() === '';

    if (nameIsEmpty) {
      // If name field is empty, check if user wants to share Discord username
      if (shareDiscordUsername) {
        // User consented to share Discord username
        displayName = username;
      } else {
        // User chose not to share Discord username
        displayName = 'Anonymous';
      }
    } else {
      // If name field is filled, use the provided name
      displayName = nameInput.trim();
    }

    // Prefer displaying Drive image upload if available; fallback to direct attachment only if no Drive URL
    const embedAttachmentData = driveImageUrl
      ? {
          url: driveImageUrl,
          contentType: attachmentData?.contentType || 'image/png',
          filename: attachmentData?.filename || 'image',
        }
      : attachmentData;

    const embed = createFlowerEmbed(message, displayName, embedAttachmentData);

    // Detect image upload failure if attachment present but no drive URL
    const imageUploadFailed = !!(attachmentData && !driveImageUrl);

    const responseMessage = createResponseMessage(hasConsent, imageUploadFailed);

    try {
      // Use editReply if interaction was deferred, otherwise use update
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: responseMessage,
          components: [], // Remove buttons
        });
      } else {
        await interaction.update({
          content: responseMessage,
          components: [], // Remove buttons
        });
      }

      // Post the flower to the channel
      let publicMessageUrl: string | undefined;
      if (interaction.channel && 'send' in interaction.channel) {
        const publicMessage = await interaction.channel.send({ embeds: [embed] });
        publicMessageUrl = publicMessage.url;
      }

      // Log to mod channel for auditing (after public message is sent to include the link)
      const logData: {
        username: string;
        discriminator: string;
        timestamp: Date;
        message: string;
        nameProvided?: string;
        flowerId?: string;
        messageUrl?: string;
        imageUrl?: string;
      } = {
        username: interaction.user.username,
        discriminator: interaction.user.discriminator,
        timestamp: new Date(),
        message: message,
      };

      // Only include optional fields if they exist
      if (nameInput && nameInput.trim() !== '') {
        logData.nameProvided = nameInput.trim();
      }
      if (createdFlowerId) {
        logData.flowerId = createdFlowerId;
      }
      if (publicMessageUrl) {
        logData.messageUrl = publicMessageUrl;
      }
      // Include the Drive image URL if available, otherwise the direct attachment URL
      if (driveImageUrl) {
        logData.imageUrl = driveImageUrl;
      } else if (attachmentData) {
        logData.imageUrl = attachmentData.url;
      }

      await logFlowerUsageToModChannel(interaction.guild, logData);

      // If user has consent for website publishing, send to moderation workflow
      if (hasConsent && createdFlowerId && publicMessageUrl) {
        await sendFlowerToModeration(
          interaction.guild,
          createdFlowerId,
          publicMessageUrl,
          message,
          displayName,
          interaction.user.username,
          driveImageUrl || attachmentData?.url,
          new Date(),
        );
      }
    } catch (discordError) {
      // If Discord message fails, rollback the sheet entry
      console.error('Error sending Discord message, rolling back sheet entry:', discordError);
      if (createdFlowerId) {
        await rollbackFlowerEntry(createdFlowerId);
      }
      throw discordError;
    }

    // Clean up submission data after successful submission
    pendingSubmissions.delete(interaction.user.id);
  } catch (error) {
    console.error('Error submitting flower:', error);
    pendingSubmissions.delete(interaction.user.id);

    try {
      if (interaction.deferred || interaction.replied) {
        // If already deferred/replied, use editReply or followUp
        if (interaction.deferred) {
          await interaction.editReply({
            content: '❌ An error occurred while submitting your flower. Please try again.',
            components: [],
          });
        } else {
          await interaction.followUp({
            content: '❌ An error occurred while submitting your flower. Please try again.',
            flags: MessageFlags.Ephemeral,
          });
        }
      } else {
        await interaction.reply({
          content: '❌ An error occurred while submitting your flower. Please try again.',
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (replyError) {
      // If we can't reply (e.g., interaction expired), just log it
      console.error('Error sending error message to user:', replyError);
    }
  }
}
