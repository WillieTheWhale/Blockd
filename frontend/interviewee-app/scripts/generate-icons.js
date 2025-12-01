#!/usr/bin/env node
/**
 * Icon Generation Script for Blockd Interviewee Electron App
 *
 * This script converts a source PNG image into all required icon formats
 * for Windows (.ico), macOS (.icns), and Linux (.png).
 *
 * Usage:
 *   npm run generate-icons
 *   OR
 *   node scripts/generate-icons.js [source-png-path]
 *
 * Requirements:
 *   - electron-icon-builder package (installed as devDependency)
 *   - Source PNG should be at least 1024x1024 pixels (square)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const RESOURCES_DIR = path.join(__dirname, '..', 'resources');
const DEFAULT_SOURCE = 'Electron_Logo.png';

// Get source file from argument or use default
const sourceArg = process.argv[2];
let sourcePng;

if (sourceArg) {
  sourcePng = path.isAbsolute(sourceArg) ? sourceArg : path.join(process.cwd(), sourceArg);
} else {
  // Look for source in resources directory
  const possibleNames = ['Electron_Logo.png', 'logo.png', 'icon-source.png', 'icon.png'];
  for (const name of possibleNames) {
    const testPath = path.join(RESOURCES_DIR, name);
    if (fs.existsSync(testPath)) {
      sourcePng = testPath;
      break;
    }
  }
}

if (!sourcePng || !fs.existsSync(sourcePng)) {
  console.error('Error: Source PNG file not found!');
  console.error('');
  console.error('Please ensure your logo PNG file exists in one of these locations:');
  console.error(`  - ${path.join(RESOURCES_DIR, 'Electron_Logo.png')}`);
  console.error(`  - ${path.join(RESOURCES_DIR, 'logo.png')}`);
  console.error(`  - ${path.join(RESOURCES_DIR, 'icon-source.png')}`);
  console.error('');
  console.error('Or provide the path as an argument:');
  console.error('  npm run generate-icons -- /path/to/your/logo.png');
  process.exit(1);
}

console.log('='.repeat(60));
console.log('Blockd Icon Generator');
console.log('='.repeat(60));
console.log(`Source: ${sourcePng}`);
console.log(`Output: ${RESOURCES_DIR}`);
console.log('');

// Ensure resources directory exists
if (!fs.existsSync(RESOURCES_DIR)) {
  fs.mkdirSync(RESOURCES_DIR, { recursive: true });
}

try {
  // Run electron-icon-builder
  console.log('Generating icons...');

  const iconBuilderPath = path.join(__dirname, '..', 'node_modules', '.bin', 'electron-icon-builder');
  const cmd = `"${iconBuilderPath}" --input="${sourcePng}" --output="${RESOURCES_DIR}" --flatten`;

  execSync(cmd, { stdio: 'inherit' });

  // Rename output files to match forge.config.ts expectations
  const generatedFiles = {
    mac: path.join(RESOURCES_DIR, 'icon.icns'),
    win: path.join(RESOURCES_DIR, 'icon.ico'),
    png: path.join(RESOURCES_DIR, 'icon.png'),
  };

  // Copy the 1024x1024 PNG as icon.png if it doesn't exist
  const png1024 = path.join(RESOURCES_DIR, '1024x1024.png');
  if (fs.existsSync(png1024) && !fs.existsSync(generatedFiles.png)) {
    fs.copyFileSync(png1024, generatedFiles.png);
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('Icons generated successfully!');
  console.log('='.repeat(60));
  console.log('');
  console.log('Generated files:');

  for (const [platform, filePath] of Object.entries(generatedFiles)) {
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      console.log(`  [${platform.toUpperCase().padEnd(5)}] ${path.basename(filePath)} (${(stats.size / 1024).toFixed(1)} KB)`);
    }
  }

  console.log('');
  console.log('Your Electron app is now ready with custom icons!');
  console.log('Run "npm run make" to build the application.');

} catch (error) {
  console.error('');
  console.error('Error generating icons:', error.message);
  console.error('');
  console.error('Make sure electron-icon-builder is installed:');
  console.error('  npm install --save-dev electron-icon-builder');
  process.exit(1);
}
