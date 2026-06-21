// ===================================================================
// Inline the v2 scraper into rankings-wizard.tsx
// Replaces the BEATPORT_SCRAPER_SCRIPT constant's content.
// ===================================================================
const fs = require('fs');

const targetPath = '/home/z/my-project/src/components/rankings-wizard.tsx';
const scraperPath = '/home/z/my-project/scripts/beatport-scraper-v2.js';

const fileContent = fs.readFileSync(targetPath, 'utf8');
const scraperSource = fs.readFileSync(scraperPath, 'utf8');

// The v1 constant is on a single line, starting with `const BEATPORT_SCRAPER_SCRIPT = \``
// and ending with `return out})();\`;`
// We need to replace the ENTIRE content between the backticks (inclusive).

const startMarker = 'const BEATPORT_SCRAPER_SCRIPT = `';
const endMarker = '`;\n\n\nfunction getDaysSince';

const startIdx = fileContent.indexOf(startMarker);
if (startIdx === -1) {
  console.error('FATAL: start marker not found');
  process.exit(1);
}

const endIdx = fileContent.indexOf(endMarker, startIdx);
if (endIdx === -1) {
  console.error('FATAL: end marker not found');
  process.exit(1);
}

const before = fileContent.slice(0, startIdx + startMarker.length);
const after = fileContent.slice(endIdx);

// Escape backticks and ${...} in the scraper source — the scraper uses template literals
// internally? Let me check... No, it uses regular string concatenation with single quotes
// and no backticks. So we can safely inline it. But there ARE regex with backslashes
// (e.g. /\/label\/(\d+)/) — in a JS template literal, backslashes need to be escaped
// (\\/) to produce a literal backslash in the runtime string.
//
// Solution: escape every backslash → double backslash, and escape backticks (none) and ${ (none).
const escapedScraper = scraperSource
  .replace(/\\/g, '\\\\')    // \  → \\  (escape for template literal)
  .replace(/`/g, '\\`')      // `  → \`  (escape backtick — none in source but be safe)
  .replace(/\$\{/g, '\\${'); // ${ → \${ (escape interpolation — none but be safe)

const newContent = before + escapedScraper + after;

fs.writeFileSync(targetPath, newContent, 'utf8');
console.log('✓ Scraper v2 inlined into', targetPath);
console.log('  File size:', fileContent.length, '→', newContent.length, 'bytes');
