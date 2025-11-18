// flowersWizard.ts
import {
  ActionRowBuilder,
  Attachment,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Interaction,
  Message,
  ModalActionRowComponentBuilder,
  ModalBuilder,
  ModalSubmitInteraction,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity';

import { createFlower } from '../googleSheetsService.js';

// ---------- Slash command ----------
export const flower = new SlashCommandBuilder()
  .setName('flower')
  .setDescription('Submit a flower 💐 via a guided, one-by-one wizard');

// ---------- Content filter ----------
const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});
const hasBad = (t: string) => matcher.hasMatch(t);

// ---------- Wizard state ----------
type Draft = {
  step: 'MSG' | 'NAME' | 'CONSENT' | 'IMAGE' | 'REVIEW';
  message?: string;
  name?: string; // defaults to "Anonymous" if blank
  consent?: boolean; // default false
  image?: { url: string; contentType: string; filename: string };
  channelId: string; // where to listen for image
};

const drafts = new Map<string, Draft>(); // key = userId
const activeCollectors = new Map<string, { stop: () => void }>(); // key = userId, for cleanup

// ---------- Helpers ----------
const ids = {
  msgOpen: 'flower:msg:open',
  nameOpen: 'flower:name:open',
  consentYes: 'flower:consent:yes',
  consentNo: 'flower:consent:no',
  imagePrompt: 'flower:image:prompt',
  skipImage: 'flower:image:skip',
  confirm: 'flower:confirm',
  editMsg: 'flower:edit:msg',
  editName: 'flower:edit:name',
  editConsent: 'flower:edit:consent',
  editImage: 'flower:edit:image',
  submitMsgModal: 'flower:modal:msg',
  submitNameModal: 'flower:modal:name',
};

function primary(label: string, customId: string) {
  return new ButtonBuilder().setLabel(label).setCustomId(customId).setStyle(ButtonStyle.Primary);
}
function secondary(label: string, customId: string) {
  return new ButtonBuilder().setLabel(label).setCustomId(customId).setStyle(ButtonStyle.Secondary);
}
function success(label: string, customId: string) {
  return new ButtonBuilder().setLabel(label).setCustomId(customId).setStyle(ButtonStyle.Success);
}

function reviewEmbed(d: Draft) {
  return new EmbedBuilder()
    .setColor('#FF69B4')
    .setTitle('🌸 Review your Flower')
    .setDescription(d.message ?? '*No message*')
    .addFields(
      { name: 'Submitted by', value: d.name || 'Anonymous', inline: true },
      { name: 'Website Consent', value: d.consent ? 'Yes' : 'No', inline: true },
    )
    .setTimestamp()
    .setFooter({ text: 'Please confirm to submit.' });
}

function finalEmbed(d: Draft) {
  const e = new EmbedBuilder()
    .setColor('#FF69B4')
    .setTitle('🌸 New Flower Submission 💐')
    .setDescription(d.message!)
    .addFields({ name: 'Submitted by', value: d.name || 'Anonymous', inline: true })
    .setTimestamp()
    .setFooter({ text: 'Thank you for celebrating with us! 🌸' });

  if (d.image) {
    e.setImage(d.image.url);
    e.addFields({
      name: '🖼️ Image CDN URL (for backend)',
      value: `\`${d.image.url}\`\nType: ${d.image.contentType}\nFilename: ${d.image.filename}`,
      inline: false,
    });
  }
  return e;
}

// ---------- Entry point ----------
export async function flowerCommand(interaction: ChatInputCommandInteraction) {
  const userId = interaction.user.id;

  // Clean up any existing draft and collectors for this user
  stopCollector(userId);
  drafts.delete(userId);

  // Create new draft
  drafts.set(userId, { step: 'MSG', channelId: interaction.channelId });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    primary('Write your message', ids.msgOpen),
  );

  await interaction.reply({
    content: "Let's submit your flower — we'll go one step at a time. First, write your message ✍️",
    components: [row],
    ephemeral: true,
  });
}

