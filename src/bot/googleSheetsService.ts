import { randomUUID } from 'crypto';
import * as path from 'path';

import * as dotenv from 'dotenv';
import { JWT } from 'google-auth-library';
import { google } from 'googleapis';
import { z } from 'zod';

process.env.DOTENV_CONFIG_QUIET = 'true'; // surpressing dotenv output
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Zod schema for validation
export const FlowerSchema = z.object({
  id: z.string().uuid(),
  name: z.string().optional(),
  username: z.string().optional(),
  message: z.string().min(1),
  picture: z.string().url().optional(),
  website: z.boolean(),
  approved: z.boolean().optional().default(false),
});

export type Flower = z.infer<typeof FlowerSchema>;

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const FLOWER_SHEET_NAME = 'Flowers'; // Centralized sheet name (the tab at the bottom)
const HEADER_ROW_COUNT = 1; // Number of rows (inclusive) to reserve for headers/guides
const MAX_ROWS_TO_SEARCH = 100; // Manually editable limit for search range

// --- Google Sheets Authentication ---
async function getAuthToken() {
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  // Handles the literal '\n' characters in the .env file
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!serviceAccountEmail || !privateKey) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY must be set in the .env file',
    );
  }

  const auth = new JWT({
    email: serviceAccountEmail,
    key: privateKey,
    scopes: SCOPES,
  });

  return auth;
}

async function getSheetsService() {
  const auth = await getAuthToken();
  return google.sheets({ version: 'v4', auth });
}

async function getSheetId() {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) {
    throw new Error('GOOGLE_SHEET_ID must be set in the .env file');
  }
  return sheetId;
}

// --- Data Transformation ---
function flowerToRow(flower: Flower): any[] {
  return [
    flower.id,
    flower.name || '',
    flower.username || '',
    flower.message,
    flower.picture || '',
    flower.website,
    flower.approved,
  ];
}

// --- Flower CRUD Operations ---

/**
 * Creates a single flower in the sheet.
 * @param flower A Flower object to create (without ID and approved - they will be generated/defaulted).
 * @returns The created Flower object with its generated ID.
 */
export async function createFlower(flower: Omit<Flower, 'id' | 'approved'>): Promise<Flower> {
  try {
    const sheets = await getSheetsService();
    const spreadsheetId = await getSheetId();

    // Generate ID for the flower and set default approved status
    const flowerWithId: Flower = {
      id: randomUUID(),
      approved: false,
      ...flower,
    };

    const validatedFlower = FlowerSchema.parse(flowerWithId);
    const values = [flowerToRow(validatedFlower)];

    // Find the first empty row to insert the flower
    const emptyRow = await findEmptyRow();
    if (!emptyRow) {
      throw new Error('Could not find an empty row to insert the flower');
    }

    const range = `${FLOWER_SHEET_NAME}!A${emptyRow}:G${emptyRow}`;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values,
      },
    });

    console.log(`Creating the flower in row ${emptyRow}`);
    return validatedFlower;
  } catch (error) {
    console.error('Error creating flower:', error);
    throw error;
  }
}

/**
 * Gets the row number of a flower by its ID.
 * @param id The UUID of the flower to find.
 * @returns The 1-indexed row number, or null if not found.
 */
async function getFlowerRow(id: string): Promise<number | null> {
  try {
    const sheets = await getSheetsService();
    const spreadsheetId = await getSheetId();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: FLOWER_SHEET_NAME,
    });

    const rows = response.data.values;
    if (!rows) {
      return null;
    }

    // Search through rows (skipping header), up to MAX_ROWS_TO_SEARCH
    const searchLimit = Math.min(HEADER_ROW_COUNT + MAX_ROWS_TO_SEARCH, rows.length);
    for (let i = HEADER_ROW_COUNT; i < searchLimit; i++) {
      const row = rows[i];
      // Check if the ID in column A matches
      if (row && row[0] === id) {
        return i + 1; // Convert to 1-indexed row number
      }
    }

    return null;
  } catch (error) {
    console.error('Error finding flower row by ID:', error);
    return null;
  }
}

