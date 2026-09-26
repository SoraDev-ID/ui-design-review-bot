/**
 * Screenshotter Module
 *
 * Uses Playwright to launch a headless browser, navigate to the target URL,
 * and capture a full-page screenshot. Also collects console and network errors.
 */

import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

/**
 * Capture a screenshot of the target URL at a given viewport
 *
 * @param {Object} opts
 * @param {string} opts.url - Target URL to capture
 * @param {{ width: number, height: number, label: string }} opts.viewport
 * @param {string|null} opts.selector - Optional CSS selector to capture a specific element
 * @param {number} opts.waitMs - Wait time after load for animations to settle
 * @param {string} opts.outputDir - Directory to save the screenshot
 * @returns {Promise<Object>} Screenshot result with path, page, browser, errors
 */
export async function captureScreenshot({ url, viewport, selector, waitMs, outputDir }) {
  const consoleErrors = [];
  const networkErrors = [];
  const layoutIssues = [];

  // ─── Launch browser ──────────────────────────────────────────────────────────
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 2, // Retina quality screenshots
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  });

  const page = await context.newPage();

  // ─── Collect console errors ──────────────────────────────────────────────────
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push({
        text: msg.text(),
        location: msg.location(),
      });
    }
  });

  // ─── Collect network failures ────────────────────────────────────────────────
  page.on('requestfailed', request => {
    networkErrors.push({
      url: request.url(),
      method: request.method(),
      failure: request.failure()?.errorText || 'Unknown failure',
    });
  });

  // ─── Navigate & wait ─────────────────────────────────────────────────────────
  try {
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
  } catch (err) {
    // Fallback: wait for domcontentloaded if networkidle times out
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
  }

  // Wait for animations and lazy-loaded content
  await page.waitForTimeout(waitMs);

  // ─── Check for layout overflow issues ────────────────────────────────────────
  const overflowData = await page.evaluate(() => {
    const issues = [];
    const elements = document.querySelectorAll('*');
    const viewportWidth = window.innerWidth;

    for (const el of elements) {
      const rect = el.getBoundingClientRect();
      if (rect.right > viewportWidth + 5 && rect.width > 10) {
        issues.push({
          tag: el.tagName.toLowerCase(),
          id: el.id || null,
          className: el.className ? el.className.toString().slice(0, 50) : null,
          overflowBy: Math.round(rect.right - viewportWidth),
        });
        if (issues.length >= 10) break; // Cap at 10 overflow issues
      }
    }
    return issues;
  });

  overflowData.forEach(item => {
    layoutIssues.push({
      category: 'spacing-layout',
      severity: item.overflowBy > 20 ? 'major' : 'minor',
      title: `Horizontal overflow detected`,
      description: `Element <${item.tag}${item.id ? '#' + item.id : ''}> overflows viewport by ${item.overflowBy}px`,
      region: null,
    });
  });

  // ─── Take screenshot ─────────────────────────────────────────────────────────
  const safeLabel = viewport.label.replace('x', '-');
  const screenshotFilename = `screenshot-${safeLabel}.png`;
  const screenshotPath = path.join(outputDir, screenshotFilename);

  if (selector) {
    const element = await page.$(selector);
    if (element) {
      await element.screenshot({ path: screenshotPath });
    } else {
      console.warn(`\n⚠️  Selector "${selector}" not found, taking full page screenshot`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
    }
  } else {
    await page.screenshot({ path: screenshotPath, fullPage: false });
  }

  // ─── Check for broken images & icons ─────────────────────────────────────────
  const brokenImages = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'));
    return imgs
      .filter(img => !img.complete || img.naturalWidth === 0)
      .map(img => ({
        src: img.src || img.getAttribute('src') || 'unknown',
        alt: img.alt || null,
      }));
  });

  return {
    screenshotPath,
    page,
    browser,
    consoleErrors,
    networkErrors,
    layoutIssues,
    brokenImages,
    viewport,
  };
}