// ---------- Interactions router ----------
export async function handleInteraction(i: Interaction) {
  if (i.isChatInputCommand() && i.commandName === 'flower') {
    return flowerCommand(i);
  }
  if (i.isButton()) return handleButton(i);
  if (i.isModalSubmit()) return handleModal(i);
}

// ---------- Button handlers ----------
async function handleButton(i: ButtonInteraction) {
  const d = drafts.get(i.user.id);
  if (!d) return i.reply({ content: 'Session expired. Run /flower again.', ephemeral: true });

  switch (i.customId) {
    case ids.msgOpen:
    case ids.editMsg:
      return openSingleFieldModal(
        i,
        ids.submitMsgModal,
        'Flower — Your Message',
        'flowerMessage',
        TextInputStyle.Paragraph,
        'Example: “Shoutout to Eileen for being so supportive!”',
        10,
        1000,
        d.message,
      );

    case ids.nameOpen:
    case ids.editName:
      return openSingleFieldModal(
        i,
        ids.submitNameModal,
        'Your Name (Optional)',
        'flowerName',
        TextInputStyle.Short,
        'Leave blank to remain anonymous',
        0,
        100,
        d.name ?? '',
      );

    case ids.consentYes:
      d.consent = true;
      d.step = 'IMAGE';
      return promptForImage(i);

    case ids.consentNo:
      d.consent = false;
      d.step = 'IMAGE';
      return promptForImage(i);

    case ids.editConsent:
      // If they clicked "edit consent", show two buttons again
      d.step = 'CONSENT';
      return askConsent(i);

    case ids.imagePrompt:
    case ids.editImage:
      d.step = 'IMAGE';
      return createImageCollector(i, d);

    case ids.skipImage:
      d.step = 'REVIEW';
      // Stop any active collector when skipping
      stopCollector(i.user.id);
      return showReview(i, d);

    case ids.confirm: {
      // Validate all required fields
      if (!d.message || d.message.trim().length < 10) {
        return i.reply({
          content: '❌ You must have a message (at least 10 characters) before confirming.',
          ephemeral: true,
        });
      }

      // Stop any active collectors
      stopCollector(i.user.id);

      // Validate image URL if present
      if (d.image?.url) {
        try {
          new URL(d.image.url);
        } catch {
          return i.reply({
            content: '❌ Invalid image URL. Please try uploading the image again.',
            ephemeral: true,
          });
        }
      }

      // Validate name if provided (not just "Anonymous")
      const displayName =
        d.name && d.name.trim() && d.name !== 'Anonymous' ? d.name.trim() : undefined;
      if (displayName && hasBad(displayName)) {
        return i.reply({
          content: '❌ Your name contains inappropriate language. Please edit your name.',
          ephemeral: true,
        });
      }

      // Bundle all inputs and append to Google Sheets in one row
      try {
        await createFlower({
          name: displayName,
          username: i.user.tag,
          message: d.message.trim(),
          picture: d.image?.url,
          website: d.consent ?? false,
        });
      } catch (error) {
        console.error('Error saving flower to Google Sheets:', error);
        // Continue anyway - we'll still post to Discord
      }

      // Post to the visible channel
      const embed = finalEmbed(d);
      if (i.channel && 'send' in i.channel) {
        try {
          await i.channel.send({ embeds: [embed] });
        } catch (error) {
          console.error('Error posting flower to channel:', error);
          return i.reply({
            content:
              '❌ Error posting your flower to the channel. Please check bot permissions and try again.',
            ephemeral: true,
          });
        }
      }

      // Clean up
      drafts.delete(i.user.id);
      stopCollector(i.user.id);

      return i.reply({
        content: '✅ Submitted! Thanks for sharing your flower 💐',
        ephemeral: true,
      });
    }

    default:
      return;
  }
}

