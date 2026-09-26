# 🤖 UI Design Review Bot

> Automated visual & structural comparison between Figma design references and deployed web applications.

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org)
[![Playwright](https://img.shields.io/badge/Playwright-1.48-blue)](https://playwright.dev)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 📸 **Smart Screenshot** | Headless Playwright browser capture at any viewport |
| 🔍 **Pixel Diff** | `pixelmatch` comparison with heatmap overlay |
| 🔤 **Typography Audit** | Font size, weight, line-height, truncation detection |
| 🎨 **WCAG Contrast** | AA/AAA compliance check with exact ratios |
| 🔧 **Broken State** | Console errors, broken images, network failures |
| 📱 **Multi-Breakpoint** | Test mobile, tablet, and desktop simultaneously |
| 🖊️ **Annotated Output** | Numbered bounding boxes on screenshot |
| 📝 **Markdown Report** | Full checklist with severity and recommendations |

---

## 📦 Installation

```bash
# Clone or navigate to project directory
cd "UI Design Review Bot"

# Install dependencies
npm install

# Install Playwright's Chromium browser
npm run install:browsers
```

> **Requirements:** Node.js 18+

---

## 🚀 Usage

### Basic Usage

```bash
npm run review -- --design=./figma-export.png --url=https://staging.myapp.com
```

### With Custom Viewport

```bash
npm run review -- --design=./design.png --url=https://myapp.com --viewport=1440x900
```

### Multi-Breakpoint Review

```bash
npm run review -- \
  --design=./design.png \
  --url=https://myapp.com \
  --breakpoints=375x812,768x1024,1440x900
```

### Capture Specific Element

```bash
npm run review -- \
  --design=./hero-section.png \
  --url=https://myapp.com \
  --selector=".hero-section" \
  --viewport=1440x900
```

### Strict Comparison

```bash
npm run review -- \
  --design=./design.png \
  --url=http://localhost:3000 \
  --threshold=0.05  # Stricter pixel match (default: 0.1)
```

---

## ⚙️ CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `--design` | Path to design reference image | **required** |
| `--url` | Target URL (deployed or localhost) | **required** |
| `--viewport` | Viewport as `WIDTHxHEIGHT` | `1440x900` |
| `--output` | Output directory | `./review-output` |
| `--selector` | CSS selector for element capture | *(full page)* |
| `--wait` | Wait ms after load for animations | `2000` |
| `--breakpoints` | Comma-separated viewport list | *(primary only)* |
| `--threshold` | Pixel diff threshold (0–1) | `0.1` |
| `--no-diff` | Skip diff overlay generation | `false` |
| `--no-annotate` | Skip annotated screenshot | `false` |

---

## 📁 Output Structure

After running a review, the `review-output/` directory contains:

```
review-output/
├── checklist.md              # Full review report with all issues
├── annotated-screenshot.png  # Screenshot with numbered issue highlights
├── diff-overlay.png          # Pixel diff heatmap (design vs actual)
└── screenshot-1440-900.png   # Raw captured screenshot
```

### Sample `checklist.md` Output

```markdown
# 🤖 UI Design Review Report

## 📊 Summary
| Property | Value |
|----------|-------|
| Status   | ⚠️ WARNING — Multiple Major Issues |
| Pixel Difference | 7.34% |
| 🔴 Critical | 1 |
| 🟠 Major    | 4 |
| 🔵 Minor    | 3 |

### 📐 Spacing & Layout
- [ ] **[#1]** 🔴 `Critical` — **Visual pixel difference detected**
  > 7.34% of pixels differ from design reference

### 🔤 Typography
- [ ] **[#2]** 🟠 `Major` — **Text too small: 10px**
  > Element <span> has font-size 10px below minimum...
```

---

## 🏗️ Project Structure

```
UI Design Review Bot/
├── src/
│   ├── cli.js                     # CLI entry point (Commander.js)
│   ├── index.js                   # Main orchestrator
│   └── modules/
│       ├── screenshotter.js       # Playwright browser automation
│       ├── imageCompare.js        # pixelmatch pixel diff
│       ├── typographyAnalyzer.js  # Font/text CSS analysis
│       ├── contrastAnalyzer.js    # WCAG contrast ratio checks
│       ├── brokenStateAnalyzer.js # Errors, broken images, overflow
│       ├── annotator.js           # sharp SVG overlay annotation
│       └── reportGenerator.js    # Markdown checklist generation
├── review-output/                 # Generated on first run
├── samples/                       # Sample design images for testing
├── package.json
└── README.md
```

---

## 🔬 How It Works

```
┌─────────────────────────────────────────────────────────┐
│  Input: design.png  +  URL  +  viewport                │
└──────────────────────────┬──────────────────────────────┘
                           │
            ┌──────────────▼──────────────┐
            │   1. Playwright Screenshot   │  ← headless Chromium
            │      + Console/Net errors   │
            └──────────────┬──────────────┘
                           │
            ┌──────────────▼──────────────┐
            │   2. Pixel Diff (pixelmatch) │  ← heatmap generation
            └──────────────┬──────────────┘
                           │
         ┌─────────────────▼─────────────────┐
         │  3. Analysis Modules (parallel)    │
         │  ├─ Typography (font CSS props)    │
         │  ├─ Contrast (WCAG AA/AAA)         │
         │  └─ Broken State (errors/images)   │
         └─────────────────┬─────────────────┘
                           │
            ┌──────────────▼──────────────┐
            │  4. Annotate Screenshot      │  ← sharp + SVG overlay
            └──────────────┬──────────────┘
                           │
            ┌──────────────▼──────────────┐
            │  5. Generate checklist.md    │  ← markdown report
            └──────────────┬──────────────┘
                           │
            ┌──────────────▼──────────────┐
            │  Output: review-output/      │
            └─────────────────────────────┘
```

---

## 🎨 Severity Levels

| Severity | Color | When Used |
|----------|-------|-----------|
| 🔴 **Critical** | Red | Blocks release: crashes, WCAG contrast <2.5:1, JS errors |
| 🟠 **Major** | Orange | Must fix: broken images, font <12px, overflow |
| 🔵 **Minor** | Blue | Nice to have: small touch targets, AAA contrast, font count |

---

## 🔧 Troubleshooting

### `playwright install` fails
```bash
npx playwright install chromium --with-deps
```

### `sharp` native module errors on Windows
```bash
npm install --ignore-scripts
npm rebuild sharp
```

### `canvas` build errors
Install [node-canvas dependencies](https://github.com/Automattic/node-canvas#compiling):
```bash
# Windows: install GTK and Cairo via chocolatey
choco install -y python vcredist140 gtk-runtime
```
> **Note:** The `canvas` package is optional. The annotator falls back to sharp+SVG which doesn't require it.

### URL not loading
- Ensure the URL is accessible from your machine
- For localhost, make sure the dev server is running
- Add `--wait=5000` for slow-loading SPAs

---

## 📋 Dependencies

| Package | Purpose |
|---------|---------|
| `playwright` | Headless browser automation |
| `pixelmatch` | Pixel-by-pixel image comparison |
| `sharp` | Image processing & SVG annotation |
| `pngjs` | PNG read/write for pixelmatch |
| `commander` | CLI argument parsing |
| `chalk` | Terminal colors |
| `ora` | CLI spinner |

---

## 📄 License

MIT © UI Design Review Bot
