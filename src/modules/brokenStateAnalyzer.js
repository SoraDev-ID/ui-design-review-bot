/**
 * Broken State Analyzer Module
 *
 * Checks for:
 * - Broken/missing images and icons
 * - Console JavaScript errors
 * - Network request failures (4xx, 5xx)
 * - Layout overflow and horizontal scroll
 * - Empty/missing content areas
 * - Elements rendered outside viewport
 */

/**
 * Analyze the page for broken states and errors
 *
 * @param {Object} opts
 * @param {import('playwright').Page} opts.page - Playwright page object
 * @param {Array} opts.consoleErrors - Collected console errors
 * @param {Array} opts.networkErrors - Collected network errors
 * @param {Array} opts.screenshotResults - Results from all viewport captures
 * @returns {Promise<Array>} Array of broken state issues
 */
export async function analyzeBrokenState({
  page,
  consoleErrors,
  networkErrors,
  screenshotResults,
}) {
  const issues = [];

  // ─── 1. Console JavaScript Errors ────────────────────────────────────────────
  if (consoleErrors.length > 0) {
    // Group by unique error messages
    const uniqueErrors = [...new Map(consoleErrors.map(e => [e.text, e])).values()];

    uniqueErrors.slice(0, 10).forEach(err => {
      const isReact = err.text.includes('React') || err.text.includes('Uncaught');
      const isCritical = err.text.includes('ReferenceError') ||
                         err.text.includes('TypeError') ||
                         err.text.includes('Cannot read') ||
                         err.text.includes('is not a function');

      issues.push({
        category: 'broken-state',
        severity: isCritical ? 'critical' : 'major',
        title: `Console error: ${err.text.slice(0, 60)}`,
        description: `JavaScript error detected: "${err.text}"${err.location?.url ? ` in ${err.location.url}:${err.location.lineNumber}` : ''}`,
        region: null,
      });
    });

    if (consoleErrors.length > 10) {
      issues.push({
        category: 'broken-state',
        severity: 'major',
        title: `${consoleErrors.length} total console errors (showing 10)`,
        description: `Page generated ${consoleErrors.length} console errors. This indicates significant JavaScript issues that may affect rendering.`,
        region: null,
      });
    }
  }

  // ─── 2. Network Request Failures ─────────────────────────────────────────────
  if (networkErrors.length > 0) {
    const assetErrors = networkErrors.filter(e =>
      /\.(png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|css|js)(\?|$)/i.test(e.url)
    );

    const apiErrors = networkErrors.filter(e =>
      !assetErrors.includes(e) && (e.url.includes('/api/') || e.url.includes('/v1/') || e.url.includes('/graphql'))
    );

    assetErrors.forEach(err => {
      const isFont = /\.(woff|woff2|ttf|eot)/.test(err.url);
      const isImage = /\.(png|jpg|jpeg|gif|svg|webp|ico)/.test(err.url);

      issues.push({
        category: 'broken-state',
        severity: isFont ? 'major' : isImage ? 'major' : 'minor',
        title: `Failed to load ${isFont ? 'font' : isImage ? 'image' : 'asset'}: ${err.url.split('/').pop()}`,
        description: `Network request failed — ${err.failure} for: ${err.url}`,
        region: null,
      });
    });

    apiErrors.forEach(err => {
      issues.push({
        category: 'broken-state',
        severity: 'critical',
        title: `API request failed: ${err.url.split('/').pop()}`,
        description: `API call failed — ${err.failure}: ${err.url}`,
        region: null,
      });
    });
  }

  // ─── 3. Broken Images ────────────────────────────────────────────────────────
  const brokenImages = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('img'))
      .filter(img => !img.complete || img.naturalWidth === 0)
      .map(img => {
        const rect = img.getBoundingClientRect();
        return {
          src: img.src || img.getAttribute('src') || 'unknown',
          alt: img.alt || null,
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
        };
      });
  });

  brokenImages.forEach(img => {
    issues.push({
      category: 'broken-state',
      severity: 'major',
      title: `Broken image: ${img.src.split('/').pop() || img.src.slice(-40)}`,
      description: `Image failed to load: ${img.src}${img.alt ? ` (alt: "${img.alt}")` : ''}`,
      region: img.rect,
    });
  });

  // ─── 4. Missing/Empty Content Areas ──────────────────────────────────────────
  const emptyContainers = await page.evaluate(() => {
    const selectors = ['main', 'section', 'article', '[class*="container"]', '[class*="content"]'];
    const results = [];

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        const rect = el.getBoundingClientRect();
        const text = el.textContent?.trim() || '';
        const hasImages = el.querySelectorAll('img, svg, video').length > 0;
        const hasChildren = el.children.length > 0;

        // Large empty visible container
        if (rect.width > 100 && rect.height > 100 && !text && !hasImages && !hasChildren) {
          results.push({
            tag: el.tagName.toLowerCase(),
            id: el.id || null,
            className: el.className ? el.className.toString().slice(0, 40) : null,
            rect: {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            },
          });
        }
      }
    }

    return results.slice(0, 5);
  });

  emptyContainers.forEach(container => {
    issues.push({
      category: 'broken-state',
      severity: 'major',
      title: `Empty content area: <${container.tag}${container.id ? '#' + container.id : ''}>`,
      description: `A large container element (${container.rect.width}×${container.rect.height}px) appears to be empty. This may indicate a data loading failure or rendering issue. Class: ${container.className || 'none'}`,
      region: container.rect,
    });
  });

  // ─── 5. Horizontal Scroll (Layout Breakage) ───────────────────────────────────
  const hasHorizontalScroll = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth;
  });

  if (hasHorizontalScroll) {
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);

    issues.push({
      category: 'broken-state',
      severity: 'major',
      title: `Horizontal scroll detected (layout overflow)`,
      description: `Page content is ${scrollWidth}px wide but viewport is ${clientWidth}px. Horizontal scrolling indicates layout breakage, often caused by elements wider than the viewport.`,
      region: null,
    });
  }

  // ─── 6. Missing Alt Text on Images ───────────────────────────────────────────
  const imagesWithoutAlt = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('img'))
      .filter(img => !img.alt || img.alt.trim() === '')
      .filter(img => img.complete && img.naturalWidth > 0)
      .slice(0, 5)
      .map(img => ({
        src: img.src.split('/').pop() || img.src.slice(-40),
        rect: (() => {
          const r = img.getBoundingClientRect();
          return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
        })(),
      }));
  });

  imagesWithoutAlt.forEach(img => {
    issues.push({
      category: 'broken-state',
      severity: 'minor',
      title: `Missing alt text: ${img.src}`,
      description: `Image "${img.src}" has no alt attribute. This fails WCAG 1.1.1 (Non-text Content) accessibility requirement.`,
      region: img.rect,
    });
  });

  // ─── 7. Touch Target Size (for mobile breakpoints) ────────────────────────────
  const smallTouchTargets = await page.evaluate(() => {
    const interactive = document.querySelectorAll('button, a, input, [role="button"], [onclick]');
    const results = [];

    for (const el of interactive) {
      const rect = el.getBoundingClientRect();
      if (rect.width < 44 && rect.height < 44 && rect.width > 0) {
        results.push({
          tag: el.tagName.toLowerCase(),
          text: el.textContent?.trim().slice(0, 30) || el.getAttribute('aria-label') || '',
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
        });
      }
    }

    return results.slice(0, 5);
  });

  smallTouchTargets.forEach(el => {
    issues.push({
      category: 'broken-state',
      severity: 'minor',
      title: `Small touch target: ${el.width}×${el.height}px (<44×44px minimum)`,
      description: `Interactive element <${el.tag}> "${el.text}" is ${el.width}×${el.height}px — below the WCAG 2.5.5 recommended 44×44px touch target size.`,
      region: el.rect,
    });
  });

  return issues;
}
