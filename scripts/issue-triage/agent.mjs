/**
 * 🤖 Issue Triage Agent — Main Entry
 *
 * Implements the 6-step triage workflow:
 *   1. Baca & pahami issue
 *   2. Cek duplikat (open + closed, 90 hari terakhir)
 *   3. Cari file/kode terkait di codebase
 *   4. Usulkan label, prioritas, estimasi ukuran
 *   5. Tulis komentar triage + terapkan label
 *   6. Buat draft PR jika issue kecil (XS/S, bukan P0)
 */

import { Octokit } from '@octokit/rest';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// ─── Environment variables ────────────────────────────────────────────────────
const {
  GITHUB_TOKEN,
  GEMINI_API_KEY,
  ISSUE_NUMBER,
  ISSUE_TITLE,
  ISSUE_BODY,
  ISSUE_AUTHOR,
  ISSUE_LABELS,
  REPO_OWNER,
  REPO_NAME,
} = process.env;

if (!GITHUB_TOKEN || !GEMINI_API_KEY) {
  console.error('❌ Missing required env vars: GITHUB_TOKEN, GEMINI_API_KEY');
  process.exit(1);
}

const issueNumber = parseInt(ISSUE_NUMBER);
const existingLabels = JSON.parse(ISSUE_LABELS || '[]').map(l => l.name);

const octokit = new Octokit({ auth: GITHUB_TOKEN });
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// ─── Repo labels cache ────────────────────────────────────────────────────────
let repoLabels = [];

async function getRepoLabels() {
  if (repoLabels.length > 0) return repoLabels;
  const { data } = await octokit.issues.listLabelsForRepo({
    owner: REPO_OWNER,
    repo: REPO_NAME,
    per_page: 100,
  });
  repoLabels = data.map(l => l.name);
  return repoLabels;
}

// ─── Utility: read codebase file tree (for context) ──────────────────────────
function getFileTree(dir = '.', depth = 3, indent = '') {
  const entries = [];
  try {
    const items = fs.readdirSync(dir).filter(f =>
      !['node_modules', '.git', 'review-output', '.github'].includes(f)
    );
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory() && depth > 0) {
        entries.push(`${indent}${item}/`);
        entries.push(...getFileTree(fullPath, depth - 1, indent + '  '));
      } else if (stat.isFile()) {
        entries.push(`${indent}${item}`);
      }
    }
  } catch (_) {}
  return entries;
}

// ─── Utility: search codebase with grep ──────────────────────────────────────
function grepCodebase(keywords) {
  const results = [];
  for (const kw of keywords.slice(0, 5)) {
    try {
      const output = execSync(
        `grep -rl "${kw}" src/ scripts/ --include="*.js" --include="*.mjs" 2>/dev/null`,
        { encoding: 'utf-8', timeout: 5000 }
      ).trim();
      if (output) {
        output.split('\n').forEach(f => {
          if (f && !results.includes(f)) results.push(f);
        });
      }
    } catch (_) {}
  }
  return results.slice(0, 8);
}

// ─── Utility: read file snippet ──────────────────────────────────────────────
function readFileSnippet(filePath, maxLines = 60) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.split('\n').slice(0, maxLines).join('\n');
  } catch (_) {
    return null;
  }
}