// ---------- Modal handlers ----------
async function handleModal(i: ModalSubmitInteraction) {
  const d = drafts.get(i.user.id);
  if (!d) return i.reply({ content: 'Session expired. Run /flower again.', ephemeral: true });

  if (i.customId === ids.submitMsgModal) {
    const message = i.fields.getTextInputValue('flowerMessage').trim();

    // Validation: Check if empty
    if (!message || message.length === 0) {
      return i.reply({
        content: '❌ Message cannot be empty. Please provide your flower message.',
        ephemeral: true,
      });
    }

    // Validation: Minimum length
    if (message.length < 10) {
      return i.reply({
        content: '❌ Please provide at least 10 characters for your message.',
        ephemeral: true,
      });
    }

    // Validation: Maximum length
    if (message.length > 1000) {
      return i.reply({
        content: '❌ Message is too long. Please keep it under 1000 characters.',
        ephemeral: true,
      });
    }

    // Validation: Content filter
    if (hasBad(message)) {
      return i.reply({
        content:
          '❌ Your message contains inappropriate language. Please keep it positive and respectful.',
        ephemeral: true,
      });
    }

    d.message = message;
    d.step = 'NAME';

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      primary('Add your name (optional)', ids.nameOpen),
    );

    return i.reply({
      content:
        '✅ Great! Now, would you like to add your name? (You can stay anonymous if you prefer.)',
      components: [row],
      ephemeral: true,
    });
  }

  if (i.customId === ids.submitNameModal) {
    const name = i.fields.getTextInputValue('flowerName').trim();

    // Validation: Maximum length
    if (name.length > 100) {
      return i.reply({
        content: '❌ Name is too long. Please keep it under 100 characters.',
        ephemeral: true,
      });
    }

    // Validation: Content filter (only if name is provided)
    if (name && hasBad(name)) {
      return i.reply({
        content:
          '❌ Your name contains inappropriate language. Please enter a different name or leave blank.',
        ephemeral: true,
      });
    }

    d.name = name || 'Anonymous';
    d.step = 'CONSENT';
    return askConsent(i);
  }
}

// ---------- Step UIs ----------
async function askConsent(i: ButtonInteraction | ModalSubmitInteraction) {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    success('Consent: Yes', ids.consentYes),
    secondary('Consent: No', ids.consentNo),
  );

  return i.reply({
    content:
      'Do you consent to featuring your submission on the BobaTalks website? (You can choose No and still submit.)',
    components: [row],
    ephemeral: true,
  });
}

async function promptForImage(i: ButtonInteraction | ModalSubmitInteraction) {
  const d = drafts.get(i.user.id);
  if (!d) return;

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    primary('Upload an image', ids.imagePrompt),
    secondary('Skip (no image)', ids.skipImage),
  );

  // Explain the rule: we will capture the **next** message with an image from this user in this channel
  await i.reply({
    content:
      "📷 **Add an image (optional)**: You can upload an image or skip this step. When you click 'Upload an image', I'll wait for your **next message with an image** in this channel. Supported formats: PNG, JPEG, WebP, GIF (max 25MB).",
    components: [row],
    ephemeral: true,
  });
}

