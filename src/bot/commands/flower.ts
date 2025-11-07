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
} from 'discord.js';
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity';

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

// Temporary storage for image attachments (userId -> attachment data)
const pendingAttachments = new Map<
  string,
  { url: string; contentType: string; filename: string }
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
        ephemeral: true,
      });
      return;
    }

    // Store attachment data for later use in modal submit
    pendingAttachments.set(interaction.user.id, {
      url: attachment.url,
      contentType: attachment.contentType || 'image/png',
      filename: attachment.name,
    });
  } else {
    // Clear any existing attachment data
    pendingAttachments.delete(interaction.user.id);
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
    .setPlaceholder('Leave blank to remain anonymous')
    .setRequired(false)
    .setMaxLength(100);

  // Consent input (optional but recommended)
  const consentInput = new TextInputBuilder()
    .setCustomId('flowerConsent')
    .setLabel('Feature on website? (Type "yes" or leave blank)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Type "yes" to consent to being featured on the BobaTalks website')
    .setRequired(false)
    .setMaxLength(3);

  // Add inputs to modal
  const messageRow = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
    messageInput,
  );
  const nameRow = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(nameInput);
  const consentRow = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
    consentInput,
  );

  modal.addComponents(messageRow, nameRow, consentRow);

  // Show the modal
  await interaction.showModal(modal);
}

export async function handleFlowerModalSubmit(interaction: ModalSubmitInteraction) {
  // Defensive check: ensure this is the correct modal
  if (interaction.customId !== 'flowerModal') return;

  // Get form inputs
  const message = interaction.fields.getTextInputValue('flowerMessage');
  const name = interaction.fields.getTextInputValue('flowerName') || 'Anonymous';
  const consentInput = interaction.fields.getTextInputValue('flowerConsent') || '';
  const hasConsent = consentInput.trim().toLowerCase() === 'yes';

  // Get attachment data if it exists
  const attachmentData = pendingAttachments.get(interaction.user.id);

  // Validate content
  if (containsInappropriateContent(message) || containsInappropriateContent(name)) {
    // Clean up attachment data
    pendingAttachments.delete(interaction.user.id);
    await interaction.reply({
      content:
        '❌ Your submission contains inappropriate language. Please keep your message positive and respectful.',
      ephemeral: true,
    });
    return;
  }

  // Create embed for the flower submission
  const embed = new EmbedBuilder()
    .setColor('#FF69B4') // Pink color for flowers
    .setTitle('🌸 New Flower Submission 💐')
    .setDescription(message)
    .addFields(
      { name: 'Submitted by', value: name, inline: true },
      {
        name: 'Website Feature',
        value: hasConsent ? '✅ Consented' : '❌ Not consented',
        inline: true,
      },
    )
    .setFooter({
      text: hasConsent
        ? 'Thank you for celebrating with us and consenting to be featured on the website! 🌸'
        : 'Thank you for celebrating with us! 🌸',
    })
    .setTimestamp();

  // Add image if provided
  if (attachmentData) {
    embed.setImage(attachmentData.url);
    // Add Discord CDN URL as a field for backend to process and upload to Google Drive
    embed.addFields({
      name: '🖼️ Image CDN URL (for backend)',
      value: `\`${attachmentData.url}\`\nType: ${attachmentData.contentType}\nFilename: ${attachmentData.filename}`,
      inline: false,
    });
  }

  // Send to channel
  try {
    await interaction.reply({
      content:
        '✅ Your flower has been submitted! Thank you for sharing and celebrating with the community! 🌸',
      ephemeral: true,
    });

    // Post the flower to the channel
    if (interaction.channel && 'send' in interaction.channel) {
      await interaction.channel.send({ embeds: [embed] });
    }

    // Clean up attachment data after successful submission
    pendingAttachments.delete(interaction.user.id);
  } catch (error) {
    console.error('Error submitting flower:', error);
    // Clean up attachment data even on error
    pendingAttachments.delete(interaction.user.id);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ An error occurred while submitting your flower. Please try again.',
        ephemeral: true,
      });
    }
  }
}
