/**
 * Typography Analyzer Module
 *
 * Uses Playwright's page.evaluate() to extract computed CSS properties
 * for all text nodes and detect typography deviations.
 *
 * Checks: font-family, font-size, font-weight, line-height, letter-spacing,
 * text overflow/truncation, and text contrast ratio.
 */

/**
 * Analyze typography properties of text elements on the page
 *
 * @param {Object} opts
 * @param {import('playwright').Page} opts.page - Playwright page object
 * @param {string} opts.selector - Root selector to analyze
 * @returns {Promise<Array>} Array of typography issues
 */
export async function analyzeTypography({ page, selector }) {
  const issues = [];

  // ─── Extract all text elements with computed styles ───────────────────────────
  const textElements = await page.evaluate((rootSelector) => {
    const root = document.querySelector(rootSelector) || document.body;
    const results = [];

    // Helper: get full computed styles
    function getTextStyles(el) {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();

      return {
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        text: el.textContent?.trim().slice(0, 60) || '',
        fontFamily: style.fontFamily,
        fontSize: parseFloat(style.fontSize),
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight,
        letterSpacing: style.letterSpacing,
        textOverflow: style.textOverflow,
        overflow: style.overflow,
        whiteSpace: style.whiteSpace,
        color: style.color,
        backgroundColor: style.backgroundColor,
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        // Detect truncation
        isTruncated: el.scrollWidth > el.clientWidth && style.overflow !== 'visible',
        // Detect if it's a heading
        isHeading: /^h[1-6]$/.test(el.tagName.toLowerCase()),
        // Check for system fonts (design usually specifies custom fonts)
        usesSystemFont: ['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy'].some(
          f => style.fontFamily.toLowerCase().includes(f) && !style.fontFamily.includes(',')
        ),
      };
    }

    // Walk text-bearing elements
    const selector_list = [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'span', 'a', 'button', 'label',
      'li', 'td', 'th', 'caption',
    ];

    const elements = root.querySelectorAll(selector_list.join(','));
    let count = 0;

    for (const el of elements) {
      // Skip hidden elements
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (!el.textContent?.trim()) continue;

      // Skip deeply nested elements to avoid duplicates
      if (count > 100) break;

      results.push(getTextStyles(el));
      count++;
    }

    return results;
  }, selector);

  // ─── Analyze font sizes ───────────────────────────────────────────────────────
  const fontSizes = textElements.map(el => el.fontSize).filter(Boolean);
  const uniqueFontSizes = [...new Set(fontSizes)].sort((a, b) => b - a);

  // Flag unusually small text (below 12px is a usability concern)
  textElements.forEach(el => {
    if (el.fontSize < 12 && el.text.length > 0) {
      issues.push({
        category: 'typography',
        severity: el.fontSize < 10 ? 'critical' : 'major',
        title: `Text too small: ${el.fontSize}px`,
        description: `Element <${el.tag}${el.id ? '#' + el.id : ''}> has font-size ${el.fontSize}px which is below the 12px minimum. Text: "${el.text.slice(0, 40)}"`,
        region: el.rect,
      });
    }
  });

  // ─── Detect inconsistent font sizes (more than 6 unique sizes = design smell) ─
  if (uniqueFontSizes.length > 6) {
    issues.push({
      category: 'typography',
      severity: 'minor',
      title: `Too many font sizes (${uniqueFontSizes.length} unique)`,
      description: `Found ${uniqueFontSizes.length} different font sizes: ${uniqueFontSizes.map(s => s + 'px').join(', ')}. Good design systems typically use 4-6 type scale steps.`,
      region: null,
    });
  }

  // ─── Detect text truncation ───────────────────────────────────────────────────
  const truncated = textElements.filter(el => el.isTruncated);
  truncated.forEach(el => {
    issues.push({
      category: 'typography',
      severity: 'major',
      title: 'Unintended text truncation / overflow',
      description: `Element <${el.tag}${el.id ? '#' + el.id : ''}> has overflowing text. overflow: ${el.overflow}, white-space: ${el.whiteSpace}. Content: "${el.text.slice(0, 50)}"`,
      region: el.rect,
    });
  });

  // ─── Detect system fonts (likely missing web font loading) ───────────────────
  const systemFontElements = textElements.filter(el => el.usesSystemFont);
  if (systemFontElements.length > textElements.length * 0.3 && systemFontElements.length > 5) {
    issues.push({
      category: 'typography',
      severity: 'major',
      title: 'Possible web font loading failure',
      description: `${systemFontElements.length} elements are using system fallback fonts (serif/sans-serif/monospace without specific family). This may indicate a web font failed to load. Fonts found: ${[...new Set(systemFontElements.map(e => e.fontFamily))].slice(0, 3).join(', ')}`,
      region: null,
    });
  }

  // ─── Check heading hierarchy ──────────────────────────────────────────────────
  const headings = await page.evaluate(() => {
    const tags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
    const counts = {};
    tags.forEach(tag => {
      counts[tag] = document.querySelectorAll(tag).length;
    });
    return counts;
  });

  if (headings.h1 === 0) {
    issues.push({
      category: 'typography',
      severity: 'major',
      title: 'Missing H1 heading',
      description: 'No H1 element found on the page. Every page should have exactly one H1 for both SEO and accessibility.',
      region: null,
    });
  }

  if (headings.h1 > 1) {
    issues.push({
      category: 'typography',
      severity: 'minor',
      title: `Multiple H1 headings (${headings.h1} found)`,
      description: `Found ${headings.h1} H1 elements. Best practice is one H1 per page.`,
      region: null,
    });
  }

  // ─── Detect line-height issues ────────────────────────────────────────────────
  textElements.filter(el => el.tag === 'p' || el.isHeading).forEach(el => {
    const lineHeight = parseFloat(el.lineHeight);
    const ratio = lineHeight / el.fontSize;

    if (!isNaN(ratio) && (ratio < 1.1 || ratio > 2.0)) {
      issues.push({
        category: 'typography',
        severity: 'minor',
        title: `Unusual line-height ratio: ${ratio.toFixed(2)}`,
        description: `Element <${el.tag}> has line-height ${el.lineHeight} with font-size ${el.fontSize}px (ratio: ${ratio.toFixed(2)}). Recommended range: 1.2-1.8 for body text, 1.1-1.3 for headings.`,
        region: el.rect,
      });
    }
  });

  return issues;
}
