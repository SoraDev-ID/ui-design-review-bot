/**
 * Report Generator Module
 *
 * Generates a comprehensive Markdown checklist report grouping issues
 * by category, severity, and providing detailed context for each finding.
 */

import fs from 'fs';
import path from 'path';

const CATEGORY_LABELS = {
  'spacing-layout': '📐 Spacing & Layout',
  'typography': '🔤 Typography',
  'contrast-color': '🎨 Contrast & Color',
  'broken-state': '🔧 Broken State',
};

const SEVERITY_EMOJI = {
  critical: '🔴',
  major: '🟠',
  minor: '🔵',
};

/**
 * Generate the markdown checklist report
 *
 * @param {Object} opts
 * @param {Array} opts.issues - All detected issues
 * @param {Object} opts.config - Review configuration
 * @param {string} opts.outputDir - Output directory
 * @param {number} opts.pixelDiffPercent - Pixel diff percentage
 * @param {Array} opts.screenshotResults - Screenshot results per viewport
 * @param {string|null} opts.annotatedPath - Path to annotated screenshot
 * @returns {Promise<string>} Path to generated checklist.md
 */
export async function generateChecklist({
  issues,
  config,
  outputDir,
  pixelDiffPercent,
  screenshotResults,
  annotatedPath,
}) {
  const timestamp = new Date().toISOString();
  const date = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  // ─── Compute stats ────────────────────────────────────────────────────────────
  const stats = {
    critical: issues.filter(i => i.severity === 'critical').length,
    major: issues.filter(i => i.severity === 'major').length,
    minor: issues.filter(i => i.severity === 'minor').length,
    total: issues.length,
  };

  const overallStatus = stats.critical > 0
    ? '❌ FAIL — Critical Issues Found'
    : stats.major > 3
    ? '⚠️ WARNING — Multiple Major Issues'
    : '✅ PASS — No Critical Issues';

  // ─── Group issues by category ─────────────────────────────────────────────────
  const byCategory = {};
  for (const [key] of Object.entries(CATEGORY_LABELS)) {
    byCategory[key] = issues.filter(i => i.category === key);
  }

  // ─── Build markdown content ───────────────────────────────────────────────────
  let md = '';

  // Header
  md += `# 🤖 UI Design Review Report\n\n`;
  md += `> Generated: ${date}\n\n`;

  // Summary table
  md += `## 📊 Summary\n\n`;
  md += `| Property | Value |\n`;
  md += `|----------|-------|\n`;
  md += `| **Status** | ${overallStatus} |\n`;
  md += `| **Target URL** | \`${config.url}\` |\n`;
  md += `| **Design Reference** | \`${path.basename(config.designPath)}\` |\n`;
  md += `| **Viewport** | ${config.primaryViewport.label} |\n`;
  md += `| **Pixel Difference** | ${pixelDiffPercent.toFixed(2)}% |\n`;
  md += `| **🔴 Critical** | ${stats.critical} |\n`;
  md += `| **🟠 Major** | ${stats.major} |\n`;
  md += `| **🔵 Minor** | ${stats.minor} |\n`;
  md += `| **Total Issues** | **${stats.total}** |\n`;
  md += '\n';

  // Breakpoints tested
  if (config.breakpoints.length > 1) {
    md += `**Breakpoints Tested:** ${config.breakpoints.map(b => `\`${b.label}\``).join(', ')}\n\n`;
  }

  // Output files
  md += `## 📁 Output Files\n\n`;
  md += `- \`checklist.md\` — This report\n`;
  if (annotatedPath) {
    md += `- \`annotated-screenshot.png\` — Screenshot with issue highlights\n`;
  }
  md += `- \`screenshot-${config.primaryViewport.label.replace('x', '-')}.png\` — Captured screenshot\n`;
  if (config.generateDiff) {
    md += `- \`diff-overlay.png\` — Pixel difference heatmap\n`;
  }
  md += '\n';

  // Visual diff summary
  md += `## 🔍 Visual Diff Summary\n\n`;
  if (pixelDiffPercent < 1) {
    md += `✅ **Excellent match** — Only ${pixelDiffPercent.toFixed(2)}% pixel difference from design reference.\n\n`;
  } else if (pixelDiffPercent < 5) {
    md += `🟡 **Minor differences** — ${pixelDiffPercent.toFixed(2)}% pixel difference. Review annotated areas.\n\n`;
  } else if (pixelDiffPercent < 15) {
    md += `🟠 **Moderate differences** — ${pixelDiffPercent.toFixed(2)}% pixel difference. Significant deviations from design.\n\n`;
  } else {
    md += `🔴 **Major differences** — ${pixelDiffPercent.toFixed(2)}% pixel difference. Implementation significantly differs from design.\n\n`;
  }

  // ─── Issue checklist by category ─────────────────────────────────────────────
  md += `---\n\n`;
  md += `## 📋 Issue Checklist\n\n`;
  md += `> **Severity key:** 🔴 Critical (blocks release) | 🟠 Major (must fix) | 🔵 Minor (nice to fix)\n\n`;

  let globalIssueNum = 1;
  let hasAnyIssue = false;

  for (const [categoryKey, categoryLabel] of Object.entries(CATEGORY_LABELS)) {
    const categoryIssues = byCategory[categoryKey] || [];

    md += `### ${categoryLabel}\n\n`;

    if (categoryIssues.length === 0) {
      md += `✅ No issues found in this category.\n\n`;
      continue;
    }

    hasAnyIssue = true;

    // Sort by severity (critical first)
    const sorted = categoryIssues.sort((a, b) => {
      const order = { critical: 0, major: 1, minor: 2 };
      return order[a.severity] - order[b.severity];
    });

    sorted.forEach(issue => {
      const emoji = SEVERITY_EMOJI[issue.severity];
      const severityBadge = issue.severity.charAt(0).toUpperCase() + issue.severity.slice(1);

      md += `- [ ] **[#${globalIssueNum}]** ${emoji} \`${severityBadge}\` — **${issue.title}**\n`;
      md += `  > ${issue.description}\n`;

      if (issue.region) {
        md += `  > 📍 Location: x:${issue.region.x}, y:${issue.region.y} (${issue.region.width}×${issue.region.height}px)\n`;
      }
      if (issue.breakpoint) {
        md += `  > 📱 Breakpoint: \`${issue.breakpoint}\`\n`;
      }
      md += '\n';
      globalIssueNum++;
    });
  }

  if (!hasAnyIssue) {
    md += `\n🎉 **No issues detected!** The implementation matches the design reference closely.\n\n`;
  }

  // ─── Recommendations section ──────────────────────────────────────────────────
  md += `---\n\n`;
  md += `## 💡 Recommendations\n\n`;

  if (stats.critical > 0) {
    md += `### 🔴 Immediate Actions Required\n\n`;
    md += `${stats.critical} critical issue(s) must be resolved before deployment:\n\n`;
    issues.filter(i => i.severity === 'critical').forEach((issue, idx) => {
      md += `${idx + 1}. **${issue.title}**\n`;
    });
    md += '\n';
  }

  if (pixelDiffPercent > 5) {
    md += `### 📐 Design Fidelity\n\n`;
    md += `The ${pixelDiffPercent.toFixed(1)}% pixel difference suggests:\n`;
    md += `- Review spacing/margin values in CSS against design tokens\n`;
    md += `- Verify font sizes match exactly (check if px/rem conversions are correct)\n`;
    md += `- Check color values against the design palette (hex codes)\n`;
    md += `- Inspect the \`diff-overlay.png\` to identify exact deviation areas\n\n`;
  }

  md += `### ♿ Accessibility Quick Wins\n\n`;
  const a11yIssues = issues.filter(i =>
    i.title.toLowerCase().includes('contrast') ||
    i.title.toLowerCase().includes('alt text') ||
    i.title.toLowerCase().includes('touch target') ||
    i.title.toLowerCase().includes('h1')
  );

  if (a11yIssues.length > 0) {
    md += `${a11yIssues.length} accessibility issue(s) found:\n\n`;
    a11yIssues.forEach(issue => {
      md += `- ${SEVERITY_EMOJI[issue.severity]} ${issue.title}\n`;
    });
  } else {
    md += `✅ No major accessibility issues detected.\n`;
  }

  md += '\n';

  // ─── Technical details ────────────────────────────────────────────────────────
  md += `---\n\n`;
  md += `## ⚙️ Technical Details\n\n`;
  md += `\`\`\`\n`;
  md += `Timestamp:     ${timestamp}\n`;
  md += `Design file:   ${config.designPath}\n`;
  md += `Target URL:    ${config.url}\n`;
  md += `Viewport:      ${config.primaryViewport.width}×${config.primaryViewport.height}px\n`;
  md += `Diff threshold: ${config.threshold}\n`;
  md += `Pixel diff:    ${pixelDiffPercent.toFixed(4)}%\n`;
  md += `Total issues:  ${stats.total} (${stats.critical} critical, ${stats.major} major, ${stats.minor} minor)\n`;
  md += `\`\`\`\n\n`;

  md += `---\n`;
  md += `*Report generated by [UI Design Review Bot](https://github.com/ui-design-review-bot)*\n`;

  // ─── Write file ───────────────────────────────────────────────────────────────
  const checklistPath = path.join(outputDir, 'checklist.md');
  fs.writeFileSync(checklistPath, md, 'utf-8');

  return checklistPath;
}
