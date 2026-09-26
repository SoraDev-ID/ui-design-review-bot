/**
 * Contrast Analyzer Module
 *
 * Checks text contrast ratios against WCAG 2.1 standards (AA and AAA).
 * Uses the WCAG relative luminance formula to compute contrast ratios
 * from computed foreground/background colors extracted via Playwright.
 *
 * WCAG AA Requirements:
 *   - Normal text: ≥ 4.5:1
 *   - Large text (≥18pt or ≥14pt bold): ≥ 3:1
 *   - UI components & graphics: ≥ 3:1
 */

/**
 * Analyze color contrast for text elements on the page
 *
 * @param {Object} opts
 * @param {import('playwright').Page} opts.page - Playwright page object
 * @param {string} opts.screenshotPath - Path to screenshot (for future heatmap)
 * @returns {Promise<Array>} Array of contrast issues
 */
export async function analyzeContrast({ page, screenshotPath }) {
  const issues = [];

  // ─── Extract element colors via Playwright ────────────────────────────────────
  const colorData = await page.evaluate(() => {
    const results = [];
    const selectors = 'h1, h2, h3, h4, h5, h6, p, span, a, button, label, li, td, th, input, textarea';
    const elements = document.querySelectorAll(selectors);

    /**
     * Parse CSS color string → {r,g,b,a}
     * Handles: rgb(), rgba(), hex (via computed style which always returns rgb/rgba)
     */
    function parseColor(colorStr) {
      const m = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (!m) return null;
      return {
        r: parseInt(m[1]),
        g: parseInt(m[2]),
        b: parseInt(m[3]),
        a: m[4] !== undefined ? parseFloat(m[4]) : 1,
      };
    }

    /**
     * Walk up DOM to find effective background color
     */
    function getEffectiveBg(el) {
      let current = el;
      while (current && current !== document.body) {
        const bg = window.getComputedStyle(current).backgroundColor;
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
          return bg;
        }
        current = current.parentElement;
      }
      return window.getComputedStyle(document.body).backgroundColor || 'rgb(255, 255, 255)';
    }

    let count = 0;
    for (const el of elements) {
      if (count >= 80) break; // Limit analysis to 80 elements

      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const text = el.textContent?.trim();
      if (!text || text.length === 0) continue;

      const fgColor = parseColor(style.color);
      const bgColor = parseColor(getEffectiveBg(el));

      if (!fgColor || !bgColor) continue;

      const fontSize = parseFloat(style.fontSize);
      const fontWeight = style.fontWeight;
      const rect = el.getBoundingClientRect();

      results.push({
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        text: text.slice(0, 50),
        fgColor,
        bgColor,
        fontSize,
        fontWeight,
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      });

      count++;
    }

    return results;
  });

  // ─── Compute WCAG contrast ratios ────────────────────────────────────────────
  for (const el of colorData) {
    const fgLum = relativeLuminance(el.fgColor);
    const bgLum = relativeLuminance(el.bgColor);
    const ratio = contrastRatio(fgLum, bgLum);

    // Determine if it's "large text" per WCAG (≥18pt ~24px, or ≥14pt bold ~18.67px bold)
    const isLargeText =
      el.fontSize >= 24 ||
      (el.fontSize >= 18.67 && (el.fontWeight === 'bold' || parseInt(el.fontWeight) >= 700));

    const requiredRatio = isLargeText ? 3.0 : 4.5;
    const aaaRatio = isLargeText ? 4.5 : 7.0;

    if (ratio < requiredRatio) {
      const ratioStr = ratio.toFixed(2);
      issues.push({
        category: 'contrast-color',
        severity: ratio < 2.5 ? 'critical' : 'major',
        title: `Low contrast ratio: ${ratioStr}:1 (required ${requiredRatio}:1)`,
        description: `Element <${el.tag}${el.id ? '#' + el.id : ''}> has contrast ratio ${ratioStr}:1 — fails WCAG AA ${isLargeText ? '(large text)' : '(normal text)'} minimum of ${requiredRatio}:1. ` +
          `Text: "${el.text.slice(0, 40)}" | FG: rgb(${el.fgColor.r},${el.fgColor.g},${el.fgColor.b}) | BG: rgb(${el.bgColor.r},${el.bgColor.g},${el.bgColor.b})`,
        region: el.rect,
        meta: { ratio, requiredRatio, fg: el.fgColor, bg: el.bgColor },
      });
    } else if (ratio < aaaRatio && ratio >= requiredRatio) {
      // Passes AA but not AAA — report as informational minor
      const ratioStr = ratio.toFixed(2);
      issues.push({
        category: 'contrast-color',
        severity: 'minor',
        title: `Contrast ${ratioStr}:1 passes AA but not AAA`,
        description: `Element <${el.tag}> passes WCAG AA (${requiredRatio}:1) but not AAA (${aaaRatio}:1). Current: ${ratioStr}:1. Consider improving for enhanced accessibility.`,
        region: el.rect,
        meta: { ratio, requiredRatio: aaaRatio, fg: el.fgColor, bg: el.bgColor },
      });
    }
  }

  // Deduplicate similar issues (same severity & ratio rounded to 1 decimal)
  const seen = new Set();
  return issues.filter(issue => {
    const key = `${issue.severity}-${issue.meta?.ratio?.toFixed(1)}-${issue.description.slice(0, 30)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── WCAG Math Helpers ────────────────────────────────────────────────────────

/**
 * Compute relative luminance from an RGB color (WCAG 2.1 formula)
 * @param {{ r: number, g: number, b: number }} color
 * @returns {number} Relative luminance (0-1)
 */
function relativeLuminance({ r, g, b }) {
  const toLinear = (c) => {
    const sRGB = c / 255;
    return sRGB <= 0.03928 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  };

  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Compute contrast ratio between two luminance values
 * @param {number} lum1
 * @param {number} lum2
 * @returns {number} Contrast ratio (1:1 to 21:1)
 */
function contrastRatio(lum1, lum2) {
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}
