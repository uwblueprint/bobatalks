import { readFileSync } from 'fs';
import { join } from 'path';

import { GlobalFonts, createCanvas, loadImage } from '@napi-rs/canvas';

const CARD_WIDTH = 800;
const CARD_HEIGHT = 400;
const PADDING_X = 80;
const TEXT_AREA_WIDTH = CARD_WIDTH - PADDING_X * 2;
const MAX_FONT_SIZE = 24;
const MIN_FONT_SIZE = 16;
const LINE_HEIGHT_RATIO = 1.45;
const FONT_FAMILY = 'Inter';

const assetsDir = join(process.cwd(), 'src', 'bot', 'assets');
GlobalFonts.registerFromPath(join(assetsDir, 'Inter-Regular.ttf'), FONT_FAMILY);

const templatePath = join(assetsDir, 'flower-template.png');
let templateBuffer: Buffer;
try {
  templateBuffer = readFileSync(templatePath);
} catch {
  console.warn(`Flower template not found at ${templatePath}`);
  templateBuffer = Buffer.alloc(0);
}

function wrapText(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = words[0] ?? '';

  for (let i = 1; i < words.length; i++) {
    const testLine = `${currentLine} ${words[i]}`;
    if (ctx.measureText(testLine).width > maxWidth) {
      lines.push(currentLine);
      currentLine = words[i];
    } else {
      currentLine = testLine;
    }
  }
  lines.push(currentLine);
  return lines;
}

/**
 * Finds the largest font size (between MIN and MAX) where the message
 * fits within the card's text-safe zone, then renders the card.
 */
export async function generateFlowerCard(message: string): Promise<Buffer | null> {
  if (templateBuffer.length === 0) return null;

  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext('2d');

  const bg = await loadImage(templateBuffer);
  ctx.drawImage(bg, 0, 0, CARD_WIDTH, CARD_HEIGHT);

  const textColor = '#4a3252';
  const maxTextHeight = CARD_HEIGHT - 120;

  let fontSize = MAX_FONT_SIZE;
  let lines: string[] = [];
  let lineHeight: number;

  // Step down font size until the message fits vertically
  while (fontSize >= MIN_FONT_SIZE) {
    ctx.font = `${fontSize}px ${FONT_FAMILY}`;
    lines = wrapText(ctx, message, TEXT_AREA_WIDTH);
    lineHeight = fontSize * LINE_HEIGHT_RATIO;
    if (lines.length * lineHeight <= maxTextHeight) break;
    fontSize -= 2;
  }

  lineHeight = fontSize * LINE_HEIGHT_RATIO;

  // If still overflowing at min size, truncate
  const maxLines = Math.floor(maxTextHeight / lineHeight);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '…');
  }

  const totalHeight = lines.length * lineHeight;
  const startY = (CARD_HEIGHT - totalHeight) / 2;

  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = `${fontSize}px ${FONT_FAMILY}`;

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], CARD_WIDTH / 2, startY + i * lineHeight);
  }

  return canvas.toBuffer('image/png');
}
