import { readFileSync } from 'fs';
import { join } from 'path';

import { GlobalFonts, createCanvas, loadImage } from '@napi-rs/canvas';

const CARD_WIDTH = 800;
const TEXT_ONLY_HEIGHT = 400;
const PADDING_X = 80;
const TEXT_AREA_WIDTH = CARD_WIDTH - PADDING_X * 2;
const MAX_FONT_SIZE = 24;
const MIN_FONT_SIZE = 16;
const LINE_HEIGHT_RATIO = 1.45;
const FONT_FAMILY = 'Inter';
const TEXT_COLOR = '#4a3252';

const DECOR_HEIGHT = 100;
const DECOR_PADDING = 30;
const IMAGE_MAX_HEIGHT = 350;
const IMAGE_CORNER_RADIUS = 8;
const IMAGE_TEXT_GAP = 24;
const MAX_CARD_HEIGHT = 900;
const IMAGE_TEXT_BUDGET = 200;

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

type Ctx = ReturnType<ReturnType<typeof createCanvas>['getContext']>;

function wrapText(ctx: Ctx, text: string, maxWidth: number): string[] {
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

function fitText(
  ctx: Ctx,
  message: string,
  maxHeight: number,
): { lines: string[]; fontSize: number; lineHeight: number } {
  let fontSize = MAX_FONT_SIZE;
  let lines: string[] = [];
  let lineHeight = fontSize * LINE_HEIGHT_RATIO;

  while (fontSize >= MIN_FONT_SIZE) {
    ctx.font = `${fontSize}px ${FONT_FAMILY}`;
    lines = wrapText(ctx, message, TEXT_AREA_WIDTH);
    lineHeight = fontSize * LINE_HEIGHT_RATIO;
    if (lines.length * lineHeight <= maxHeight) break;
    fontSize -= 2;
  }

  lineHeight = fontSize * LINE_HEIGHT_RATIO;
  const maxLines = Math.floor(maxHeight / lineHeight);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '…');
  }

  return { lines, fontSize, lineHeight };
}

function drawCenteredText(ctx: Ctx, lines: string[], fontSize: number, startY: number): void {
  ctx.fillStyle = TEXT_COLOR;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = `${fontSize}px ${FONT_FAMILY}`;

  const lineHeight = fontSize * LINE_HEIGHT_RATIO;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], CARD_WIDTH / 2, startY + i * lineHeight);
  }
}

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url);
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Generates a flower card PNG with the message text rendered on a floral background.
 * When imageUrl is provided, the user image is composited above the text on a
 * dynamically-sized card; otherwise produces the standard 800x400 text-only card.
 */
export async function generateFlowerCard(
  message: string,
  imageUrl?: string,
): Promise<Buffer | null> {
  if (templateBuffer.length === 0) return null;

  const bg = await loadImage(templateBuffer);

  const userImgBuffer = imageUrl ? await fetchImageBuffer(imageUrl) : null;
  const userImg = userImgBuffer ? await loadImage(userImgBuffer).catch(() => null) : null;

  if (!userImg) {
    const canvas = createCanvas(CARD_WIDTH, TEXT_ONLY_HEIGHT);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bg, 0, 0, CARD_WIDTH, TEXT_ONLY_HEIGHT);

    const { lines, fontSize, lineHeight } = fitText(ctx, message, TEXT_ONLY_HEIGHT - 120);
    const startY = (TEXT_ONLY_HEIGHT - lines.length * lineHeight) / 2;
    drawCenteredText(ctx, lines, fontSize, startY);

    return canvas.toBuffer('image/png');
  }

  // Scale user image to fit within content area
  const scale = Math.min(TEXT_AREA_WIDTH / userImg.width, IMAGE_MAX_HEIGHT / userImg.height, 1);
  const imgW = Math.round(userImg.width * scale);
  const imgH = Math.round(userImg.height * scale);

  // Pre-measure text to determine total canvas height
  const measCtx = createCanvas(CARD_WIDTH, 100).getContext('2d');
  const { lines, fontSize, lineHeight } = fitText(measCtx, message, IMAGE_TEXT_BUDGET);
  const textBlockHeight = lines.length * lineHeight;

  const canvasHeight = Math.min(
    DECOR_HEIGHT +
      DECOR_PADDING +
      imgH +
      IMAGE_TEXT_GAP +
      textBlockHeight +
      DECOR_PADDING +
      DECOR_HEIGHT,
    MAX_CARD_HEIGHT,
  );

  const canvas = createCanvas(CARD_WIDTH, canvasHeight);
  const ctx = canvas.getContext('2d');

  // Pink gradient background matching the template
  const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, canvasHeight);
  gradient.addColorStop(0, '#fce4f0');
  gradient.addColorStop(1, '#f8d8f0');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CARD_WIDTH, canvasHeight);

  // Floral decorations: top and bottom strips from the template
  ctx.drawImage(bg, 0, 0, CARD_WIDTH, DECOR_HEIGHT, 0, 0, CARD_WIDTH, DECOR_HEIGHT);
  ctx.drawImage(
    bg,
    0,
    TEXT_ONLY_HEIGHT - DECOR_HEIGHT,
    CARD_WIDTH,
    DECOR_HEIGHT,
    0,
    canvasHeight - DECOR_HEIGHT,
    CARD_WIDTH,
    DECOR_HEIGHT,
  );

  // User image with rounded corners
  const imgX = (CARD_WIDTH - imgW) / 2;
  const imgY = DECOR_HEIGHT + DECOR_PADDING;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(imgX, imgY, imgW, imgH, IMAGE_CORNER_RADIUS);
  ctx.clip();
  ctx.drawImage(userImg, imgX, imgY, imgW, imgH);
  ctx.restore();

  // Message text centered below image
  const textY = imgY + imgH + IMAGE_TEXT_GAP;
  drawCenteredText(ctx, lines, fontSize, textY);

  return canvas.toBuffer('image/png');
}