/**
 * Finds the first empty row in the sheet (where ID column is empty).
 * @returns The 1-indexed row number of the first empty row, or null if none found.
 */
async function findEmptyRow(): Promise<number | null> {
  try {
    const sheets = await getSheetsService();
    const spreadsheetId = await getSheetId();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: FLOWER_SHEET_NAME,
    });

    const rows = response.data.values;
    if (!rows) {
      // If no rows exist, the first data row after headers is empty
      return HEADER_ROW_COUNT + 1;
    }

    // Search through all rows (skipping header) to find first empty ID
    for (let i = HEADER_ROW_COUNT; i < rows.length; i++) {
      const row = rows[i];
      // Check if the row is empty or ID column (column A) is empty
      if (!row || !row[0] || row[0] === '') {
        return i + 1; // Convert to 1-indexed row number
      }
    }

    // If all rows are filled, return the next row after the last one
    return rows.length + 1;
  } catch (error) {
    console.error('Error finding empty row:', error);
    return null;
  }
}

/**
 * Updates a specific field of a flower by its ID.
 * @param id The UUID of the flower to update.
 * @param fieldName The name of the field to update (e.g., 'message', 'approved', 'website').
 * @param value The string value to set. Will be converted to the appropriate type (string or boolean).
 */
export async function updateFlower(id: string, fieldName: keyof Omit<Flower, 'id'>, value: string) {
  try {
    // Validate inputs
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid ID: ID must be a non-empty string');
    }

    if (!value || typeof value !== 'string') {
      throw new Error('Invalid value: Value must be a non-empty string');
    }

    const validFields: Array<keyof Omit<Flower, 'id'>> = [
      'name',
      'username',
      'message',
      'picture',
      'website',
      'approved',
    ];
    if (!validFields.includes(fieldName)) {
      throw new Error(
        `Invalid field name: '${String(fieldName)}'. Valid fields are: ${validFields.join(', ')}`,
      );
    }

    const sheets = await getSheetsService();
    const spreadsheetId = await getSheetId();
    const rowNumber = await getFlowerRow(id);

    if (!rowNumber) {
      throw new Error(`Flower with ID ${id} not found`);
    }

    // Get current flower data
    const currentRange = `${FLOWER_SHEET_NAME}!A${rowNumber}:G${rowNumber}`;
    const currentResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: currentRange,
    });

    const currentRow = currentResponse.data.values?.[0];
    if (!currentRow) {
      throw new Error(`No data found for flower with ID ${id}`);
    }

    // Reconstruct the current flower object
    const currentFlower: Flower = {
      id: currentRow[0],
      name: currentRow[1] || undefined,
      username: currentRow[2] || undefined,
      message: currentRow[3],
      picture: currentRow[4] || undefined,
      website: currentRow[5] === 'TRUE' || currentRow[5] === true,
      approved: currentRow[6] === 'TRUE' || currentRow[6] === true || false,
    };

    // Convert the value string to the appropriate type based on the field
    let convertedValue: any = value;
    if (fieldName === 'website' || fieldName === 'approved') {
      // Convert string to boolean, validate the input
      const lowerValue = value.toLowerCase();
      if (lowerValue !== 'true' && lowerValue !== 'false') {
        throw new Error(
          `Invalid value for '${fieldName}': Must be 'true' or 'false' (case-insensitive), got '${value}'`,
        );
      }
      convertedValue = lowerValue === 'true';
    } else if (fieldName === 'picture') {
      // Validate URL format if provided
      if (value && value !== '') {
        try {
          new URL(value);
        } catch {
          throw new Error(`Invalid value for 'picture': Must be a valid URL, got '${value}'`);
        }
      }
    } else if (fieldName === 'message') {
      // Validate message is not empty
      if (!value || value.trim() === '') {
        throw new Error(`Invalid value for 'message': Message cannot be empty`);
      }
    }

    // Update the specific field
    const updatedFlower: Flower = {
      ...currentFlower,
      [fieldName]: convertedValue,
    };

    // Validate and update
    const validatedFlower = FlowerSchema.parse(updatedFlower);
    const values = [flowerToRow(validatedFlower)];

    const response = await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: currentRange,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values,
      },
    });

    console.log(
      `Updating field '${String(fieldName)}' to '${value}' for flower in row ${rowNumber}`,
    );
    return response.data;
  } catch (error) {
    console.error(`Error updating flower with ID ${id}:`, error);
    throw error;
  }
}

