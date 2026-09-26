/**
 * Image Compare Module
 *
 * Uses pixelmatch for pixel-by-pixel comparison between the design reference
 * and the captured screenshot. Outputs a diff heatmap image.
 * Uses sharp to resize images to match dimensions before comparing.
 */

import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import sharp from 'sharp';

/**
 * Compare design reference against captured screenshot
 *
 * @param {Object} opts
 * @param {string} opts.designPath - Path to design reference image
 * @param {string} opts.screenshotPath - Path to captured screenshot
 * @param {string} opts.outputDir - Directory to save diff output
 * @param {number} opts.threshold - Pixel match threshold (0-1)
 * @param {boolean} opts.generateDiff - Whether to generate diff image
 * @returns {Promise<Object>} Comparison result with diff percentage and regions
 */
export async function compareImages({
  designPath,
  screenshotPath,
  outputDir,
  threshold = 0.1,
  generateDiff = true,
}) {
  // ─── Load & normalize both images to same dimensions ─────────────────────────
  const screenshotMeta = await sharp(screenshotPath).metadata();
  const targetWidth = screenshotMeta.width;
  const targetHeight = screenshotMeta.height;

  // Resize design to match screenshot dimensions (maintaining aspect for compare)
  const designResized = await sharp(designPath)
    .resize(targetWidth, targetHeight, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png()
    .toBuffer();

  // Ensure screenshot is also raw PNG
  const screenshotBuffer = await sharp(screenshotPath)
    .resize(targetWidth, targetHeight)
    .png()
    .toBuffer();

  // ─── Parse into PNG objects ───────────────────────────────────────────────────
  const designPng = PNG.sync.read(designResized);
  const screenshotPng = PNG.sync.read(screenshotBuffer);

  const { width, height } = designPng;
  const diffPng = new PNG({ width, height });

  // ─── Run pixel comparison ─────────────────────────────────────────────────────
  const numDiffPixels = pixelmatch(
    designPng.data,
    screenshotPng.data,
    diffPng.data,
    width,
    height,
    {
      threshold,
      includeAA: false,       // Exclude anti-aliasing differences
      alpha: 0.3,             // Reduced alpha for unchanged areas
      diffColor: [255, 0, 80], // Bright red for differences
      diffColorAlt: [0, 255, 136], // Green for acceptable diff
    }
  );

  const totalPixels = width * height;
  const diffPercent = (numDiffPixels / totalPixels) * 100;

  let diffImagePath = null;
  let maxDiffRegion = null;

  if (generateDiff) {
    // ─── Save raw diff image ────────────────────────────────────────────────────
    const rawDiffPath = path.join(outputDir, '_raw-diff.png');
    const diffBuffer = PNG.sync.write(diffPng);
    fs.writeFileSync(rawDiffPath, diffBuffer);

    // ─── Create enhanced diff overlay (50% design, 50% screenshot, diff on top) ─
    diffImagePath = path.join(outputDir, 'diff-overlay.png');

    await sharp(screenshotBuffer)
      .composite([
        {
          input: designResized,
          blend: 'overlay',
          raw: { width, height, channels: 4 },
        },
        {
          input: diffBuffer,
          blend: 'multiply',
        },
      ])
      .png()
      .toFile(diffImagePath)
      .catch(async () => {
        // Fallback: just save the diff image directly
        await sharp(diffBuffer)
          .png()
          .toFile(diffImagePath);
      });

    // Clean up temp file
    fs.unlinkSync(rawDiffPath);

    // ─── Find largest diff region for annotation ──────────────────────────────
    maxDiffRegion = findLargestDiffRegion(diffPng.data, width, height);
  }

  return {
    diffPercent,
    numDiffPixels,
    totalPixels,
    diffImagePath,
    maxDiffRegion,
    dimensions: { width, height },
  };
}

/**
 * Find the bounding box of the largest cluster of differing pixels
 * @param {Buffer} diffData - Raw RGBA pixel data from diff PNG
 * @param {number} width
 * @param {number} height
 * @returns {{ x: number, y: number, width: number, height: number } | null}
 */
function findLargestDiffRegion(diffData, width, height) {
  let minX = width, minY = height, maxX = 0, maxY = 0;
  let hasDiff = false;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = diffData[idx];
      const g = diffData[idx + 1];
      const b = diffData[idx + 2];

      // Detect red diff pixels (from pixelmatch's diffColor)
      if (r > 200 && g < 100 && b < 100) {
        hasDiff = true;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!hasDiff) return null;

  // Add padding around the detected region
  const padding = 10;
  return {
    x: Math.max(0, minX - padding),
    y: Math.max(0, minY - padding),
    width: Math.min(width - minX, maxX - minX + padding * 2),
    height: Math.min(height - minY, maxY - minY + padding * 2),
  };
}
