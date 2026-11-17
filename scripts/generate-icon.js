const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

// CRC32 table for PNG chunks
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) c = 0xedb88320 ^ (c >>> 1);
    else c = c >>> 1;
  }
  crcTable[n] = c >>> 0;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const typeAndData = chunk.subarray(4, 8 + len);
  const crc = crc32(typeAndData);
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

function createPng(width, height, pixelFn) {
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = makeChunk('IHDR', ihdrData);

  // Scanlines with filter byte 0
  const rowLen = 1 + width * 4;
  const rawData = Buffer.alloc(rowLen * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowLen;
    rawData[rowOffset] = 0; // Filter None
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = pixelFn(x, y, width, height);
      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  const compressedData = zlib.deflateSync(rawData, { level: 9 });
  const idat = makeChunk('IDAT', compressedData);
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([header, ihdr, idat, iend]);
}

// 1024x1024 SoundCloud App Icon Generator
const WIDTH = 1024;
const HEIGHT = 1024;

// Rounded square distance check
function inRoundedRect(x, y, x0, y0, w, h, r) {
  const x1 = x0 + r;
  const x2 = x0 + w - r;
  const y1 = y0 + r;
  const y2 = y0 + h - r;

  if (x >= x1 && x <= x2 && y >= y0 && y <= y0 + h) return true;
  if (x >= x0 && x <= x0 + w && y >= y1 && y <= y2) return true;

  if (x < x1 && y < y1) return Math.hypot(x - x1, y - y1) <= r;
  if (x > x2 && y < y1) return Math.hypot(x - x2, y - y1) <= r;
  if (x < x1 && y > y2) return Math.hypot(x - x1, y - y2) <= r;
  if (x > x2 && y > y2) return Math.hypot(x - x2, y - y2) <= r;
  return false;
}

// Check if pixel is inside SoundCloud cloud + waveform bars
function inSoundCloudEmblem(x, y) {
  // Center is at (512, 530)
  // Waveform bars on left side:
  // Bars at x positions between 220 and 520
  const barYBottom = 660;
  const barWidth = 18;
  const barGap = 16;
  const barPitch = barWidth + barGap; // 34px

  // 9 vertical waveform bars
  const barHeights = [90, 140, 190, 240, 280, 310, 335, 350, 360];
  const barStartX = 230;

  for (let i = 0; i < barHeights.length; i++) {
    const bx = barStartX + i * barPitch;
    const bh = barHeights[i];
    const byTop = barYBottom - bh;
    if (x >= bx && x <= bx + barWidth) {
      // Rounded ends on each bar
      const r = barWidth / 2;
      const cyTop = byTop + r;
      const cyBottom = barYBottom - r;
      if (y >= cyTop && y <= cyBottom) return true;
      if (y < cyTop && Math.hypot(x - (bx + r), y - cyTop) <= r) return true;
      if (y > cyBottom && Math.hypot(x - (bx + r), y - cyBottom) <= r) return true;
    }
  }

  // Cloud puffs on the right side:
  // Flat bottom connecting from x=500 to x=790 at y=660
  // Puff 1 (small right): center around (760, 595), radius 65
  // Puff 2 (middle right): center around (690, 480), radius 120
  // Puff 3 (main top): center around (555, 410), radius 110
  // Puff 4 (top-mid left): center around (460, 450), radius 75

  // Bottom body fill between x=500 and 790, y between 480 and 660
  if (x >= 520 && x <= 790 && y >= 500 && y <= 660) {
    if (x > 750 && y > 600) {
      if (Math.hypot(x - 730, y - 600) <= 60) return true;
    } else {
      return true;
    }
  }

  if (Math.hypot(x - 735, y - 595) <= 65) return true;
  if (Math.hypot(x - 670, y - 485) <= 125) return true;
  if (Math.hypot(x - 540, y - 410) <= 115) return true;
  if (Math.hypot(x - 450, y - 460) <= 75) return true;

  return false;
}

const pngBuffer = createPng(WIDTH, HEIGHT, (x, y) => {
  // Background squircle with radius 200 at margin 40
  const isBg = inRoundedRect(x, y, 40, 40, 944, 944, 210);
  if (!isBg) {
    return [0, 0, 0, 0]; // Transparent outside squircle
  }

  const isEmblem = inSoundCloudEmblem(x, y);
  if (isEmblem) {
    return [255, 255, 255, 255]; // Crisp white emblem
  }

  // SoundCloud Orange: #ff5500
  return [255, 85, 0, 255];
});

fs.writeFileSync(path.join(__dirname, '..', 'app-icon.png'), pngBuffer);
console.log('Successfully generated app-icon.png (1024x1024)');