async function createImageCollector(i: ButtonInteraction, d: Draft) {
  // Stop any existing collector for this user
  stopCollector(i.user.id);

  const channel = i.channel;
  if (!channel || !('createMessageCollector' in channel)) {
    return safeReply(i, '❌ Unable to set up image collection in this channel.', true);
  }

  await i.reply({
    content:
      "✅ **I'm waiting for your image!** Please send a message with an image attachment in this channel. I'll automatically detect it. (Timeout: 2 minutes)",
    ephemeral: true,
  });

  const userId = i.user.id;
  const filter = (m: Message) => m.author.id === userId && m.attachments.size > 0;

  const collector = channel.createMessageCollector({ filter, time: 2 * 60 * 1000, max: 1 });

  // Store collector for cleanup
  activeCollectors.set(userId, collector);

  collector.on('collect', async (m: Message) => {
    const att = firstImage(m.attachments);
    if (!att) {
      await safeReply(
        i,
        "❌ That wasn't an image. Please send a PNG, JPEG, WebP, or GIF file.",
        true,
      );
      return;
    }

    // Validate file size (25MB = 25 * 1024 * 1024 bytes)
    const maxSizeBytes = 25 * 1024 * 1024;
    if (att.size && att.size > maxSizeBytes) {
      await safeReply(
        i,
        `❌ Image is too large (${(att.size / 1024 / 1024).toFixed(2)}MB). Maximum size is 25MB. Please compress or use a smaller image.`,
        true,
      );
      return;
    }

    // Validate image format
    const isValidFormat = validateImageFormat(att);
    if (!isValidFormat) {
      await safeReply(
        i,
        '❌ Invalid image format. Please use PNG, JPEG, WebP, or GIF files only.',
        true,
      );
      return;
    }

    // Store image data
    d.image = {
      url: att.url,
      contentType: att.contentType ?? 'image/png',
      filename: att.name ?? 'image.png',
    };

    // Try to tidy up (requires Manage Messages permission)
    try {
      await m.delete();
    } catch {
      // Ignore if we don't have permission
    }

    // Stop collector and remove from active collectors
    stopCollector(userId);

    d.step = 'REVIEW';
    await showReview(i, d);
  });

  collector.on('end', async (collected) => {
    // Remove from active collectors
    activeCollectors.delete(userId);

    if (collected.size === 0) {
      await safeReply(
        i,
        '⌛ **Image upload timeout.** You can click "Replace Image" in the review to try again.',
        true,
      );
    }
  });
}

function stopCollector(userId: string) {
  const collector = activeCollectors.get(userId);
  if (collector) {
    collector.stop();
    activeCollectors.delete(userId);
  }
}

function validateImageFormat(att: Attachment): boolean {
  const contentType = (att.contentType ?? '').toLowerCase();
  const filename = (att.name ?? '').toLowerCase();

  // Check content type first
  if (contentType.startsWith('image/')) {
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
    if (validTypes.some((type) => contentType === type)) {
      return true;
    }
  }

  // Fallback: check file extension
  const validExtensions = /\.(png|jpe?g|webp|gif)$/i;
  return validExtensions.test(filename);
}

function firstImage(attachments: Map<string, Attachment>): Attachment | null {
  for (const [, a] of attachments) {
    if (validateImageFormat(a)) {
      return a;
    }
  }
  return null;
}

async function showReview(i: ButtonInteraction | ModalSubmitInteraction, d: Draft) {
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    secondary('Edit Message', ids.editMsg),
    secondary('Edit Name', ids.editName),
    secondary('Edit Consent', ids.editConsent),
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    secondary('Replace Image', ids.editImage),
    success('✅ Confirm & Submit', ids.confirm),
  );

  const embed = reviewEmbed(d);

  // If there's an image, show it in the review
  if (d.image) {
    embed.setImage(d.image.url);
  }

  await i.reply({
    content: 'Please review your submission and confirm:',
    embeds: [embed],
    components: [row1, row2],
    ephemeral: true,
  });
}

async function openSingleFieldModal(
  i: ButtonInteraction,
  customId: string,
  title: string,
  inputId: string,
  style: TextInputStyle,
  placeholder: string,
  minLen: number,
  maxLen: number,
  preset?: string,
) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);
  const input = new TextInputBuilder()
    .setCustomId(inputId)
    .setLabel(title)
    .setStyle(style)
    .setPlaceholder(placeholder)
    .setRequired(minLen > 0)
    .setMinLength(minLen)
    .setMaxLength(maxLen);

  if (preset) input.setValue(preset.slice(0, maxLen));

  const row = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(input);
  modal.addComponents(row);
  return i.showModal(modal);
}

async function safeReply(
  i: ButtonInteraction | ModalSubmitInteraction,
  content: string,
  ephemeral = true,
) {
  if (i.replied || i.deferred) {
    try {
      await i.followUp({ content, ephemeral });
    } catch {
      // Ignore if interaction expired
    }
  } else {
    try {
      await i.reply({ content, ephemeral });
    } catch {
      // Ignore if interaction expired
    }
  }
}