// ─── Step 1: Baca & parse issue dengan Gemini ────────────────────────────────
async function analyzeIssue(recentIssues, availableLabels, fileTree, relevantFiles) {
  console.log('🧠 Menjalankan analisis Gemini...');

  const recentIssuesSummary = recentIssues.map(i =>
    `#${i.number} [${i.state}]: ${i.title}`
  ).join('\n');

  // Build relevant file snippets
  const fileSnippets = relevantFiles.slice(0, 3).map(f => {
    const snippet = readFileSnippet(f, 40);
    return snippet ? `\n### ${f}\n\`\`\`js\n${snippet}\n\`\`\`` : '';
  }).join('\n');

  const prompt = `
Kamu adalah Issue Triage Agent untuk repository GitHub "ui-design-review-bot".
Repository ini adalah CLI tool Node.js untuk membandingkan desain UI (Figma export) vs deployed web app.

## ISSUE BARU
- Nomor: #${issueNumber}
- Judul: ${ISSUE_TITLE}
- Pembuat: @${ISSUE_AUTHOR}
- Label yang sudah ada: ${existingLabels.join(', ') || '(tidak ada)'}
- Deskripsi:
${ISSUE_BODY || '(tidak ada deskripsi)'}

## KONTEKS REPO
File tree codebase:
${fileTree.join('\n')}

## ISSUE TERBARU (90 hari terakhir, open + closed)
${recentIssuesSummary || '(tidak ada issue sebelumnya)'}

## FILE YANG DITEMUKAN RELEVAN (via grep)
${relevantFiles.join('\n') || '(tidak ada)'}

## CUPLIKAN KODE
${fileSnippets || '(tidak ada)'}

## LABEL TERSEDIA DI REPO
${availableLabels.join(', ')}

---

## TUGAS KAMU

Lakukan triage issue ini mengikuti langkah berurutan berikut.
Balas HANYA dalam format JSON valid (tanpa markdown wrapper), dengan struktur persis ini:

{
  "step1": {
    "jenis": "bug | feature | question | chore | documentation",
    "ringkasan": "ringkasan singkat 1 kalimat apa masalah/permintaannya",
    "gejala": "gejala yang dilaporkan",
    "environment": "OS/versi/browser jika disebut, null jika tidak",
    "perlu_klarifikasi": false,
    "pertanyaan_klarifikasi": []
  },
  "step2": {
    "status": "unique | duplicate | related",
    "nomor_referensi": null,
    "keyakinan": "high | medium | low | null",
    "alasan": "alasan singkat"
  },
  "step3": {
    "file_terkait": [
      {
        "path": "src/modules/screenshotter.js",
        "alasan": "alasan kenapa file ini relevan"
      }
    ],
    "catatan": "catatan jika tidak ada file yang ditemukan"
  },
  "step4": {
    "label": ["bug", "needs-more-info"],
    "prioritas": "P0 | P1 | P2 | P3",
    "alasan_prioritas": "alasan singkat 1 kalimat",
    "estimasi_ukuran": "XS | S | M | L | XL",
    "alasan_ukuran": "alasan singkat",
    "langkah_pertama": [
      "langkah konkret 1",
      "langkah konkret 2",
      "langkah konkret 3"
    ]
  },
  "step6": {
    "buat_draft_pr": false,
    "alasan_tidak": "alasan jika false",
    "branch_name": null,
    "pr_judul": null,
    "perubahan_yang_diusulkan": null
  }
}

PENTING:
- Pilih label HANYA dari daftar label tersedia di repo
- Jika label yang tepat tidak ada di repo, jangan sertakan label tersebut
- "perlu_klarifikasi" = true jika deskripsi terlalu tipis untuk ditriase
- "buat_draft_pr" = true HANYA jika estimasi_ukuran XS atau S DAN prioritas bukan P0 DAN jenis adalah bug atau feature yang jelas implementasinya
- Ikuti bahasa issue (Indonesia/Inggris) untuk teks narasi
`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: prompt,
    config: {
      temperature: 0.2,
      responseMimeType: 'application/json',
    },
  });

  const rawText = response.text().trim();

  try {
    return JSON.parse(rawText);
  } catch {
    // Try to extract JSON if wrapped in markdown
    const match = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) return JSON.parse(match[1].trim());
    throw new Error(`Gemini returned invalid JSON: ${rawText.slice(0, 200)}`);
  }
}

// ─── Step 5: Format komentar triage ──────────────────────────────────────────
function buildTriageComment(analysis, issueLanguage) {
  const { step1, step2, step3, step4, step6 } = analysis;
  const isId = issueLanguage === 'id';

  const priorityEmoji = { P0: '🔴', P1: '🟠', P2: '🟡', P3: '🔵' };
  const sizeEmoji = { XS: '🟢', S: '🟢', M: '🟡', L: '🟠', XL: '🔴' };

  if (step1.perlu_klarifikasi) {
    const header = isId ? '## 🔍 Triage Otomatis\n\n**Status:** `needs-more-info` — Deskripsi tidak cukup untuk ditriase.\n\n**Pertanyaan untuk pembuat issue:**' : '## 🔍 Automated Triage\n\n**Status:** `needs-more-info` — Description is insufficient for triage.\n\n**Questions for the issue author:**';
    return `${header}\n${step1.pertanyaan_klarifikasi.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\n---\n*🤖 Diproses oleh Issue Triage Agent (Gemini-powered)*`;
  }

  const dupStatus = step2.status === 'duplicate'
    ? `duplicate of #${step2.nomor_referensi} *(keyakinan: ${step2.keyakinan})*`
    : step2.status === 'related'
    ? `unique — terkait dengan #${step2.nomor_referensi}`
    : 'unique';

  const fileList = step3.file_terkait?.length > 0
    ? step3.file_terkait.map(f => `- \`${f.path}\` — ${f.alasan}`).join('\n')
    : `- *(${step3.catatan || 'Tidak ada file yang ditemukan relevan'})*`;

  const steps = step4.langkah_pertama.map((s, i) => `${i + 1}. ${s}`).join('\n');

  let prNote = '';
  if (step6?.buat_draft_pr) {
    prNote = `\n\n**Draft PR:** Sedang disiapkan di branch \`${step6.branch_name}\``;
  }

  return `## 🔍 Triage Otomatis

**Status duplikat:** ${dupStatus}
**Jenis:** \`${step1.jenis}\` — ${step1.ringkasan}
**Label diusulkan:** ${step4.label.map(l => `\`${l}\``).join(', ')}
**Prioritas:** ${priorityEmoji[step4.prioritas]} ${step4.prioritas} — ${step4.alasan_prioritas}
**Estimasi ukuran:** ${sizeEmoji[step4.estimasi_ukuran]} ${step4.estimasi_ukuran} — ${step4.alasan_ukuran}

