#!/usr/bin/env python3
"""Patch Noto Sans Duployan for Kamloops Wawa-style Chinook.

The font chooses which side of a stroke the OU circle goes on from its
neighbours; next to a curve it follows the curve's direction. Kamloops Wawa
puts it on the angle-rule side instead (e.g. "poos" like "pout"). Rather than
rebuilding the font from source, this appends one final substitution lookup
to the compiled font that swaps the unwanted OU glyph for the one the font
already uses in the reference context.

Each rule says: in context SEQ, draw OU the way it is drawn in context LIKE.
Glyph IDs are discovered by shaping both sequences with HarfBuzz, so the rules
don't depend on the font's internal glyph names.

Usage: python3 scripts/patch_font.py [input.woff2] [output.woff2]
Requires: pip install fonttools uharfbuzz brotli
"""

import io
import sys
import unicodedata
from pathlib import Path

import uharfbuzz as hb
from fontTools.otlLib.builder import buildSingleSubstSubtable
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables import otTables

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'fonts' / 'NotoSansDuployan-Regular.woff2'
DST = ROOT / 'fonts' / 'NotoSansDuployanChinook-Regular.woff2'
FAMILY = 'Noto Sans Duployan Chinook'

# (sequence to fix, sequence whose OU glyph to use instead)
# Not used any more: the cards now use the unpatched Rawnd Musmus Duployan
# (fonts/RawndMusmusDuployan-Regular.woff2). Kept for reference.
RULES = [
    # ('P OU S', 'P OU T'),  # poos: circle on the left, as in pout/poun
]

# Features the new lookup is added to; it runs after every existing lookup
# because it gets the highest lookup index.
FEATURES = ('rlig', 'dist')


def letters(seq):
    return [ord(unicodedata.lookup('DUPLOYAN LETTER ' + n)) for n in seq.split()]


def ou_glyph(hb_font, tt, seq):
    """Return the drawn glyph HarfBuzz uses for the OU in `seq`."""
    names = seq.split()
    buf = hb.Buffer()
    buf.add_codepoints(letters(seq))
    buf.guess_segment_properties()
    hb.shape(hb_font, buf)
    order = tt.getGlyphOrder()
    glyf = tt['glyf']
    drawn = [
        order[info.codepoint]
        for info in buf.glyph_infos
        if info.cluster == names.index('OU') and glyf[order[info.codepoint]].numberOfContours != 0
    ]
    if len(drawn) != 1:
        raise SystemExit(f'expected one drawn OU glyph in {seq!r}, got {drawn}')
    return drawn[0]


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else SRC
    dst = Path(sys.argv[2]) if len(sys.argv) > 2 else DST
    tt = TTFont(src)
    # HarfBuzz reads uncompressed fonts only, so shape from an in-memory copy.
    raw = TTFont(src)
    raw.flavor = None
    buf = io.BytesIO()
    raw.save(buf)
    hb_font = hb.Font(hb.Face(hb.Blob(buf.getvalue())))

    mapping = {}
    for seq, like in RULES:
        old, new = ou_glyph(hb_font, tt, seq), ou_glyph(hb_font, tt, like)
        print(f'{seq}: {old} -> {new} (as in {like})')
        if mapping.get(old, new) != new:
            raise SystemExit(f'conflicting rules for {old}')
        mapping[old] = new

    gsub = tt['GSUB'].table
    lookup = otTables.Lookup()
    lookup.LookupType = 1
    lookup.LookupFlag = 0
    lookup.SubTable = [buildSingleSubstSubtable(mapping)]
    lookup.SubTableCount = 1
    gsub.LookupList.Lookup.append(lookup)
    gsub.LookupList.LookupCount = len(gsub.LookupList.Lookup)
    index = gsub.LookupList.LookupCount - 1
    for record in gsub.FeatureList.FeatureRecord:
        if record.FeatureTag in FEATURES:
            record.Feature.LookupListIndex.append(index)
            record.Feature.LookupCount = len(record.Feature.LookupListIndex)

    name = tt['name']
    for rec in name.names:
        if rec.nameID in (1, 4, 16, 18, 21):
            rec.string = str(rec.toUnicode()).replace('Noto Sans Duployan', FAMILY)
        elif rec.nameID == 6:
            rec.string = str(rec.toUnicode()).replace('NotoSansDuployan', FAMILY.replace(' ', ''))

    tt.flavor = 'woff2' if dst.suffix == '.woff2' else None
    tt.save(dst)
    print(f'wrote {dst}')


if __name__ == '__main__':
    main()
