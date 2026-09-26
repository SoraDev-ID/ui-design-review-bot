/**
 * Generate a sample design reference PNG for testing
 */
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const samplesDir = path.join(__dirname, 'samples');

fs.mkdirSync(samplesDir, { recursive: true });

// Create a 1440x900 design reference mockup
const width = 1440;
const height = 900;

// Create gradient background with SVG
const svgDesign = `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1a2e"/>
      <stop offset="100%" style="stop-color:#16213e"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  
  <!-- Navbar -->
  <rect x="0" y="0" width="${width}" height="64" fill="#0f3460"/>
  <text x="40" y="40" font-family="Arial" font-size="24" font-weight="bold" fill="white">MyApp</text>
  <text x="1200" y="40" font-family="Arial" font-size="16" fill="white">Login</text>
  <rect x="1280" y="20" width="120" height="36" rx="18" fill="#e94560"/>
  <text x="1340" y="43" font-family="Arial" font-size="14" font-weight="bold" fill="white" text-anchor="middle">Sign Up</text>

  <!-- Hero Section -->
  <text x="${width/2}" y="200" font-family="Arial" font-size="56" font-weight="bold" fill="white" text-anchor="middle">Build Faster.</text>
  <text x="${width/2}" y="270" font-family="Arial" font-size="56" font-weight="bold" fill="#e94560" text-anchor="middle">Ship Better.</text>
  <text x="${width/2}" y="330" font-family="Arial" font-size="20" fill="#a0a0b8" text-anchor="middle">The all-in-one platform for modern development teams.</text>
  
  <!-- CTA Buttons -->
  <rect x="560" y="380" width="200" height="52" rx="26" fill="#e94560"/>
  <text x="660" y="411" font-family="Arial" font-size="16" font-weight="bold" fill="white" text-anchor="middle">Get Started Free</text>
  <rect x="780" y="380" width="160" height="52" rx="26" fill="none" stroke="white" stroke-width="2"/>
  <text x="860" y="411" font-family="Arial" font-size="16" fill="white" text-anchor="middle">Watch Demo</text>

  <!-- Feature Cards -->
  <rect x="80" y="500" width="380" height="220" rx="16" fill="#0f3460" opacity="0.8"/>
  <text x="100" y="550" font-family="Arial" font-size="32">🚀</text>
  <text x="100" y="590" font-family="Arial" font-size="20" font-weight="bold" fill="white">Fast Deploy</text>
  <text x="100" y="618" font-family="Arial" font-size="14" fill="#a0a0b8">Deploy in seconds with one-click pipelines.</text>

  <rect x="530" y="500" width="380" height="220" rx="16" fill="#0f3460" opacity="0.8"/>
  <text x="550" y="550" font-family="Arial" font-size="32">🔒</text>
  <text x="550" y="590" font-family="Arial" font-size="20" font-weight="bold" fill="white">Secure by Default</text>
  <text x="550" y="618" font-family="Arial" font-size="14" fill="#a0a0b8">Enterprise-grade security out of the box.</text>

  <rect x="980" y="500" width="380" height="220" rx="16" fill="#0f3460" opacity="0.8"/>
  <text x="1000" y="550" font-family="Arial" font-size="32">📊</text>
  <text x="1000" y="590" font-family="Arial" font-size="20" font-weight="bold" fill="white">Analytics</text>
  <text x="1000" y="618" font-family="Arial" font-size="14" fill="#a0a0b8">Real-time insights for data-driven decisions.</text>

  <!-- Footer -->
  <rect x="0" y="840" width="${width}" height="60" fill="#0a0a1a"/>
  <text x="${width/2}" y="876" font-family="Arial" font-size="13" fill="#606080" text-anchor="middle">© 2024 MyApp. All rights reserved.</text>
</svg>`;

const outPath = path.join(samplesDir, 'design-reference.png');

await sharp(Buffer.from(svgDesign))
  .png()
  .toFile(outPath);

console.log('✅ Sample design reference created:', outPath);
