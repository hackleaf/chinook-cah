#!/usr/bin/env node
// Render each card in cards.json to its own PNG: Duployan on top, Chinook in
// the middle, English at the bottom.
//
// The "dup" field is a romanized spelling that is converted to Duployan:
//   - letters are parsed greedily (longest match first), so "owa" = ow + a
//   - an apostrophe forces a break in the parse and is dropped: "o'wa" = o + wa
//   - a dash marks a syllable break and becomes U+200C ZERO WIDTH NON-JOINER
//   - spaces and punctuation (including the "_" blank) pass through unchanged
//
// Usage: node render.js [cards.json] [out-dir]

const fs = require('fs');
const path = require('path');

const ZWNJ = '‌';

// Romanized letter -> Duployan code point. Only these letters are allowed.
const LETTERS = {
  a: 0x1bc41, // A
  o: 0x1bc44, // O
  oo: 0x1bc5b, // OU
  ow: 0x1bc5a, // OW
  wa: 0x1bc5c, // WA
  wo: 0x1bc5d, // WO
  wi: 0x1bc5e, // WI
  e: 0x1bc47, // E
  i: 0x1bc46, // I
  h: 0x1bc00, // H
  p: 0x1bc02, // P
  l: 0x1bc06, // L
  t: 0x1bc03, // T
  k: 0x1bc05, // K
  s: 0x1bc1c, // S
  sh: 0x1bc1b, // J
  n: 0x1bc1a, // N
  m: 0x1bc19, // M
  ch: 0x1bc23, // J WITH DOT
  ts: 0x1bc25, // S WITH DOT
  th: 0x1bc11, // TH
  b: 0x1bc07, // B
  d: 0x1bc08, // D
  f: 0x1bc04, // F
  v: 0x1bc09, // V
  g: 0x1bc0a, // G
  r: 0x1bc0b, // R
};
const KEYS = Object.keys(LETTERS).sort((a, b) => b.length - a.length);

// A "2" right after a vowel selects its alternate form (turned the other way).
const CGJ3 = '\u034F\u034F\u034F';
const ALTERNATES = {
  a: '\u{1BC42}', // reversed A (SLOAN OW)
  e: '\u{1BC46}', // E turned the other way is I
  i: '\u{1BC47}', // I turned the other way is E
};
// Circle vowels: three CGJs reverse the circle (a Rawnd Musmus Duployan convention).
for (const k of ['o', 'oo', 'ow', 'wa', 'wo', 'wi']) ALTERNATES[k] = String.fromCodePoint(LETTERS[k]) + CGJ3;
const PASSTHROUGH = /[\s_.,;:!?"()]/;

function toDuployan(dup) {
  const src = dup.toLowerCase();
  let out = '';
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "'") {
      i++;
    } else if (ch === '-') {
      out += ZWNJ;
      i++;
    } else if (PASSTHROUGH.test(ch)) {
      out += ch;
      i++;
    } else {
      const key = KEYS.find((k) => src.startsWith(k, i));
      if (!key) {
        throw new Error(`unsupported letter "${dup[i]}" at position ${i} in "${dup}"`);
      }
      const next = i + key.length;
      if (src[next] === '2') {
        if (!ALTERNATES[key]) {
          throw new Error(`"${key}" has no alternate form ("2" at position ${next}) in "${dup}"`);
        }
        out += ALTERNATES[key];
        i = next + 1;
      } else {
        out += String.fromCodePoint(LETTERS[key]);
        i = next;
      }
    }
  }
  return out;
}

const esc = (s) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Show each "_" blank as a fill-in line.
const withBlanks = (s) => esc(s).replace(/_+/g, '<span class="blank"></span>');

// Latin text also supports *italics*.
const latin = (s) => withBlanks(s).replace(/\*([^*]+)\*/g, '<em>$1</em>');

function cardHtml(card, duployan, fontUrl) {
  return `<!doctype html><meta charset="utf-8"><style>
@font-face { font-family: Dup; src: url("${fontUrl}"); }
html, body { margin: 0; background: transparent; }
.card {
  box-sizing: border-box; width: 750px; height: 1050px; padding: 64px 60px;
  border-radius: 40px; background: #111; color: #fff;
  font-family: "DejaVu Sans", sans-serif;
  display: flex; flex-direction: column; justify-content: space-between;
}
.card.white { background: #fdfdfb; color: #121212; box-shadow: inset 0 0 0 2px #cfd5d2; }
.dup { font-family: Dup, "DejaVu Sans", sans-serif; font-size: 72px; line-height: 2.2; padding-left: 20px; }
.chn { font-size: 46px; font-weight: bold; line-height: 1.3; }
.en { font-size: 30px; line-height: 1.35; opacity: 0.72; transform: rotate(180deg); }
.blank { display: inline-block; width: 3.5em; border-bottom: 0.08em solid currentColor; }
.dup .blank { width: 2em; }
</style>
<div class="card${card.prompt ? '' : ' white'}">
  <div class="dup">${withBlanks(duployan)}</div>
  <div class="chn">${latin(card.chn)}</div>
  <div class="en">${latin(card.en)}</div>
</div>`;
}

async function main() {
  const cardsPath = path.resolve(process.argv[2] || path.join(__dirname, 'cards.json'));
  const outDir = path.resolve(process.argv[3] || path.join(__dirname, 'out'));
  // Patched Noto Sans Duployan (scripts/patch_font.py), no longer used:
  // const font = fs.readFileSync(path.join(__dirname, 'fonts', 'NotoSansDuployanChinook-Regular.woff2'));
  // const fontUrl = 'data:font/woff2;base64,' + font.toString('base64');
  const font = fs.readFileSync(path.join(__dirname, 'fonts', 'RawndMusmusDuployan-Regular.woff2'));
  const fontUrl = 'data:font/woff2;base64,' + font.toString('base64');
  const cards = JSON.parse(fs.readFileSync(cardsPath, 'utf8'));

  // Validate every card before rendering anything.
  const errors = [];
  const converted = cards.map((card, n) => {
    try {
      return toDuployan(card.dup);
    } catch (e) {
      errors.push(`card ${n + 1}: ${e.message}`);
      return null;
    }
  });
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
  }

  const { chromium } = require('playwright');
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 750, height: 1050 } });
  for (const [n, card] of cards.entries()) {
    await page.setContent(cardHtml(card, converted[n], fontUrl));
    await page.evaluate(() => document.fonts.ready);
    const file = path.join(outDir, `card-${String(n + 1).padStart(3, '0')}.png`);
    await page.locator('.card').screenshot({ path: file, omitBackground: true });
    console.log(file);
  }
  await browser.close();
}

module.exports = { toDuployan };

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
