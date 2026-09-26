/**
 * UI Design Review Bot - Main Orchestrator
 *
 * Coordinates: screenshot capture → pixel diff → analysis → annotation → report
 */

import path from 'path';
import fs from 'fs';
import { captureScreenshot } from './modules/screenshotter.js';
import { compareImages } from './modules/imageCompare.js';
import { analyzeTypography } from './modules/typographyAnalyzer.js';
import { analyzeContrast } from './modules/contrastAnalyzer.js';
import { analyzeBrokenState } from './modules/brokenStateAnalyzer.js';
import { annotateScreenshot } from './modules/annotator.js';
import { generateChecklist } from './modules/reportGenerator.js';

/**
 * Main review orchestration function
 * @param {Object} config - Review configuration
 * @param {import('ora').Ora} spinner - CLI spinner for status updates
 * @returns {Object} Review results summary
 */
export async function runReview(config, spinner) {
  const {
    designPath,
    url,
    primaryViewport,
    breakpoints,
    outputDir,
    selector,
    waitMs,
    threshold,
    generateDiff,
    generateAnnotated,
  } = config;

  // ─── Setup output directory ───────────────────────────────────────────────────
  fs.mkdirSync(outputDir, { recursive: true });

  const allIssues = [];
  const outputFiles = [];
  let pixelDiffPercent = 0;
  let capturedScreenshotPath = null;

  // ─── Phase 1: Capture screenshots for all breakpoints ─────────────────────────
  spinner.text = '📸 Launching browser and capturing screenshots...';

  const screenshotResults = [];
  for (const viewport of breakpoints) {
    spinner.text = `📸 Capturing screenshot at ${viewport.label}...`;

    const screenshotData = await captureScreenshot({
      url,
      viewport,
      selector,
      waitMs,
      outputDir,
    });

    screenshotResults.push({ viewport, ...screenshotData });
  }

  // Use primary viewport result for comparison
  const primaryResult = screenshotResults.find(
    r => r.viewport.label === primaryViewport.label
  ) || screenshotResults[0];

  capturedScreenshotPath = primaryResult.screenshotPath;

  // ─── Phase 2: Pixel-level image comparison ────────────────────────────────────
  spinner.text = '🔍 Comparing design reference with captured screenshot...';

  const comparisonResult = await compareImages({
    designPath,
    screenshotPath: capturedScreenshotPath,
    outputDir,
    threshold,
    generateDiff,
  });

  pixelDiffPercent = comparisonResult.diffPercent;

  if (comparisonResult.diffPercent > 1) {
    allIssues.push({
      category: 'spacing-layout',
      severity: comparisonResult.diffPercent > 10 ? 'critical' : comparisonResult.diffPercent > 5 ? 'major' : 'minor',
      title: 'Visual pixel difference detected',
      description: `${comparisonResult.diffPercent.toFixed(2)}% of pixels differ from design reference`,
      region: comparisonResult.maxDiffRegion || null,
    });
  }

  if (comparisonResult.diffImagePath) {
    outputFiles.push(comparisonResult.diffImagePath);
  }

  // ─── Phase 3: Typography analysis ────────────────────────────────────────────
  spinner.text = '🔤 Analyzing typography (fonts, sizes, weights)...';

  const typographyIssues = await analyzeTypography({
    page: primaryResult.page,
    selector: selector || 'body',
  });

  allIssues.push(...typographyIssues);

  // ─── Phase 4: Contrast & color analysis ──────────────────────────────────────
  spinner.text = '🎨 Analyzing color contrast (WCAG compliance)...';

  const contrastIssues = await analyzeContrast({
    page: primaryResult.page,
    screenshotPath: capturedScreenshotPath,
  });

  allIssues.push(...contrastIssues);

  // ─── Phase 5: Broken state analysis ──────────────────────────────────────────
  spinner.text = '🔧 Checking for broken states and errors...';

  const brokenStateIssues = await analyzeBrokenState({
    page: primaryResult.page,
    consoleErrors: primaryResult.consoleErrors,
    networkErrors: primaryResult.networkErrors,
    screenshotResults,
  });

  allIssues.push(...brokenStateIssues);

  // ─── Phase 6: Multi-breakpoint layout issues ──────────────────────────────────
  if (breakpoints.length > 1) {
    spinner.text = '📱 Analyzing layout across breakpoints...';

    for (const result of screenshotResults) {
      if (result.viewport.label !== primaryViewport.label) {
        const bpIssues = result.layoutIssues || [];
        bpIssues.forEach(issue => {
          issue.breakpoint = result.viewport.label;
          allIssues.push(issue);
        });
      }
    }
  }

  // Close all browser pages
  for (const result of screenshotResults) {
    if (result.page) {
      await result.page.close().catch(() => {});
    }
    if (result.browser) {
      await result.browser.close().catch(() => {});
    }
  }

  // ─── Phase 7: Annotate screenshot with issues ─────────────────────────────────
  let annotatedPath = null;
  if (generateAnnotated && allIssues.length > 0) {
    spinner.text = '🖊️ Generating annotated screenshot...';

    annotatedPath = await annotateScreenshot({
      screenshotPath: capturedScreenshotPath,
      issues: allIssues,
      outputDir,
    });

    outputFiles.push(annotatedPath);
  }

  // ─── Phase 8: Generate checklist report ──────────────────────────────────────
  spinner.text = '📝 Generating review checklist...';

  const checklistPath = await generateChecklist({
    issues: allIssues,
    config,
    outputDir,
    pixelDiffPercent,
    screenshotResults,
    annotatedPath,
  });

  outputFiles.push(checklistPath);

  // ─── Compute summary ──────────────────────────────────────────────────────────
  const summary = {
    critical: allIssues.filter(i => i.severity === 'critical').length,
    major: allIssues.filter(i => i.severity === 'major').length,
    minor: allIssues.filter(i => i.severity === 'minor').length,
    total: allIssues.length,
    pixelDiffPercent,
  };

  return { summary, outputFiles, issues: allIssues };
}
