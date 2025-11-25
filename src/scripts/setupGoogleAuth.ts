/*

However, a new refresh token might be generated or an old one invalidated under these specific conditions:

App Status is "Testing": If your Google Cloud Project's OAuth consent screen is set to "Testing" (not "In Production"), the refresh token will expire automatically after 7 days.
Revocation: The user manually revokes access to the app in their Google Account settings.
Inactivity: The token has not been used for 6 months.
Limit Exceeded: There is a limit of 50 refresh tokens per user account per client. If a 51st token is generated, the oldest one is automatically revoked.
Password Change: In some cases, changing the Google account password may revoke outstanding tokens.

*/

import readline from 'readline';

import { google } from 'googleapis';
import 'dotenv/config';

// 1. Read credentials from .env
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob'; // Special URI for desktop apps

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    '❌ Error: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in your .env file.',
  );
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const SCOPES = ['https://www.googleapis.com/auth/drive'];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log('--- Google Drive OAuth2 Setup ---');
console.log('1. Open this URL in your browser:');
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline', // Critical for getting a refresh token
  scope: SCOPES,
});
console.log(`\n${authUrl}\n`);

console.log('2. Authorize the app with your Google Account.');
console.log('3. Copy the code provided by Google and paste it here:');

rl.question('Enter the code: ', async (code) => {
  try {
    const { tokens } = await oauth2Client.getToken(code);
    console.log('\n✅ Success! Here is your refresh token for .env:');
    console.log('------------------------------------------------');
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log('------------------------------------------------');
    console.log('Add these to your .env file and remove the Service Account variables.');
  } catch (error) {
    console.error('\n❌ Error retrieving access token:', error);
  }
  rl.close();
});
