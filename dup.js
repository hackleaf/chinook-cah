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
      .replace(/([bdfghklmnprstvx])\1/g, '$1');
    const units = [];
    const isVowel = (ch) => !!ch && 'aeiouy'.includes(ch);
    for (let i = 0; i < w.length;) {
      const rest = w.slice(i);
      let m;
      if ((m = rest.match(/^(ch|sh|th|ts|ng)/))) { units.push({ t: m[1], kind: 'C' }); i += 2; continue; }
      if ((m = rest.match(/^(oo|u)/))) { units.push({ t: 'oo', kind: 'V' }); i += m[1].length; continue; }
      if ((m = rest.match(/^au(?![aeiou])/))) { units.push({ t: 'aw', kind: 'V' }); i += 2; continue; }
      if (rest.startsWith('ee')) { units.push({ t: 'i', kind: 'V' }); i += 2; continue; }
      if ((m = rest.match(/^([ao])w(?![aeiou])/))) { units.push({ t: m[1] + 'w', kind: 'V' }); i += 2; continue; }
      const ch = w[i];
      if ('aeio'.includes(ch)) { units.push({ t: ch, kind: 'V' }); i++; continue; }
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

  // Join a syllable's units, adding an apostrophe only where letters would merge.
  function spellSyllable(units) {
    let s = '';
    const want = [];
    for (const u of units) {
      const t = u.kind === 'Y' ? 'i' : u.t;
      want.push(t);
      const joined = s + t;
      const got = tokens(joined);
      s = got && got.join('|') === want.join('|') ? joined : s + "'" + t;
    }
    return s;
  }

  function guess(word) {
    const units = unitsOf(word);
    if (!units.length) return '';
    return syllables(units).map(spellSyllable).join('-');
  }

  return { LETTERS, KEYS, formsOf, toDuployan, tokens, wordsOf, wordKey, cardDup, guess };
});
