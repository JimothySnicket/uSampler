import sharp from 'sharp';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read the SVG file (optional - we're creating a simplified version)
// const svgPath = resolve(__dirname, '../Logo design/Design uSampler Logo Ideas.svg');
// const svgContent = readFileSync(svgPath, 'utf-8');

// Extract the 128x128 logo section (at position 663.503, 623.803)
// The logo consists of:
// - Base rectangle: 127.998x127.998 at (663.503, 623.803) fill #0F172A
// - Two vertical bars: 30.9928x89.992 at (682.506, 642.806) and (741.505, 642.806) fill #FACC15
// - One horizontal bar: 89.992x30.9928 at (682.506, 701.805) fill #FACC15

// Create a simplified SVG with just the logo
const logoSVG = `
<svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
  <rect width="128" height="128" fill="#0F172A"/>
  <rect x="19" y="19" width="31" height="90" fill="#FACC15"/>
  <rect x="78" y="19" width="31" height="90" fill="#FACC15"/>
  <rect x="19" y="78" width="90" height="31" fill="#FACC15"/>
</svg>
`;

// Output directory
const outputDir = resolve(__dirname, '../public');

// Generate icons at different sizes
const sizes = [16, 32, 48, 128];

async function generateIcons() {
  console.log('Generating icons from logo...');
  
  for (const size of sizes) {
    const outputPath = resolve(outputDir, `icon${size}.png`);
    
    try {
      await sharp(Buffer.from(logoSVG))
        .resize(size, size, {
          kernel: sharp.kernel.lanczos3
        })
        .png()
        .toFile(outputPath);
      
      console.log(`✓ Generated icon${size}.png (${size}x${size})`);
    } catch (error) {
      console.error(`✗ Failed to generate icon${size}.png:`, error.message);
    }
  }
  
  console.log('\nIcon generation complete!');
}

generateIcons().catch(console.error);