/**
 * Deletes a flower by its ID.
 * @param id The UUID of the flower to delete.
 */
export async function deleteFlower(id: string) {
  try {
    const sheets = await getSheetsService();
    const spreadsheetId = await getSheetId();
    const rowNumber = await getFlowerRow(id);

    if (!rowNumber) {
      throw new Error(`Flower with ID ${id} not found`);
    }

    const range = `${FLOWER_SHEET_NAME}!A${rowNumber}:G${rowNumber}`;

    const response = await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range,
    });
    console.log('Successfully cleared row');
    return response.data;
  } catch (error) {
    console.error(`Error deleting flower with ID ${id}:`, error);
    throw error;
  }
}

// --- Sample Test ---
async function _main() {
  let createdFlowerId: string = '';

  try {
    // 1. CREATE a new flower
    console.log('\n=== TEST 1: CREATE FLOWER ===');
    const newFlowerData = {
      name: 'Rose',
      username: 'testuser4',
      message: 'This is a beautiful rose.',
      picture: 'http://example.com/rose.jpg',
      website: false,
    };
    const createdFlower = await createFlower(newFlowerData);
    createdFlowerId = createdFlower.id;
    console.log('✅ Flower created successfully');
    console.log(`   ID: ${createdFlowerId}`);

    // 2. UPDATE the flower
    console.log('\n=== TEST 2: UPDATE FLOWER ===');
    // Update the message
    await updateFlower(createdFlowerId, 'message', 'This is the updated message!');
    console.log('✅ Flower message updated successfully');

    // Set admin (approved) to TRUE
    await updateFlower(createdFlowerId, 'approved', 'true');
    console.log('✅ Flower approved status set to TRUE');

    // Verify the update
    const sheets = await getSheetsService();
    const spreadsheetId = await getSheetId();
    const rowNumber = await getFlowerRow(createdFlowerId);
    if (rowNumber) {
      const verifyResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${FLOWER_SHEET_NAME}!A${rowNumber}:G${rowNumber}`,
      });
      console.log('Updated flower data:', verifyResponse.data.values?.[0]);
    }

    // 3. DELETE the flower
    console.log('\n=== TEST 3: DELETE FLOWER ===');
    await deleteFlower(createdFlowerId);
    console.log('✅ Flower deleted successfully');

    // Verify the deletion
    const deletedRowNumber = await getFlowerRow(createdFlowerId);
    if (deletedRowNumber === null) {
      console.log('✅ Verified: Flower no longer exists in the sheet');
    } else {
      const verifyDeleteResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${FLOWER_SHEET_NAME}!A${deletedRowNumber}:G${deletedRowNumber}`,
      });
      const deletedRow = verifyDeleteResponse.data.values?.[0];
      if (!deletedRow || !deletedRow[0]) {
        console.log('✅ Verified: Row is empty after deletion');
      } else {
        console.log('⚠️ Warning: Row still contains data:', deletedRow);
      }
    }

    console.log('\n=== ALL TESTS COMPLETED SUCCESSFULLY ===');
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error);

    // Cleanup: Try to delete the flower if it was created
    if (createdFlowerId) {
      try {
        console.log('\nAttempting cleanup...');
        await deleteFlower(createdFlowerId);
        console.log('Cleanup successful');
      } catch (cleanupError) {
        console.error('Cleanup failed:', cleanupError);
      }
    }

    throw error;
  }
}

// Uncomment to run tests (make sure sheet has proper structure with ID in column A first)
_main().catch(console.error);
