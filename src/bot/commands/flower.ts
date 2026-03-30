import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ModalSubmitInteraction,
  EmbedBuilder,
  AttachmentBuilder,
  ModalActionRowComponentBuilder,
  MessageActionRowComponentBuilder,
  MessageFlags,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  TextChannel,
  Guild,
  GuildMember,
} from 'discord.js';
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity';

import { generateFlowerCard } from '../flowerCard.js';
import { saveDiscordImageToDrive } from '../googleDriveImages.js';
import { createFlower, deleteFlower } from '../googleSheetsService.js';
import { sendFlowerToModeration } from '../moderationWorkflow.js';

export const flower = new SlashCommandBuilder()
  .setName('flower')
  .setDescription(
    'Submit a flower 💐 - a message of acknowledgement, congratulations, or encouragement',
  )
  .addUserOption((option) =>
    option
      .setName('mention_user')
      .setDescription(
        'Who is this flower for? (optional — use @username in your message for placement)',
      )
      .setRequired(false),
  )
  .addAttachmentOption((option) =>
    option.setName('image').setDescription('Upload an image (PNG, JPEG, etc.)').setRequired(false),
  );

// Content filter using obscenity library
const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

function containsInappropriateContent(text: string): boolean {
  return matcher.hasMatch(text);
}

function normalizeEmojiShortcodesToDiscordTokens(text: string, guild: Guild | null): string {
  if (!guild) return text;

  return text.replace(/:([a-zA-Z0-9_]{2,32}):/g, (fullMatch, emojiName) => {
    const guildEmoji = guild.emojis.cache.find((emoji) => emoji.name === emojiName);
    return guildEmoji ? guildEmoji.toString() : fullMatch;
  });
}

/**
 * Strips <:name:id> and <a:name:id> tokens that the bot cannot render
 * (i.e. emojis not present in the guild cache) to avoid broken embed output.
 */
function stripUnresolvableEmojiTokens(text: string, guild: Guild | null): string {
  if (!guild) return text;

  return text.replace(/<a?:[a-zA-Z0-9_]{2,32}:(\d+)>/g, (fullMatch, emojiId) => {
    const isAccessible = guild.emojis.cache.has(emojiId);
    return isAccessible ? fullMatch : '';
  });
}

/**
 * Replaces @tokens that fuzzily match the selected user aliases.
 * Guarantees at least one canonical mention when mention_user is selected.
 */
function injectMentionIntoMessage(
  text: string,
  mentionUserId: string,
  mentionAliases: string[],
): {
  outputText: string;
  hasAtToken: boolean;
  replacedTokenCount: number;
  appendedMention: boolean;
  willNotify: boolean;
} {
  // Includes CJK unified ideographs, Hangul, Hiragana, Katakana so @tokens in
  // those scripts are captured and compared directly before Latin normalization.
  const AT_TOKEN_PATTERN =
    /(^|[\s(])@([a-zA-Z0-9_.\u4e00-\u9fff\u3400-\u4dbf\uac00-\ud7af\u3040-\u309f\u30a0-\u30ff-]{2,32})/g;

  const normalizeAliasForLatinComparison = (value: string): string =>
    value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');

  const computeLevenshteinDistance = (left: string, right: string): number => {
    const row = new Array(right.length + 1).fill(0);
    for (let columnIndex = 0; columnIndex <= right.length; columnIndex += 1) {
      row[columnIndex] = columnIndex;
    }

    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
      let diagonal = row[0];
      row[0] = leftIndex;

      for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
        const upper = row[rightIndex];
        const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
        row[rightIndex] = Math.min(
          row[rightIndex] + 1,
          row[rightIndex - 1] + 1,
          diagonal + substitutionCost,
        );
        diagonal = upper;
      }
    }

    return row[right.length];
  };

  const normalizedAliases = mentionAliases
    .map(normalizeAliasForLatinComparison)
    .filter((alias) => alias.length >= 2);

  const baseCollator = new Intl.Collator(undefined, { sensitivity: 'base' });

  const isLikelySelectedUserMention = (rawToken: string): boolean => {
    // Pass 1: locale-aware base comparison (ignores case + diacritics) — handles CJK and exact names
    if (mentionAliases.some((alias) => baseCollator.compare(alias, rawToken) === 0)) return true;

    // Pass 2: Latin-normalized fuzzy match for diacritics, separators, and minor typos
    const normalizedToken = normalizeAliasForLatinComparison(rawToken);
    if (!normalizedToken) return false;

    return normalizedAliases.some((alias) => {
      if (normalizedToken === alias) return true;
      if (normalizedToken.length >= 4 && alias.length >= 4) {
        if (normalizedToken.startsWith(alias) || alias.startsWith(normalizedToken)) return true;
      }

      const lengthDifference = Math.abs(normalizedToken.length - alias.length);
      if (lengthDifference > 2) return false;

      const maxAllowedDistance = Math.max(1, Math.floor(Math.max(alias.length, 4) / 5));
      const editDistance = computeLevenshteinDistance(normalizedToken, alias);
      return editDistance <= maxAllowedDistance;
    });
  };

  let sawAtToken = false;
  let replacedTokenCount = 0;
  const replaced = text.replace(AT_TOKEN_PATTERN, (_, prefix: string, token: string) => {
    sawAtToken = true;
    if (isLikelySelectedUserMention(token)) {
      replacedTokenCount += 1;
      return `${prefix}<@${mentionUserId}>`;
    }
    return `${prefix}@${token}`;
  });

  if (sawAtToken) {
    if (replacedTokenCount === 0) {
      return {
        outputText: `${replaced} (<@${mentionUserId}>)`,
        hasAtToken: true,
        replacedTokenCount: 0,
        appendedMention: true,
        willNotify: true,
      };
    }

    return {
      outputText: replaced,
      hasAtToken: true,
      replacedTokenCount,
      appendedMention: false,
      willNotify: true,
    };
  }

  return {
    outputText: `${text} (<@${mentionUserId}>)`,
    hasAtToken: false,
    replacedTokenCount: 0,
    appendedMention: true,
    willNotify: true,
  };
}

