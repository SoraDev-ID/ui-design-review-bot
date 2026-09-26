#!/usr/bin/env node
/**
 * UI Design Review Bot - CLI Entry Point
 *
 * Usage:
 *   npm run review -- --design=./figma-export.png --url=https://staging.myapp.com --viewport=1440x900
 *   npm run review -- --design=./figma-export.png --url=http://localhost:3000
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { runReview } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const program = new Command();

program
  .name('ui-review')
  .description('🤖 UI Design Review Bot — Compare design reference vs deployed app')
  .version('1.0.0')
  .requiredOption('--design <path>', 'Path to design reference image (PNG/JPG from Figma export)')
  .requiredOption('--url <url>', 'URL of deployed app or localhost to review')
  .option('--viewport <size>', 'Viewport size in WIDTHxHEIGHT format', '1440x900')
  .option('--output <dir>', 'Output directory for review results', './review-output')
  .option('--selector <css>', 'CSS selector to capture specific element (optional)')
  .option('--wait <ms>', 'Wait time in ms after page load for animations', '2000')
  .option('--breakpoints <sizes>', 'Comma-separated viewport sizes to test (e.g. 375x812,768x1024,1440x900)', '')
  .option('--threshold <number>', 'Pixel diff threshold 0-1 (lower=stricter)', '0.1')
  .option('--no-diff', 'Skip generating diff overlay image')
  .option('--no-annotate', 'Skip generating annotated screenshot')
  .addHelpText('after', `
${chalk.bold('Examples:')}
  ${chalk.cyan('npm run review -- --design=./figma-export.png --url=https://staging.myapp.com')}
  ${chalk.cyan('npm run review -- --design=./design.png --url=http://localhost:3000 --viewport=375x812')}
  ${chalk.cyan('npm run review -- --design=./design.png --url=https://app.com --breakpoints=375x812,768x1024,1440x900')}

${chalk.bold('Output files:')}
  ${chalk.yellow('review-output/checklist.md')}          — Full review checklist with severity
  ${chalk.yellow('review-output/annotated-screenshot.png')} — Screenshot with issue highlights
  ${chalk.yellow('review-output/diff-overlay.png')}        — Pixel diff heatmap overlay
`);

program.parse();

const opts = program.opts();

// ─── Validate inputs ───────────────────────────────────────────────────────────
if (!fs.existsSync(opts.design)) {
  console.error(chalk.red(`\n❌ Design file not found: ${opts.design}\n`));
  process.exit(1);
}

const [width, height] = opts.viewport.split('x').map(Number);
if (isNaN(width) || isNaN(height)) {
  console.error(chalk.red('\n❌ Invalid viewport format. Use WIDTHxHEIGHT (e.g. 1440x900)\n'));
  process.exit(1);
}

// ─── Parse breakpoints ─────────────────────────────────────────────────────────
let breakpoints = [];
if (opts.breakpoints) {
  breakpoints = opts.breakpoints.split(',').map(bp => {
    const [w, h] = bp.trim().split('x').map(Number);
    return { width: w, height: h, label: bp.trim() };
  }).filter(bp => !isNaN(bp.width) && !isNaN(bp.height));
}

// Add primary viewport if not in breakpoints
const primaryViewport = { width, height, label: opts.viewport };
if (breakpoints.length === 0) {
  breakpoints = [primaryViewport];
}

// ─── Display banner ────────────────────────────────────────────────────────────
console.log(chalk.bold.cyan(`
╔══════════════════════════════════════════════════════╗
║          🤖  UI Design Review Bot  v1.0.0            ║
║     Automated Visual & Structural Design Review      ║
╚══════════════════════════════════════════════════════╝
`));

console.log(chalk.dim('Configuration:'));
console.log(`  ${chalk.bold('Design File:')}  ${chalk.yellow(path.resolve(opts.design))}`);
console.log(`  ${chalk.bold('Target URL:')}   ${chalk.yellow(opts.url)}`);
console.log(`  ${chalk.bold('Viewport:')}     ${chalk.yellow(opts.viewport)}`);
if (breakpoints.length > 1) {
  console.log(`  ${chalk.bold('Breakpoints:')} ${chalk.yellow(breakpoints.map(b => b.label).join(', '))}`);
}
console.log(`  ${chalk.bold('Output:')}       ${chalk.yellow(path.resolve(opts.output))}`);
console.log('');

// ─── Run Review ────────────────────────────────────────────────────────────────
const spinner = ora({ text: 'Starting review...', color: 'cyan' }).start();

try {
  const results = await runReview({
    designPath: path.resolve(opts.design),
    url: opts.url,
    primaryViewport,
    breakpoints,
    outputDir: path.resolve(opts.output),
    selector: opts.selector || null,
    waitMs: parseInt(opts.wait),
    threshold: parseFloat(opts.threshold),
    generateDiff: opts.diff !== false,
    generateAnnotated: opts.annotate !== false,
  }, spinner);

  spinner.succeed(chalk.green('Review complete!'));

  // ─── Summary ──────────────────────────────────────────────────────────────────
  console.log(chalk.bold('\n📊 Review Summary:'));
  console.log(`  ${chalk.red('🔴 Critical:')} ${results.summary.critical}`);
  console.log(`  ${chalk.yellow('🟡 Major:')}    ${results.summary.major}`);
  console.log(`  ${chalk.blue('🔵 Minor:')}    ${results.summary.minor}`);
  console.log(`  ${chalk.dim('─────────────────────')}`);
  console.log(`  ${chalk.bold('Total Issues:')} ${results.summary.total}`);
  console.log(`  ${chalk.bold('Pixel Diff:')}   ${results.summary.pixelDiffPercent.toFixed(2)}%`);

  console.log(chalk.bold('\n📁 Output Files:'));
  results.outputFiles.forEach(f => {
    console.log(`  ${chalk.cyan('→')} ${chalk.underline(f)}`);
  });

  console.log('');

  if (results.summary.critical > 0) {
    console.log(chalk.red.bold('⚠️  Critical issues found! Review checklist.md for details.\n'));
    process.exit(2);
  } else {
    console.log(chalk.green('✅ No critical issues detected.\n'));
  }
} catch (err) {
  spinner.fail(chalk.red('Review failed!'));
  console.error(chalk.red('\n❌ Error:'), err.message);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
}