**File terkait:**
${fileList}

**Langkah pertama:**
${steps}${prNote}

---
*🤖 Diproses otomatis oleh [Issue Triage Agent](https://github.com/${REPO_OWNER}/${REPO_NAME}/blob/main/.github/workflows/issue-triage.yml) menggunakan Gemini AI. Label diterapkan otomatis kecuali sudah di-set manual.*`;
}

// ─── Step 6: Buat draft PR ────────────────────────────────────────────────────
async function createDraftPR(analysis) {
  const { step6 } = analysis;
  if (!step6?.buat_draft_pr || !step6.branch_name) return null;

  console.log(`🌿 Membuat branch: ${step6.branch_name}`);

  try {
    // Get default branch SHA
    const { data: ref } = await octokit.git.getRef({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      ref: 'heads/main',
    });

    // Create branch
    await octokit.git.createRef({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      ref: `refs/heads/${step6.branch_name}`,
      sha: ref.object.sha,
    });

    // Create a placeholder commit with investigation notes
    const noteContent = `# Issue #${issueNumber} — Investigation Notes\n\n## Ringkasan\n${analysis.step1.ringkasan}\n\n## File Terdampak\n${analysis.step3.file_terkait?.map(f => `- ${f.path}: ${f.alasan}`).join('\n') || 'TBD'}\n\n## Perubahan yang Diusulkan\n${step6.perubahan_yang_diusulkan || 'TBD'}\n\n---\n*File ini dibuat otomatis oleh Issue Triage Agent. Hapus dan implementasikan perbaikan sebenarnya.*\n`;

    const noteBase64 = Buffer.from(noteContent).toString('base64');
    const notePath = `.triage/issue-${issueNumber}-notes.md`;

    await octokit.repos.createOrUpdateFileContents({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path: notePath,
      message: `chore: triage notes for issue #${issueNumber}`,
      content: noteBase64,
      branch: step6.branch_name,
    });

    // Create draft PR
    const { data: pr } = await octokit.pulls.create({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      title: step6.pr_judul || `Fix #${issueNumber}: ${ISSUE_TITLE.slice(0, 60)}`,
      head: step6.branch_name,
      base: 'main',
      body: `## Deskripsi\n\nDraft PR otomatis untuk issue #${issueNumber}.\n\n**Apa yang diubah:**\n${step6.perubahan_yang_diusulkan || 'TBD — perlu investigasi lebih lanjut'}\n\n**File terdampak:**\n${analysis.step3.file_terkait?.map(f => `- \`${f.path}\``).join('\n') || 'TBD'}\n\n**Cara test manual:**\n1. Clone branch: \`git checkout ${step6.branch_name}\`\n2. Jalankan: \`npm install && npm test\`\n3. Verifikasi issue #${issueNumber} terselesaikan\n\n> ⚠️ **Draft otomatis — mohon review sebelum merge.**\n> Implementasi sebenarnya perlu dilakukan oleh developer.\n\nCloses #${issueNumber}`,
      draft: true,
    });

    console.log(`✅ Draft PR #${pr.number} berhasil dibuat: ${pr.html_url}`);
    return pr;
  } catch (err) {
    console.error('⚠️ Gagal membuat draft PR:', err.message);
    return null;
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🤖 Issue Triage Agent — memproses issue #${issueNumber}: "${ISSUE_TITLE}"`);
  console.log(`   Repo: ${REPO_OWNER}/${REPO_NAME}`);
  console.log(`   Pembuat: @${ISSUE_AUTHOR}\n`);

  // ── Deteksi bahasa issue ──────────────────────────────────────────────────
  const issueText = `${ISSUE_TITLE} ${ISSUE_BODY}`;
  const idPattern = /\b(dan|atau|yang|tidak|dengan|untuk|dari|adalah|ini|itu|bisa|perlu|ada|saya|kami|kita|tolong|mohon|bagaimana|kenapa|mengapa|apakah)\b/i;
  const issueLanguage = idPattern.test(issueText) ? 'id' : 'en';
  console.log(`🌐 Bahasa terdeteksi: ${issueLanguage === 'id' ? 'Indonesia' : 'English'}`);

  // ── Step 1: Ambil daftar label repo ──────────────────────────────────────
  console.log('🏷️  Mengambil label yang tersedia di repo...');
  const availableLabels = await getRepoLabels();
  console.log(`   Label tersedia: ${availableLabels.join(', ')}`);

  // ── Step 2: Cari issue duplikat/terkait (90 hari terakhir) ───────────────
  console.log('🔎 Mencari issue duplikat/terkait (90 hari terakhir)...');
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const [openIssues, closedIssues] = await Promise.all([
    octokit.paginate(octokit.issues.listForRepo, {
      owner: REPO_OWNER, repo: REPO_NAME,
      state: 'open', since, per_page: 50,
    }),
    octokit.paginate(octokit.issues.listForRepo, {
      owner: REPO_OWNER, repo: REPO_NAME,
      state: 'closed', since, per_page: 50,
    }),
  ]);

  const recentIssues = [...openIssues, ...closedIssues]
    .filter(i => i.number !== issueNumber && !i.pull_request)
    .map(i => ({ number: i.number, title: i.title, state: i.state }));

  console.log(`   Ditemukan ${recentIssues.length} issue untuk dibandingkan`);

  // ── Step 3: Cari file relevan via grep ────────────────────────────────────
  console.log('📂 Mencari file relevan di codebase...');
  const keywords = ISSUE_TITLE
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !['with', 'this', 'that', 'from', 'when', 'after', 'yang', 'dengan', 'tidak'].includes(w));

  const relevantFiles = grepCodebase(keywords);
  const fileTree = getFileTree('.', 3);

  console.log(`   File relevan via grep: ${relevantFiles.join(', ') || '(tidak ada)'}`);

  // ── Step 4: Analisis Gemini (step 1-4 + 6) ───────────────────────────────
  const analysis = await analyzeIssue(recentIssues, availableLabels, fileTree, relevantFiles);

  console.log('\n📋 Hasil analisis Gemini:');
  console.log(`   Jenis: ${analysis.step1.jenis}`);
  console.log(`   Duplikat: ${analysis.step2.status}`);
  console.log(`   Label: ${analysis.step4.label.join(', ')}`);
  console.log(`   Prioritas: ${analysis.step4.prioritas}`);
  console.log(`   Ukuran: ${analysis.step4.estimasi_ukuran}`);
  console.log(`   Buat PR: ${analysis.step6?.buat_draft_pr}`);

  // ── Step 5a: Buat komentar triage di issue ────────────────────────────────
  console.log('\n💬 Menulis komentar triage di issue...');
  const comment = buildTriageComment(analysis, issueLanguage);

  await octokit.issues.createComment({
    owner: REPO_OWNER,
    repo: REPO_NAME,
    issue_number: issueNumber,
    body: comment,
  });

  // ── Step 5b: Terapkan label (kecuali duplicate/needs-more-info) ───────────
  const shouldSkipLabels = analysis.step2.status === 'duplicate' || analysis.step1.perlu_klarifikasi;

  if (!shouldSkipLabels) {
    // Filter: hanya label yang ada di repo, exclude yang sudah terpasang
    const labelsToAdd = analysis.step4.label.filter(l =>
      availableLabels.includes(l) && !existingLabels.includes(l)
    );

    // Jika needs-more-info, tambahkan label itu jika ada
    if (analysis.step1.perlu_klarifikasi && availableLabels.includes('needs-more-info')) {
      labelsToAdd.push('needs-more-info');
    }

    if (labelsToAdd.length > 0) {
      console.log(`🏷️  Menerapkan label: ${labelsToAdd.join(', ')}`);
      await octokit.issues.addLabels({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        issue_number: issueNumber,
        labels: labelsToAdd,
      });
    }
  } else {
    // Tambahkan needs-more-info atau duplicate label jika tersedia
    const statusLabel = analysis.step2.status === 'duplicate' ? 'duplicate' : 'needs-more-info';
    if (availableLabels.includes(statusLabel)) {
      await octokit.issues.addLabels({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        issue_number: issueNumber,
        labels: [statusLabel],
      });
    }
  }

  // ── Step 6: Buat draft PR jika applicable ────────────────────────────────
  if (analysis.step6?.buat_draft_pr) {
    const pr = await createDraftPR(analysis);
    if (pr) {
      // Update komentar dengan link PR
      const allComments = await octokit.issues.listComments({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        issue_number: issueNumber,
      });
      const triageComment = allComments.data.find(c => c.body.includes('🔍 Triage Otomatis'));
      if (triageComment) {
        await octokit.issues.updateComment({
          owner: REPO_OWNER,
          repo: REPO_NAME,
          comment_id: triageComment.id,
          body: triageComment.body.replace(
            `branch \`${analysis.step6.branch_name}\``,
            `branch [\`${analysis.step6.branch_name}\`](${pr.html_url})`
          ),
        });
      }
    }
  }

  console.log(`\n✅ Triage selesai untuk issue #${issueNumber}`);
}

main().catch(err => {
  console.error('❌ Triage agent error:', err);
  process.exit(1);
});