function normalizeFlowerInputForDiscord(text: string, guild: Guild | null): string {
  const withResolvedShortcodes = normalizeEmojiShortcodesToDiscordTokens(text, guild);
  return stripUnresolvableEmojiTokens(withResolvedShortcodes, guild);
}

/**
 * Logs flower command usage to the private flowers-mod channel for admin auditing.
 * This helps prevent spam and tracks anonymous submissions.
 */
const FLOWERS_MOD_CHANNEL_ID = '1082514729311948850';

async function logFlowerUsageToModChannel(
  guild: Guild | null,
  logData: {
    username: string;
    userId: string;
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
    const modChannel = guild.channels.cache.get(FLOWERS_MOD_CHANNEL_ID) as TextChannel | undefined;

    if (!modChannel) {
      console.warn(
        `flowers-mod channel (ID: ${FLOWERS_MOD_CHANNEL_ID}) not found. Verify the channel ID is correct.`,
      );
      return;
    }

    const logEmbed = new EmbedBuilder()
      .setColor('#FFA500')
      .setAuthor({ name: logData.username })
      .setTitle('🌸 Flower Submitted')
      .setURL(logData.messageUrl || null)
      .setDescription(
        `By <@${logData.userId}> at <t:${Math.floor(logData.timestamp.getTime() / 1000)}:F>`,
      )
      .addFields({
        name: '📝 Message',
        value:
          logData.message.length > 1024
            ? logData.message.substring(0, 1021) + '...'
            : logData.message,
      })
      .setFooter({ text: `ID: ${logData.flowerId || 'N/A'}` })
      .setTimestamp();

    if (logData.imageUrl) {
      logEmbed.setImage(logData.imageUrl);
    }

    await modChannel.send({ embeds: [logEmbed] });
  } catch (error) {
    console.error('Error logging flower usage to mod channel:', error);
  }
}

// Temporary storage for image attachments and submission data (userId -> data)
type PendingFlowerSubmission = {
  attachment?: { url: string; contentType: string; filename: string };
  message: string;
  name: string;
  username: string;
  mentionUserId?: string;
  mentionAliases?: string[];
  hasConsent?: boolean;
  shareDiscordUsername?: boolean;
};

const pendingSubmissions = new Map<string, PendingFlowerSubmission>();

