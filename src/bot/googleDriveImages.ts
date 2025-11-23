import { Readable } from 'stream';

import { google } from 'googleapis';
import fetch from 'node-fetch';

export async function fetchDiscordImage(
  discordImageUrl: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  const response = await fetch(discordImageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image from Discord: ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return { buffer, contentType };
}

export async function uploadImageToDrive(buffer: Buffer, contentType: string): Promise<string> {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  // OAuth2 Config (Preferred for personal accounts with storage quota)
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  // Service Account Config (Legacy)
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  let authClient;

  if (clientId && clientSecret && refreshToken) {
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    authClient = oauth2Client;
  } else if (clientEmail && privateKey) {
    authClient = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
  } else {
    throw new Error(
      'Missing Google Drive credentials. Please set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN (recommended) or Service Account variables.',
    );
  }

  if (!folderId) {
    throw new Error('Missing GOOGLE_DRIVE_FOLDER_ID environment variable');
  }

  const stream = Readable.from(buffer);

  const drive = google.drive({ version: 'v3', auth: authClient });

  // Upload to Drive
  const filename = `discord_${Date.now()}`;

  const fileMetadata = {
    name: filename,
    parents: [folderId],
  };

  const media = {
    mimeType: contentType,
    body: stream,
  };

  const file = await drive.files.create({
    requestBody: fileMetadata,
    media: media,
    fields: 'id',
  });

  const fileId = file.data.id;
  if (!fileId) {
    throw new Error('Failed to upload file to Google Drive');
  }

  // Make public
  await drive.permissions.create({
    fileId: fileId,
    requestBody: {
      role: 'reader',
      type: 'anyone',
    },
  });

  // Return link
  return `https://drive.google.com/uc?id=${fileId}`;
}

export async function saveDiscordImageToDrive(discordImageUrl: string): Promise<string> {
  const { buffer, contentType } = await fetchDiscordImage(discordImageUrl);
  return await uploadImageToDrive(buffer, contentType);
}
