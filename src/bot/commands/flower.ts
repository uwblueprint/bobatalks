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

// Temporary storage for image attachments and consent (userId -> data)
const pendingSubmissions = new Map<
  string,
  {
    attachment?: { url: string; contentType: string; filename: string };
    hasConsent: boolean;
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
        ephemeral: true,
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
      hasConsent: false, // Will be set from modal
    });
  } else {
    // Initialize with no attachment
    pendingSubmissions.set(interaction.user.id, {
      hasConsent: false, // Will be set from modal
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
    .setPlaceholder('Leave blank to remain anonymous')
    .setRequired(false)
    .setMaxLength(100);

  // Consent input (optional)
  const consentInput = new TextInputBuilder()
    .setCustomId('flowerConsent')
    .setLabel('Consent to feature on BobaTalks website?')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Type "yes" or "agree" to consent (optional)')
    .setRequired(false)
    .setMaxLength(10);

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
  const consentResponse = interaction.fields
    .getTextInputValue('flowerConsent')
    .trim()
    .toLowerCase();

  // Parse consent - accept "yes", "agree", "y", "true" as consent
  const hasConsent = ['yes', 'agree', 'y', 'true'].includes(consentResponse);

  // Get stored submission data (attachment)
  const submissionData = pendingSubmissions.get(interaction.user.id);
  const attachmentData = submissionData?.attachment;

  // Update consent in submission data
  if (submissionData) {
    submissionData.hasConsent = hasConsent;
  }

  // Validate content
  if (containsInappropriateContent(message) || containsInappropriateContent(name)) {
    // Clean up submission data
    pendingSubmissions.delete(interaction.user.id);
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
    .addFields({ name: 'Submitted by', value: name, inline: true })
    .setFooter({ text: 'Thank you for celebrating with us! 🌸' })
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
    // Create personalized response based on consent
    let responseMessage =
      '✅ Your flower has been submitted! Thank you for sharing and celebrating with the community! 🌸';

    if (hasConsent) {
      responseMessage +=
        '\n\n💖 Thank you for consenting to feature your submission on the BobaTalks website!';
    }

    await interaction.reply({
      content: responseMessage,
      ephemeral: true,
    });

    // Post the flower to the channel
    if (interaction.channel && 'send' in interaction.channel) {
      await interaction.channel.send({ embeds: [embed] });
    }

    // Clean up submission data after successful submission
    pendingSubmissions.delete(interaction.user.id);
  } catch (error) {
    console.error('Error submitting flower:', error);
    // Clean up submission data even on error
    pendingSubmissions.delete(interaction.user.id);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ An error occurred while submitting your flower. Please try again.',
        ephemeral: true,
      });
    }
  }
}