function buildFlowerModal(
  messageValue = '',
  nameValue = '',
  customId = 'flowerModal',
): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(customId).setTitle('Submit Flowers 💐');

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

  if (messageValue) {
    messageInput.setValue(messageValue);
  }

  const nameInput = new TextInputBuilder()
    .setCustomId('flowerName')
    .setLabel('Your Name')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Leave blank to post anonymously')
    .setRequired(false)
    .setMaxLength(100);

  if (nameValue) {
    nameInput.setValue(nameValue);
  }

  const messageRow = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
    messageInput,
  );
  const nameRow = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(nameInput);

  modal.addComponents(messageRow, nameRow);
  return modal;
}

function resolveDisplayNameForPreview(submissionData: PendingFlowerSubmission): string {
  const customName = submissionData.name?.trim();
  if (customName) return `${customName}`;
  if (submissionData.shareDiscordUsername) return `${submissionData.username}`;
  return 'Anonymous';
}

function buildFinalPreviewPayload(submissionData: PendingFlowerSubmission, guild: Guild | null) {
  const emojiNormalizedMessage = normalizeFlowerInputForDiscord(submissionData.message, guild);
  const hasAtToken = /(^|[\s(])@[a-zA-Z0-9_.-]{2,32}/.test(emojiNormalizedMessage);
  const mentionResolution = submissionData.mentionUserId
    ? injectMentionIntoMessage(
        emojiNormalizedMessage,
        submissionData.mentionUserId,
        submissionData.mentionAliases ?? [],
      )
    : null;
  const previewMessage = mentionResolution?.outputText ?? emojiNormalizedMessage;
  const previewSnippet =
    previewMessage.length > 350 ? `${previewMessage.slice(0, 347)}...` : previewMessage;
  const mentionPreview = submissionData.mentionUserId
    ? `🔔 **Ping** · <@${submissionData.mentionUserId}>`
    : '🔕 **Ping** · None';
  const mentionHint = submissionData.mentionUserId
    ? mentionResolution?.appendedMention && hasAtToken
      ? "Heads up: your @<name> didn't closely match the selected user, so the ping was appended at the end instead. Click Edit to adjust if needed."
      : null
    : hasAtToken
      ? 'Heads up: your @<name> will appear as plain text. Click Cancel and rerun /flower with mention_user selected to send a real ping.'
      : null;
  const imageHint = !submissionData.attachment
    ? 'Heads up: no image will be included. Click Cancel and rerun /flower with an image attached if you want one.'
    : null;
  const authorPreview = resolveDisplayNameForPreview(submissionData);
  const hints = [
    ...(mentionHint ? [`💡 ${mentionHint}`] : []),
    ...(imageHint ? [`💡 ${imageHint}`] : []),
  ];

  return {
    content: [
      '## 🌸 Flower Preview',
      '',
      `> ${previewSnippet.split('\n').join('\n> ')}`,
      '',
      '─────────────────────',
      `👤 **Author** · ${authorPreview}`,
      mentionPreview,
      `🌐 **Website** · ${submissionData.hasConsent ? 'Consented' : 'Not consented'}`,
      `🖼️ **Image** · ${submissionData.attachment ? submissionData.attachment.filename : 'None'}`,
      ...(hints.length > 0 ? ['', ...hints] : []),
      '',
      '-# Ready to post?',
    ].join('\n'),
    components: [
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('flowerSubmit_confirm')
          .setLabel('Confirm & Post')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('flowerSubmit_edit')
          .setLabel('Edit')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('flowerSubmit_cancel')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

export async function flowerCommand(interaction: ChatInputCommandInteraction) {
  const attachment = interaction.options.getAttachment('image');
  const mentionUser = interaction.options.getUser('mention_user');
  const mentionMember = mentionUser
    ? ((interaction.guild?.members.cache.get(mentionUser.id) as GuildMember | undefined) ?? null)
    : null;
  const mentionAliases = mentionUser
    ? [
        ...new Set(
          [mentionUser.username, mentionUser.globalName, mentionMember?.displayName].filter(
            (alias): alias is string => Boolean(alias),
          ),
        ),
      ]
    : [];

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

    pendingSubmissions.set(interaction.user.id, {
      attachment: {
        url: attachment.url,
        contentType: attachment.contentType || 'image/png',
        filename: attachment.name,
      },
      message: '',
      name: '',
      username: interaction.user.username,
      ...(mentionUser ? { mentionUserId: mentionUser.id } : {}),
      ...(mentionAliases.length > 0 ? { mentionAliases } : {}),
    });
  } else {
    pendingSubmissions.set(interaction.user.id, {
      message: '',
      name: '',
      username: interaction.user.username,
      ...(mentionUser ? { mentionUserId: mentionUser.id } : {}),
      ...(mentionAliases.length > 0 ? { mentionAliases } : {}),
    });
  }

  await interaction.showModal(buildFlowerModal());
}

export async function handleFlowerModalSubmit(interaction: ModalSubmitInteraction) {
  // Defensive check: ensure this is the correct modal
  if (!interaction.customId.startsWith('flowerModal')) return;
  const isEditSubmission = interaction.customId === 'flowerModal_edit';

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

  const previousNameWasEmpty = !submissionData.name || submissionData.name.trim() === '';
  const newNameIsEmpty = !nameInput || nameInput.trim() === '';
  const nameStatusChanged = previousNameWasEmpty !== newNameIsEmpty;

  // Update submission data with message and name
  submissionData.message = message;
  submissionData.name = nameInput;

  if (isEditSubmission && submissionData.hasConsent !== undefined && !nameStatusChanged) {
    const previewPayload = buildFinalPreviewPayload(submissionData, interaction.guild);
    await interaction.reply({
      ...previewPayload,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Name status changed on edit — clear stale consent/username state and re-ask
  if (isEditSubmission && nameStatusChanged) {
    delete submissionData.hasConsent;
    delete submissionData.shareDiscordUsername;
  }

  // Reply to modal submission
  await interaction.reply({
    content: isEditSubmission
      ? '✅ Got it! Please re-answer the question below since your name changed.'
      : '✅ Thank you for your submission! Please answer the question below.',
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
  await interaction.update(buildFinalPreviewPayload(submissionData, interaction.guild));
}

export async function handleFlowerFinalSubmitButton(interaction: ButtonInteraction) {
  const customId = interaction.customId;
  if (!customId.startsWith('flowerSubmit_')) return;

  const submissionData = pendingSubmissions.get(interaction.user.id);
  if (!submissionData) {
    await interaction.reply({
      content: '❌ Your submission data was not found. Please run /flower again.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (customId === 'flowerSubmit_cancel') {
    pendingSubmissions.delete(interaction.user.id);
    await interaction.update({
      content: '🛑 Flower submission canceled. You can run /flower again anytime.',
      components: [],
    });
    return;
  }

  if (customId === 'flowerSubmit_edit') {
    await interaction.showModal(
      buildFlowerModal(submissionData.message, submissionData.name, 'flowerModal_edit'),
    );
    return;
  }

  await interaction.update({
    content: '⏳ Processing your submission... (uploading image, saving to sheets, etc.)',
    components: [],
  });

  await processFlowerSubmission(interaction, submissionData);
}

async function buildFlowerMessage(
  message: string,
  displayName: string,
  avatarUrl?: string,
  attachmentData?: { url: string; contentType: string; filename: string },
): Promise<{ embeds: EmbedBuilder[]; files: AttachmentBuilder[] }> {
  const files: AttachmentBuilder[] = [];

  const embed = new EmbedBuilder().setColor('#FF69B4').setAuthor({
    name: displayName,
    ...(avatarUrl ? { iconURL: avatarUrl } : {}),
  });

  const useCanvas = process.env.FLOWER_CANVAS_ENABLED === 'true';

  if (useCanvas) {
    try {
      const cardBuffer = await generateFlowerCard(message, attachmentData?.url);
      if (cardBuffer) {
        files.push(new AttachmentBuilder(cardBuffer, { name: 'flower-card.png' }));
        embed.setImage('attachment://flower-card.png');
      } else {
        embed.setDescription(message);
      }
    } catch (error) {
      console.error('Error generating flower card:', error);
      embed.setDescription(message);
    }
  } else {
    embed.setDescription(message);
    if (attachmentData) {
      files.push(new AttachmentBuilder(attachmentData.url, { name: 'user-image.png' }));
      embed.setImage('attachment://user-image.png');
    }
  }

  return { embeds: [embed], files };
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
    mentionUserId?: string;
    mentionAliases?: string[];
    hasConsent?: boolean;
    shareDiscordUsername?: boolean;
  },
) {
  const {
    attachment: attachmentData,
    message: originalMessage,
    name: originalNameInput,
    username,
    mentionUserId,
    mentionAliases = [],
    hasConsent = false,
    shareDiscordUsername = false,
  } = submissionData;

  const emojiNormalizedMessage = normalizeFlowerInputForDiscord(originalMessage, interaction.guild);
  const mentionResolution = mentionUserId
    ? injectMentionIntoMessage(emojiNormalizedMessage, mentionUserId, mentionAliases)
    : null;
  const normalizedMessage = mentionResolution?.outputText ?? emojiNormalizedMessage;

  const normalizedNameInput = normalizeFlowerInputForDiscord(originalNameInput, interaction.guild);

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
      name: normalizedNameInput || undefined,
      username: shareDiscordUsername ? username : undefined,
      message: normalizedMessage,
      picture: driveImageUrl,
      website: hasConsent,
    });

    createdFlowerId = createdFlower.id;

    // Determine display name based on name field and Discord username sharing preference
    let displayName: string;
    let avatarUrl: string | undefined;
    const nameIsEmpty = !normalizedNameInput || normalizedNameInput.trim() === '';

    if (nameIsEmpty) {
      if (shareDiscordUsername) {
        const member = interaction.member as GuildMember | null;
        displayName = member?.displayName ?? username;
        avatarUrl = interaction.user.displayAvatarURL();
      } else {
        displayName = 'Anonymous';
        avatarUrl = undefined;
      }
    } else {
      displayName = normalizedNameInput.trim();
      avatarUrl = interaction.user.displayAvatarURL();
    }

    const serverNickname =
      (interaction.member as GuildMember | null)?.displayName ?? interaction.user.displayName;

    // Prefer displaying Drive image upload if available; fallback to direct attachment only if no Drive URL
    const embedAttachmentData = driveImageUrl
      ? {
          url: driveImageUrl,
          contentType: attachmentData?.contentType || 'image/png',
          filename: attachmentData?.filename || 'image',
        }
      : attachmentData;

    const flowerMessage = await buildFlowerMessage(
      normalizedMessage,
      displayName,
      avatarUrl,
      embedAttachmentData,
    );

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
        // Mentions in embed descriptions don't trigger notifications — the mention
        // must appear in message content. We extract any resolved mentions from the
        // normalized message and include them as invisible content so pings fire.
        const mentionTokens = [...normalizedMessage.matchAll(/<@(\d+)>/g)].map(([token]) => token);
        const publicMessage = await interaction.channel.send({
          ...(mentionTokens.length > 0 ? { content: mentionTokens.join(' ') } : {}),
          embeds: flowerMessage.embeds,
          files: flowerMessage.files,
          allowedMentions: { parse: ['users'] },
        });
        publicMessageUrl = publicMessage.url;

        try {
          await publicMessage.react('🌸');
        } catch (reactError) {
          console.warn('Could not auto-react to flower message:', reactError);
        }
      }

      // Log to mod channel for auditing (after public message is sent to include the link)
      const logData: {
        username: string;
        userId: string;
        timestamp: Date;
        message: string;
        nameProvided?: string;
        flowerId?: string;
        messageUrl?: string;
        imageUrl?: string;
      } = {
        username: interaction.user.username,
        userId: interaction.user.id,
        timestamp: new Date(),
        message: normalizedMessage,
      };

      if (normalizedNameInput && normalizedNameInput.trim() !== '') {
        logData.nameProvided = normalizedNameInput.trim();
      }
      if (createdFlowerId) {
        logData.flowerId = createdFlowerId;
      }
      if (publicMessageUrl) {
        logData.messageUrl = publicMessageUrl;
      }
      if (driveImageUrl) {
        logData.imageUrl = driveImageUrl;
      } else if (attachmentData) {
        logData.imageUrl = attachmentData.url;
      }

      await logFlowerUsageToModChannel(interaction.guild, logData);

      if (hasConsent && createdFlowerId && publicMessageUrl) {
        await sendFlowerToModeration(interaction.guild, {
          flowerId: createdFlowerId,
          messageUrl: publicMessageUrl,
          messageContent: normalizedMessage,
          flowersDisplayName: displayName,
          discordUsername: interaction.user.username,
          userId: interaction.user.id,
          serverNickname,
          avatarUrl: interaction.user.displayAvatarURL(),
          imageUrl: driveImageUrl || attachmentData?.url,
          timestamp: new Date(),
        });
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
