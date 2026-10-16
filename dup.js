// Converts a card's "dup" spelling to Duployan text. Shared by render.js (Node)
// and index.html (browser).
//
//   - letters are parsed greedily (longest match first), so "owa" = ow + a
//   - an apostrophe forces a break in the parse and is dropped: "o'wa" = o + wa
//   - a dash marks a syllable break and becomes U+200C ZERO WIDTH NON-JOINER
//   - a digit after a letter picks a numbered alternate form, as on the
//     duployan-test keyboard: "lo2", and a "\" or "/" before it is ignored, so
//     "lo\2" and "lo/2" are the same
//   - spaces and punctuation (including the "_" blank) pass through unchanged
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Dup = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const ZWNJ = '‌';
  // Three CGJs after a circle vowel reverse it (a Rawnd Musmus Duployan convention).
  const CGJ3 = '͏͏͏';
  const c = (...cps) => String.fromCodePoint(...cps);

  // Letters, diphthongs and their numbered forms, following the keyboard at
  // https://dscorbett.github.io/duployan-test/ (where "u" is our "oo").
  const LETTERS = {
    // Consonants
    h: c(0x1bc00), x: c(0x1bc01), p: c(0x1bc02), t: c(0x1bc03), f: c(0x1bc04),
    k: c(0x1bc05), l: c(0x1bc06), b: c(0x1bc07), d: c(0x1bc08), v: c(0x1bc09),
    g: c(0x1bc0a), r: c(0x1bc0b), th: c(0x1bc11), "k'": c(0x1bc14),
    hl: c(0x1bc16), lh: c(0x1bc17), rh: c(0x1bc18), m: c(0x1bc19), n: c(0x1bc1a),
    sh: c(0x1bc1b), s: c(0x1bc1c), ng: c(0x1bc22), ch: c(0x1bc23),
    ts: c(0x1bc25), c: c(0x1bc25),
    // Vowels and diphthongs; "2" is the form turned the other way
    a: c(0x1bc41), a2: c(0x1bc42),
    o: c(0x1bc44), o2: c(0x1bc44) + CGJ3,
    oo: c(0x1bc5b), oo2: c(0x1bc5b) + CGJ3,
    aw: c(0x1bc5a), aw2: c(0x1bc5a) + CGJ3,
    ow: c(0x1bc5a), ow2: c(0x1bc5a) + CGJ3,
    wa: c(0x1bc5c), wa2: c(0x1bc5c) + CGJ3,
    wo: c(0x1bc5d), wo2: c(0x1bc5d) + CGJ3,
    wi: c(0x1bc5e), wi2: c(0x1bc5e) + CGJ3,
    wei: c(0x1bc5f), wei2: c(0x1bc5f) + CGJ3,
    waw: c(0x1bc60), waw2: c(0x1bc60) + CGJ3,
    i: c(0x1bc46), i2: c(0x1bc47),
    // Non-orienting i forms
    i6: c(0x1bc48), i7: c(0x1bc49), i8: c(0x1bc4a), i9: c(0x1bc4b),
    e: c(0x1bc47), e2: c(0x1bc46),
    yu: c(0x1bc51), yu2: c(0x1bc52),
    eu: c(0x1bc53), eu2: c(0x1bc53) + CGJ3,
    // Nasal vowels (capital N)
    aN: c(0x1bc64), oN: c(0x1bc62), iN: c(0x1bc63), uN: c(0x1bc61),
  };

  // Letters you type directly; numbered forms hang off these.
  const KEYS = Object.keys(LETTERS)
    .filter((k) => !/\d$/.test(k))
    .sort((a, b) => b.length - a.length);
  const PASSTHROUGH = /[\s\p{P}\p{S}]/u;

  // The digits that follow `key` to make one of its numbered forms.
  const formsOf = (key) => Object.keys(LETTERS)
    .filter((k) => k.length === key.length + 1 && k.startsWith(key) && /\d$/.test(k))
    .map((k) => k.slice(-1));

  // Returns { text, error }. On an error, text holds what converted before it,
  // and error is { index, char, after } (after: the letter a bad digit followed).
  function toDuployan(dup) {
    // Lower-case only ASCII letters so positions in src and dup line up.
    const src = dup.replace(/[A-Z]/g, (ch) => ch.toLowerCase());
    const matches = (k, i) => (/[A-Z]/.test(k) ? dup : src).startsWith(k, i);
    const isSlashDigit = (i) => (src[i] === '\\' || src[i] === '/') && /\d/.test(src[i + 1] || '');
    let out = '';
    let i = 0;
    while (i < src.length) {
      const ch = src[i];
      if (isSlashDigit(i)) { i++; continue; }
      if (ch === "'") { i++; continue; }
      if (ch === '-') { out += ZWNJ; i++; continue; }
      if (PASSTHROUGH.test(ch)) { out += ch; i++; continue; }
      const key = KEYS.find((k) => matches(k, i));
      if (!key) {
        return { text: out, error: { index: i, char: Array.from(dup.slice(i))[0], after: null } };
      }
      let next = i + key.length;
      if (isSlashDigit(next)) next++;
      if (/\d/.test(src[next] || '')) {
        const form = LETTERS[key + src[next]];
        if (!form) return { text: out, error: { index: next, char: src[next], after: key } };
        out += form;
        i = next + 1;
      } else {
        out += LETTERS[key];
        i = i + key.length;
      }
    }
    return { text: out, error: null };
  }

  // Split a spelling into its letters the way toDuployan reads it (no digits).
  function tokens(dup) {
    const out = [];
    for (let i = 0; i < dup.length;) {
      if (dup[i] === "'") { i++; continue; }
      const key = KEYS.find((k) => dup.startsWith(k, i));
      if (!key) return null;
      out.push(key);
      i += key.length;
    }
    return out;
  }

  // ----- Words -----
  // A Chinook word: letters, with apostrophes allowed inside (k'au).
  const WORD = /[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu;
  const stripItalics = (s) => s.replace(/\*([^*]+)\*/g, '$1');
  const wordKey = (w) => w.normalize('NFC').toLowerCase().replace(/’/g, "'");

  // The distinct words of a card's Chinook text, in order.
  function wordsOf(chn) {
    const seen = new Set();
    for (const m of stripItalics(chn).matchAll(WORD)) seen.add(wordKey(m[0]));
    return [...seen];
  }

  // A card's dup line: each Chinook word replaced by spell(word), with the
  // spaces, punctuation and blanks between words kept.
  function cardDup(chn, spell) {
    const s = stripItalics(chn);
    let out = '';
    let last = 0;
    for (const m of s.matchAll(WORD)) {
      out += s.slice(last, m.index) + spell(wordKey(m[0]));
      last = m.index + m[0].length;
    }
    return out + s.slice(last);
  }

  // ----- Guessing a spelling for an unknown word -----
  // Units: { t: spelling, kind: 'C' consonant | 'V' vowel | 'W' w + vowel | 'Y' y glide }
  const ONSETS = /^(?:[pbtdkgf]l|s[ptk])$/;   // clusters that can start a syllable

  function unitsOf(word) {
    let w = word.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/['’]/g, '');
    // Letters with no Duployan spelling of their own become the nearest one.
    w = w.replace(/qu/g, 'kw').replace(/j/g, 'ch').replace(/q/g, 'k').replace(/z/g, 's').replace(/c(?!h)/g, 'k')
      .replace(/([bdfghklmnprstvx])\1/g, '$1')
      .replace(/(?<=[a-z])iyu/g, 'yu')   // hiyu: the i merges into yu
      .replace(/ou(?![aeiou])/g, 'u');   // French-style ou is oo (tamahnous)
    const units = [];
    const isVowel = (ch) => !!ch && 'aeiouy'.includes(ch);
    for (let i = 0; i < w.length;) {
      const rest = w.slice(i);
      let m;
      if ((m = rest.match(/^(ch|sh|th|ts|ng)/))) { units.push({ t: m[1], kind: 'C' }); i += 2; continue; }
      if ((m = rest.match(/^(oo|u)/))) { units.push({ t: 'oo', kind: 'V' }); i += m[1].length; continue; }
      if ((m = rest.match(/^au(?![aeiou])/))) { units.push({ t: 'aw', kind: 'V' }); i += 2; continue; }
      if (rest.startsWith('ee')) { units.push({ t: 'i', kind: 'V' }); i += 2; continue; }
      if (rest.startsWith('yu')) { units.push({ t: 'yu', kind: 'V' }); i += 2; continue; }
      if ((m = rest.match(/^([ao])w(?![aeiou])/))) { units.push({ t: m[1] + 'w', kind: 'V' }); i += 2; continue; }
      const ch = w[i];
      // e is read as i, as the Duployan test page does; the form rules then pick I or E.
      if ('aeio'.includes(ch)) { units.push({ t: ch === 'e' ? 'i' : ch, kind: 'V' }); i++; continue; }
      if (ch === 'w') {
        const v = w[i + 1];
        if (v && 'aoie'.includes(v)) { units.push({ t: 'w' + (v === 'e' ? 'i' : v), kind: 'W' }); i += 2; }
        else { units.push({ t: 'oo', kind: 'V' }); i++; }
        continue;
      }
      if (ch === 'y') {
        units.push(isVowel(w[i + 1]) && w[i + 1] !== 'y' ? { t: 'i', kind: 'Y' } : { t: 'i', kind: 'V' });
        i++;
        continue;
      }
      if (LETTERS[ch]) units.push({ t: ch, kind: 'C' });
      i++;   // anything else is dropped
    }
    return units;
  }

  // Group units into syllables: V-CV, VC-CV, and keep onset clusters like kl, sk together.
  function syllables(units) {
    const isNucleus = (u) => u.kind === 'V' || u.kind === 'W';
    const nuclei = units.map((u, i) => (isNucleus(u) ? i : -1)).filter((i) => i >= 0);
    if (nuclei.length < 2) return [units];
    const cuts = [];
    for (let n = 1; n < nuclei.length; n++) {
      const prev = nuclei[n - 1], cur = nuclei[n];
      const between = units.slice(prev + 1, cur);
      if (units[cur].kind === 'W') { cuts.push(prev + 1 + between.length); continue; }  // wa/wo/wi start a syllable
      if (between.length === 0) continue;                                         // vowel pair: one syllable (nai)
      // A word-initial i keeps a following l, s, sh, ch or ts (il-i-hi, is-kum).
      if (prev === 0 && units[0].t === 'i' && ['l', 's', 'sh', 'ch', 'ts'].includes(between[0].t)) {
        if (between.length > 1) cuts.push(prev + 2);
        continue;
      }
      if (between.length === 1) { cuts.push(prev + 1); continue; }                // V-CV
      const lastTwo = between.slice(-2).map((u) => u.t).join('');
      cuts.push(cur - (ONSETS.test(lastTwo) ? 2 : 1));                            // VC-CV, or V-CCV for kl/sk
    }
    const out = [];
    let start = 0;
    for (const c of cuts) { if (c > start) { out.push(units.slice(start, c)); start = c; } }
    out.push(units.slice(start));
    return out;
  }

  // Join a syllable's units, adding an apostrophe only where letters would
  // merge. A unit's form number (u.form, e.g. "2") follows its letter; like an
  // apostrophe, a number ends a run of letters, so no apostrophe is needed after it.
  function spellSyllable(units) {
    let s = '';
    let run = '';    // letters since the last apostrophe or number
    let want = [];   // the letters that run should read as
    for (const u of units) {
      const t = u.kind === 'Y' ? 'i' : u.t;
      const got = tokens(run + t);
      if (run && !(got && got.join('|') === [...want, t].join('|'))) {
        s += "'";
        run = '';
        want = [];
      }
      s += t;
      run += t;
      want.push(t);
      if (u.form) {
        s += u.form;
        run = '';
        want = [];
      }
    }
    return s;
  }

  // Ask the rules above which vowels take another form, and record it on the units.
  function chooseForms(sylls) {
    const flat = sylls.flat();
    const keyOf = (u) => (u.kind === 'Y' ? 'i' : u.t);
    const word = sylls.map((syl) => syl.map((u) => LETTERS[keyOf(u)]).join('')).join(ZWNJ);
    let marked;
    try {
      marked = markAlternates(word);
    } catch {
      return;
    }
    const letters = [];
    for (const ch of marked) {
      if (ch === 'R') { if (letters.length) letters[letters.length - 1].alt = true; continue; }
      if (ch === ZWNJ) continue;
      letters.push({ ch });
    }
    if (letters.length !== flat.length) return;   // the rules changed the letters; keep the guess as is
    letters.forEach((l, n) => {
      const u = flat[n];
      if (l.ch === '\u{1BC4A}' || l.ch === '\u{1BC4B}') {   // non-orienting i: consonantal i (i8), or i9
        u.t = 'i';
        u.kind = 'V';
        u.form = l.ch === '\u{1BC4A}' ? '8' : '9';
      } else if (l.alt && LETTERS[keyOf(u) + '2']) {
        u.form = '2';
      }
    });
  }

  // ----- Choosing alternate forms -----
  // The rules below are copied from transliterate.js in the Duployan test page,
  // https://dscorbett.github.io/duployan-test/ (lines 270-303 and 316-388):
  //   Copyright 2021 Google LLC
  //   Copyright 2023-2026 David Corbett
  //   Licensed under the Apache License, Version 2.0
  //   (http://www.apache.org/licenses/LICENSE-2.0).
  // They take one word in Duployan letters (with ZWNJ between syllables) and
  // mark with "R" each vowel that should take its other orientation; they also
  // swap in the non-orienting i forms U+1BC4A (consonantal i) and U+1BC4B.
  function markAlternates(word) {
    const hConsonant = '[\u{1BC00}\u{1BC01}]'
    const pConsonant = '[\u{1BC02}\u{1BC07}]';
    const tConsonant = '[\u{1BC03}\u{1BC08}\u{1BC11}]';
    const fConsonant = '[\u{1BC04}\u{1BC09}]';
    const kConsonant = '[\u{1BC05}\u{1BC0A}\u{1BC14}]';
    const lConsonant = '[\u{1BC06}\u{1BC0B}\u{1BC16}-\u{1BC18}]';
    const mConsonant = '\u{1BC19}';
    const nConsonant = '[\u{1BC1A}\u{1BC22}]';
    const jConsonant = '[\u{1BC1B}\u{1BC23}]';
    const sConsonant = '[\u{1BC1C}\u{1BC25}]';
    const curveConsonant = `(?:${mConsonant}|${nConsonant}|${jConsonant}|${sConsonant})`;
    const marks = '[PR\\p{M}]*';
    const normalCircleVowel = '[\u{1BC41}\u{1BC44}\u{1BC5A}\u{1BC5B}]';
    const reversibleCircleVowel = `(?:${normalCircleVowel}|[\u{1BC5C}-\u{1BC60}])`;
    const circleVowel = `(?:(?:\u{1BC42}|${normalCircleVowel})${marks})`;
    const iVowelNoMarks = '[\u{1BC46}\u{1BC47}]';
    const iVowel = `(?:${iVowelNoMarks}${marks})`;
    const uVowel = `(?:[\u{1BC51}-\u{1BC53}\u{1BC61}-\u{1BC64}]${marks})`;
    const curveVowel = `(?:(?:${iVowel}|${uVowel}|\u{1BC4B})${marks})`;
    const waVowel = `(?:[\u{1BC5C}\u{1BC5D}\u{1BC60}]${marks})`;
    const wiVowel = `(?:[\u{1BC5E}\u{1BC5F}]${marks})`;
    const wVowel = `(?:[\u{1BC5C}-\u{1BC60}]${marks})`;
    const vowel = `(?:${circleVowel}|${curveVowel}|${wVowel})`;
    const noLaitin = `(?<![\u{1BC06}\u{1BC16}\u{1BC17}]\\p{M}*[\u{1BC41}\u{1BC42}]R?\\p{M}*${iVowel}(?=${tConsonant}\\p{M}*${iVowel}${nConsonant}\\p{M}*(?!${vowel})))`;
    const noLip = `(?<![\u{1BC06}\u{1BC16}\u{1BC17}]\\p{M}*${iVowel}(?=[\u{1BC02}\u{1BC04}]))`;
    const consonantalI = `(?:(?<=^|[^\\p{L}\\p{M}]${marks})${iVowel}(?=${circleVowel}(?!${tConsonant}|${lConsonant}|${nConsonant}|${jConsonant}))|\u{1BC4A})`;
    const lineObstruent = `(?:${pConsonant}|${tConsonant}|${fConsonant}|${kConsonant})`;
    const consonant = `(?:(?:${lineObstruent}|${lConsonant}|${curveConsonant}|${consonantalI})\\p{M}*)`;
    const consonantOrH = `(?:${consonant}|${hConsonant}\\p{M}*)`;
    const noSmallInitialVowel = `(?<!(?:^|[^\\p{L}\\p{M}]${marks})(?:[\u{1BC61}-\u{1BC64}]${marks}|${iVowel})(?=${lConsonant}|${jConsonant}|${sConsonant}))`;
    const noConsonantLiquidOnset = `(?!(?:${pConsonant}|\u{1BC03}|${fConsonant}|${kConsonant})\\p{M}*[\u{1BC06}\u{1BC0B}])`;
    const onset = `(?:${consonantOrH}|\u{1BC1C}\\p{M}*(?:${lConsonant}|${mConsonant}|${nConsonant})\\p{M}*|(?:\u{1BC1C}\\p{M}*)?${lineObstruent}\\p{M}*(?:${lConsonant}\\p{M}*)?)`;
    const start = `(?<=^|[^\\p{L}\\p{M}]${marks}|${hConsonant})`;
    const end = `(?=\\p{M}*(${hConsonant}|[^\\p{L}\\p{M}]|$))`;
    return (word
        .replaceAll(/^\u200C+/g, '')
        .replaceAll(RegExp(`(?=${consonantalI})${iVowelNoMarks}(?=\\p{M}*R)`, 'gu'), '\u{1BC4B}')
        .replaceAll(RegExp(`(?=${consonantalI})${iVowelNoMarks}`, 'gu'), '\u{1BC4A}')
        .replaceAll(RegExp(`(?<=${nConsonant}${circleVowel})${iVowelNoMarks}(?=[R\\p{M}]*(${hConsonant}|[^\\p{L}\\p{M}]|$))`, 'gu'), '\u{1BC4B}')
        .replaceAll(RegExp(`(?<=${nConsonant}${circleVowel})${iVowelNoMarks}(?!\\p{M}*P)`, 'gu'), '$&R')
        .replaceAll(RegExp(`((?<=\\p{L}${marks})|(?=.[PR]*\\p{L}))\u{1BC64}`, 'gu'), '\u{1BC64}\u0301')
        .replaceAll(RegExp(`((?<=\\p{L}${marks})|(?=.[PR]*\\p{L}))\u{1BC63}`, 'gu'), '\u{1BC64}\u0300')
        .replaceAll(RegExp(`((?<!\\p{L}${marks})(?=.[PR]*\\p{L}))\u{1BC62}`, 'gu'), '\u{1BC64}\u0317')
        .replaceAll(RegExp(`((?<!\\p{L}${marks})(?=.[PR]*\\p{L}))\u{1BC61}`, 'gu'), '\u{1BC64}\u0316')
        .replaceAll(RegExp(`((?<=\\p{L}${marks})|(?=.[PR]*\\p{L}))\u{1BC62}`, 'gu'), '\u{1BC62}\u0317')
        .replaceAll(RegExp(`((?<=\\p{L}${marks})|(?=.[PR]*\\p{L}))\u{1BC61}`, 'gu'), '\u{1BC62}\u0316')
        .replaceAll(RegExp(`(?<=\\p{L}${marks})\u{1BC62}(?![\u0316\u0317])`, 'gu'), '\u{1BC62}\u0317')
        .replaceAll(RegExp(`\u{1BC64}(?=[\u0300\u0301\u0316\u0317](${tConsonant}|${lConsonant}|${curveConsonant}))`, 'gu'), '\u{1BC62}')
        .replaceAll(RegExp(`(?<=${lConsonant}|${curveConsonant})\u{1BC64}(?=[\u0300\u0301])`, 'gu'), '\u{1BC62}')
        .replaceAll(RegExp(`(?<=${kConsonant})\u{1BC62}(?=[\u0316\u0317])`, 'gu'), '\u{1BC64}')
        .replaceAll(RegExp(`(?<=${vowel}${marks})\u{1BC64}(?=[\u0300\u0301\u0316\u0317])`, 'gu'), '\u{1BC62}')
        .replaceAll(RegExp(`${start}${reversibleCircleVowel}(?=\u{1BC46}${marks}(?!${hConsonant}|\\P{L}|$))`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<=${start}${iVowel})${circleVowel}(?=${tConsonant}|${lConsonant})`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<=${start}${normalCircleVowel}${marks})\u{1BC46}(?=\\p{M}*(${hConsonant}|[^\\p{L}\\p{M}]|$))`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<=${pConsonant})${reversibleCircleVowel}(?=\u{1BC46}|[\u{1BC51}\u{1BC53}](?!\\p{M}*R))`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<=${tConsonant})${reversibleCircleVowel}(?=\u{1BC46}${jConsonant})`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<=${fConsonant})${reversibleCircleVowel}(?=\u{1BC46}(${kConsonant}|${jConsonant}))`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<=${kConsonant})${reversibleCircleVowel}(?=(\u{1BC46}|[\u{1BC51}\u{1BC53}](?!\\p{M}*R))(?!${pConsonant}))`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<=${lConsonant})${reversibleCircleVowel}(?=\u{1BC46}${tConsonant})`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<!${consonant}|${vowel})${normalCircleVowel}(?=${pConsonant}|${fConsonant}|${kConsonant})`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<!${consonant}${vowel}*)\u{1BC46}(?=\\p{M}*${iVowel}*(${tConsonant}|${lConsonant}|${curveConsonant}))`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<!${consonant}|${vowel})[\u{1BC51}\u{1BC53}](?=${tConsonant})`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<!${consonant}|${vowel})[\u{1BC51}\u{1BC53}](?=${lConsonant})`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<!${consonant}|${vowel})[\u{1BC51}\u{1BC53}](?=${curveConsonant})`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<=${pConsonant})(?!${wVowel})${reversibleCircleVowel}(?=${pConsonant}|${sConsonant})`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<=${tConsonant})${reversibleCircleVowel}(?=\\p{M}*(${hConsonant}|[^\\p{L}\\p{M}]|$))`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<=${tConsonant})\u{1BC46}(?!\\p{M}*(P|${iVowel}*${jConsonant}))`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<=${tConsonant})[\u{1BC51}\u{1BC53}](?!\\p{M}*(P|${lConsonant}))`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<=${fConsonant})\u{1BC46}(?=\\p{M}*${mConsonant})`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<=(?<!${lConsonant})${kConsonant})(?!\u{1BC5B})${normalCircleVowel}(?=${kConsonant})`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<=${lConsonant})${reversibleCircleVowel}(?=\\p{M}*(${hConsonant}|[^\\p{L}\\p{M}]|$))`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<=${kConsonant}${lConsonant})${reversibleCircleVowel}(?!${marks}([PR]|${pConsonant}|${tConsonant}|${fConsonant}|${kConsonant}|${curveConsonant}|${vowel}))`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<=${lConsonant})\u{1BC5B}(?!\\p{M}*P)(?=\\p{M}*${jConsonant})`, 'gu'), '$&R')
        .replaceAll(RegExp(`${start}\u{1BC5E}${marks}(?=${lConsonant}|${jConsonant})`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<=${pConsonant})${waVowel}(?=${tConsonant}|${lConsonant}|${jConsonant})`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<=${tConsonant})${waVowel}(?=${pConsonant}|${kConsonant}|${mConsonant})`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<=${fConsonant})${waVowel}(?=${lConsonant}|${jConsonant}|${mConsonant})`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<=${kConsonant})${waVowel}(?=${tConsonant}|${lConsonant}|${jConsonant}|${nConsonant})`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<=${lConsonant})${waVowel}(?=${pConsonant}|${fConsonant}|${kConsonant}|${mConsonant}|${sConsonant})`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<=${mConsonant})${waVowel}(?=${pConsonant}|${tConsonant}|${kConsonant}|${mConsonant})`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<=${nConsonant})${waVowel}(?=${tConsonant}|${lConsonant}|${jConsonant})`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<=${jConsonant})${waVowel}(?=${tConsonant}|${lConsonant}|${jConsonant})`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<=${sConsonant})${waVowel}(?=${pConsonant}|${tConsonant}|${fConsonant}|${kConsonant}|${mConsonant}|${nConsonant}|${sConsonant})`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<=${pConsonant})${wiVowel}(?=${mConsonant})`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<=${tConsonant})${wiVowel}(?=${pConsonant}|${fConsonant}|${kConsonant}|${mConsonant}|${nConsonant}|${sConsonant})`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<=${fConsonant})${wiVowel}(?=${mConsonant})`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<=${lConsonant})${wiVowel}(?=${pConsonant}|${tConsonant}|${fConsonant}|${kConsonant}|${mConsonant}|${nConsonant}|${sConsonant})`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<=${mConsonant})${wiVowel}(?=${pConsonant}|${tConsonant}|${kConsonant}|${mConsonant})`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<=${nConsonant})${wiVowel}(?=${tConsonant}|${lConsonant}|${nConsonant}|${jConsonant})`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<=${jConsonant})${wiVowel}(?=${tConsonant}|${lConsonant}|${nConsonant}|${jConsonant})`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<=${sConsonant})${wiVowel}(?=${pConsonant}|${tConsonant}|${fConsonant}|${nConsonant}|${sConsonant})`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<=${lConsonant})\u{1BC46}(?!\\p{M}*P)`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<=${lConsonant}${circleVowel}?)[\u{1BC51}\u{1BC53}](?!\\p{M}*P)`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<=${curveConsonant})\u{1BC46}(?!\\p{M}*P)`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<=${curveConsonant}${circleVowel}?)[\u{1BC51}\u{1BC53}](?!\\p{M}*P)`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<!\\p{L})\u{1BC46}(?=\u200C?(${hConsonant}|${iVowel}))`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<=${hConsonant})\u{1BC46}(?=\\p{M}*(${hConsonant}|[^\\p{L}\\p{M}]|$))`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<=${consonant}${vowel}*${iVowel})\u{1BC46}(?!\\p{M}*P)`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<=${iVowel})\u{1BC46}(?!\\p{M}*(P|${vowel}*${consonant}))`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<!${consonant}${vowel}*)\u{1BC46}(?=\\p{M}*${iVowel}${vowel}*${consonant})`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<=(${pConsonant}|${jConsonant})${iVowel})${normalCircleVowel}(?=${jConsonant})`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<=(${tConsonant}|${mConsonant})\u{1BC47})${normalCircleVowel}(?=${mConsonant})`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<=${nConsonant}\u{1BC47})${normalCircleVowel}(?=${nConsonant})`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<=${sConsonant}\u{1BC47})${normalCircleVowel}(?=${sConsonant})`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<=${iVowel})${normalCircleVowel}(?=\\p{M}*(${hConsonant}|[^\\p{L}\\p{M}]|$))`, 'gu'), '$&R')
        .replaceAll(RegExp(`(?<=[\u{1BC5E}\u{1BC5F}]\\p{M}*)${reversibleCircleVowel}(?!\\p{M}*P)`, 'gu'), '$&R')
        .replace(/(?<=[PR]\p{M}*)[PR]/gu, '')
        .replaceAll('P', '')
    );
  }

  function guess(word) {
    const units = unitsOf(word);
    if (!units.length) return '';
    const sylls = syllables(units);
    chooseForms(sylls);
    return sylls.map(spellSyllable).join('-');
  }

  return { LETTERS, KEYS, formsOf, toDuployan, tokens, wordsOf, wordKey, cardDup, guess };
});
