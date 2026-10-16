#!/usr/bin/env node
// Render each card in cards.json to its own PNG: Duployan on top, Chinook in
// the middle, English at the bottom.
//
// The Duployan line is built word by word from the Chinook text: each word's
// spelling comes from words.json, or is guessed (dup.js) when it isn't there.
//
// Usage: node render.js [cards.json] [out-dir] [words.json]

const fs = require('fs');
const path = require('path');

const { toDuployan: convert, cardDup, guess } = require('./dup.js');

function toDuployan(dup) {
  const { text, error } = convert(dup);
  if (error) {
    const what = error.after ? `"${error.after}" has no form ${error.char}` : `unsupported letter "${error.char}"`;
    throw new Error(`${what} at position ${error.index} in "${dup}"`);
  }
  return text;
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
  const wordsPath = path.resolve(process.argv[4] || path.join(__dirname, 'words.json'));
  const words = fs.existsSync(wordsPath) ? JSON.parse(fs.readFileSync(wordsPath, 'utf8')) : {};
  const guessed = new Set();
  const spell = (w) => {
    if (words[w]) return words[w].dup;
    guessed.add(w);
    return guess(w);
  };

  // Validate every card before rendering anything.
  const errors = [];
  const converted = cards.map((card, n) => {
    try {
      return toDuployan(cardDup(card.chn || '', spell));
    } catch (e) {
      errors.push(`card ${n + 1}: ${e.message}`);
      return null;
    }
  });
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
  if (guessed.size) console.log(`guessed (not in words.json): ${[...guessed].join(', ')}`);

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
