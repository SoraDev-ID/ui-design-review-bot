/**
 * Setup GitHub Labels untuk repository
 *
 * Jalankan SEKALI untuk membuat semua label standar yang dibutuhkan
 * oleh Issue Triage Agent.
 *
 * Usage:
 *   GITHUB_TOKEN=xxx REPO_OWNER=SoraDev-ID REPO_NAME=ui-design-review-bot node setup-labels.mjs
 */

import { Octokit } from '@octokit/rest';

const { GITHUB_TOKEN, REPO_OWNER = 'SoraDev-ID', REPO_NAME = 'ui-design-review-bot' } = process.env;

if (!GITHUB_TOKEN) {
  console.error('❌ Set env var: GITHUB_TOKEN');
  process.exit(1);
}

const octokit = new Octokit({ auth: GITHUB_TOKEN });

// ─── Label definitions ────────────────────────────────────────────────────────
const LABELS = [
  // Tipe
  { name: 'bug',              color: 'd73a4a', description: 'Something isn\'t working' },
  { name: 'feature',          color: 'a2eeef', description: 'New feature or request' },
  { name: 'question',         color: 'd876e3', description: 'Further information is requested' },
  { name: 'documentation',    color: '0075ca', description: 'Improvements or additions to docs' },
  { name: 'chore',            color: 'e4e669', description: 'Maintenance and internal tasks' },
  { name: 'enhancement',      color: '84b6eb', description: 'Enhancement to existing features' },

  // Status
  { name: 'needs-more-info',  color: 'fef2c0', description: 'More information is needed to proceed' },
  { name: 'duplicate',        color: 'cfd3d7', description: 'This issue or pull request already exists' },
  { name: 'wontfix',          color: 'ffffff', description: 'This will not be worked on' },
  { name: 'in-progress',      color: '0e8a16', description: 'Currently being worked on' },

  // Prioritas
  { name: 'P0-critical',      color: 'b60205', description: 'P0: Data loss, security, production down' },
  { name: 'P1-high',          color: 'e4100a', description: 'P1: Core functionality broken, no workaround' },
  { name: 'P2-medium',        color: 'e99695', description: 'P2: Minor bug or workaround exists' },
  { name: 'P3-low',           color: 'f9d0c4', description: 'P3: Cosmetic, nice-to-have' },

  // Ukuran
  { name: 'size/XS',          color: '009800', description: 'Extra small change (< 10 lines)' },
  { name: 'size/S',           color: '77bb00', description: 'Small change (10-50 lines)' },
  { name: 'size/M',           color: 'eebb00', description: 'Medium change (50-200 lines)' },
  { name: 'size/L',           color: 'ee7700', description: 'Large change (200-500 lines)' },
  { name: 'size/XL',          color: 'ee0000', description: 'Extra large change (500+ lines)' },

  // Area
  { name: 'area/screenshot',  color: 'bfd4f2', description: 'Related to Playwright screenshot capture' },
  { name: 'area/diff',        color: 'bfd4f2', description: 'Related to pixel diff / image comparison' },
  { name: 'area/typography',  color: 'bfd4f2', description: 'Related to typography analysis' },
  { name: 'area/contrast',    color: 'bfd4f2', description: 'Related to color/contrast analysis' },
  { name: 'area/report',      color: 'bfd4f2', description: 'Related to report generation' },
  { name: 'area/cli',         color: 'bfd4f2', description: 'Related to CLI interface' },

  // Kontributor
  { name: 'good-first-issue', color: '7057ff', description: 'Good for newcomers' },
  { name: 'help-wanted',      color: '008672', description: 'Extra attention is needed' },
];

async function setupLabels() {
  console.log(`🏷️  Setting up labels for ${REPO_OWNER}/${REPO_NAME}...\n`);

  // Get existing labels
  const existing = await octokit.paginate(octokit.issues.listLabelsForRepo, {
    owner: REPO_OWNER, repo: REPO_NAME, per_page: 100,
  });
  const existingMap = new Map(existing.map(l => [l.name, l]));

  let created = 0, updated = 0, skipped = 0;

  for (const label of LABELS) {
    try {
      if (existingMap.has(label.name)) {
        // Update if color differs
        const existing_label = existingMap.get(label.name);
        if (existing_label.color !== label.color) {
          await octokit.issues.updateLabel({
            owner: REPO_OWNER, repo: REPO_NAME,
            name: label.name,
            color: label.color,
            description: label.description,
          });
          console.log(`  ✏️  Updated: ${label.name}`);
          updated++;
        } else {
          console.log(`  ⏭️  Skipped: ${label.name} (unchanged)`);
          skipped++;
        }
      } else {
        await octokit.issues.createLabel({
          owner: REPO_OWNER, repo: REPO_NAME,
          name: label.name,
          color: label.color,
          description: label.description,
        });
        console.log(`  ✅ Created: ${label.name}`);
        created++;
      }
    } catch (err) {
      console.error(`  ❌ Error for "${label.name}": ${err.message}`);
    }
  }

  console.log(`\n📊 Done! Created: ${created}, Updated: ${updated}, Skipped: ${skipped}`);
  console.log(`\n🔗 View labels: https://github.com/${REPO_OWNER}/${REPO_NAME}/labels`);
}

setupLabels().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
