/**
 * Annotator Module
 *
 * Uses sharp to overlay colored bounding boxes and numbered labels
 * on the captured screenshot, highlighting each detected issue.
 *
 * Color coding by severity:
 *   - Critical: Red (#FF0050)
 *   - Major: Orange (#FF8C00)
 *   - Minor: Blue (#0099FF)
 */

import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

// Severity → color mapping (RGBA)
const SEVERITY_COLORS = {
  critical: { r: 255, g: 0, b: 80, a: 1, hex: '#FF0050' },
  major: { r: 255, g: 140, b: 0, a: 1, hex: '#FF8C00' },
  minor: { r: 0, g: 153, b: 255, a: 1, hex: '#0099FF' },
};

/**
 * Annotate a screenshot with issue bounding boxes and numbered labels
 *
 * @param {Object} opts
 * @param {string} opts.screenshotPath - Path to the captured screenshot PNG
 * @param {Array} opts.issues - Array of issue objects with region data
 * @param {string} opts.outputDir - Output directory
 * @returns {Promise<string>} Path to annotated screenshot
 */
export async function annotateScreenshot({ screenshotPath, issues, outputDir }) {
  const outputPath = path.join(outputDir, 'annotated-screenshot.png');

  // Get image dimensions
  const meta = await sharp(screenshotPath).metadata();
  const { width, height } = meta;

  // Filter issues that have spatial regions
  const annotatable = issues.filter(
    issue => issue.region &&
    issue.region.x >= 0 &&
    issue.region.y >= 0 &&
    issue.region.width > 0 &&
    issue.region.height > 0
  );

  if (annotatable.length === 0) {
    // No regions to annotate — just copy screenshot with a banner
    await sharp(screenshotPath)
      .composite([{
        input: createBannerSvg(width, issues.length),
        top: 0,
        left: 0,
      }])
      .png()
      .toFile(outputPath);

    return outputPath;
  }

  // ─── Build SVG overlay with all annotations ───────────────────────────────────
  const svgAnnotations = annotatable.map((issue, idx) => {
    const color = SEVERITY_COLORS[issue.severity] || SEVERITY_COLORS.minor;

    // Clamp region to image bounds
    const x = Math.max(0, Math.min(issue.region.x, width - 4));
    const y = Math.max(0, Math.min(issue.region.y, height - 4));
    const w = Math.min(issue.region.width, width - x);
    const h = Math.min(issue.region.height, height - y);

    const labelNum = idx + 1;
    const labelSize = 22;
    const labelX = Math.min(x, width - labelSize - 4);
    const labelY = Math.max(y - labelSize, 0);

    return `
      <!-- Issue ${labelNum}: ${escapeXml(issue.title.slice(0, 40))} -->
      <rect x="${x}" y="${y}" width="${w}" height="${h}"
        fill="none"
        stroke="${color.hex}"
        stroke-width="3"
        stroke-dasharray="${issue.severity === 'minor' ? '6,4' : 'none'}"
        opacity="0.9"
      />
      <!-- Label badge -->
      <rect x="${labelX}" y="${labelY}" width="${labelSize}" height="${labelSize}"
        fill="${color.hex}" rx="4" ry="4" opacity="0.95"
      />
      <text x="${labelX + labelSize / 2}" y="${labelY + labelSize / 2 + 1}"
        font-family="Arial, sans-serif"
        font-size="13"
        font-weight="bold"
        fill="white"
        text-anchor="middle"
        dominant-baseline="middle"
      >${labelNum}</text>
    `;
  }).join('\n');

  // Create legend
  const legendItems = [
    { label: '🔴 Critical', color: '#FF0050' },
    { label: '🟠 Major', color: '#FF8C00' },
    { label: '🔵 Minor', color: '#0099FF' },
  ];

  const legendSvg = `
    <rect x="10" y="${height - 90}" width="200" height="80"
      fill="rgba(0,0,0,0.75)" rx="8" ry="8"/>
    <text x="20" y="${height - 68}" font-family="Arial" font-size="11" fill="#999">Issues Legend</text>
    ${legendItems.map((item, i) => `
      <rect x="20" y="${height - 55 + i * 16}" width="10" height="10"
        fill="${item.color}" rx="2"/>
      <text x="36" y="${height - 46 + i * 16}" font-family="Arial" font-size="11" fill="white">${item.label}</text>
    `).join('')}
  `;

  // Total count badge
  const countBadge = `
    <rect x="${width - 180}" y="10" width="170" height="38"
      fill="rgba(0,0,0,0.8)" rx="8" ry="8"/>
    <text x="${width - 95}" y="24"
      font-family="Arial, sans-serif" font-size="11" fill="#999"
      text-anchor="middle">UI REVIEW BOT</text>
    <text x="${width - 95}" y="40"
      font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="white"
      text-anchor="middle">${issues.length} Issues Found (${annotatable.length} Annotated)</text>
  `;

  const svgOverlay = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      ${svgAnnotations}
      ${legendSvg}
      ${countBadge}
    </svg>
  `;

  // ─── Composite SVG over screenshot ────────────────────────────────────────────
  await sharp(screenshotPath)
    .composite([{
      input: Buffer.from(svgOverlay),
      top: 0,
      left: 0,
    }])
    .png()
    .toFile(outputPath);

  return outputPath;
}

/**
 * Create an info banner SVG for screenshots with no regional issues
 */
function createBannerSvg(width, issueCount) {
  return Buffer.from(`
    <svg width="${width}" height="50" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="50" fill="rgba(0,0,0,0.8)"/>
      <text x="20" y="32" font-family="Arial" font-size="16" fill="white">
        🤖 UI Review Bot — ${issueCount} issue(s) found (no spatial regions to annotate)
      </text>
    </svg>
  `);
}

/**
 * Escape special XML characters for safe SVG embedding
 */
function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
