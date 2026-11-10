// Minimal CODE128 (subset B) encoder. The dashboard renders its barcodes with
// JsBarcode (format CODE128); there is no such package in the app, so the same
// symbology is encoded here. Receipt barcodes are plain "FT000001"-style ASCII,
// which subset B covers completely.

const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];
const START_B = 104;
const STOP = 106;

/** Alternating bar/space widths (in modules), starting with a bar. */
export function code128Widths(value: string): number[] | null {
  const text = value.trim();
  if (!text) return null;
  const codes: number[] = [START_B];
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    if (c < 32 || c > 126) return null;
    codes.push(c - 32);
  }
  let sum = START_B;
  for (let i = 1; i < codes.length; i++) sum += codes[i] * i;
  codes.push(sum % 103, STOP);
  return codes.flatMap((v) => PATTERNS[v].split('').map(Number));
}

export interface Bar { x: number; w: number }

/** Bar rectangles plus the total width in modules (incl. a 10-module quiet zone each side). */
export function code128Bars(value: string): { bars: Bar[]; width: number } | null {
  const widths = code128Widths(value);
  if (!widths) return null;
  const quiet = 10;
  const bars: Bar[] = [];
  let x = quiet;
  widths.forEach((w, i) => {
    if (i % 2 === 0) bars.push({ x, w });
    x += w;
  });
  return { bars, width: x + quiet };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Standalone SVG markup (used by the print sheet): bars with the value printed beneath. */
export function code128Svg(value: string, style = ''): string {
  const enc = code128Bars(value);
  if (!enc) return '';
  const h = 55;
  const rects = enc.bars.map((b) => `<rect x="${b.x}" y="0" width="${b.w}" height="${h}" fill="#000"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${enc.width} ${h + 12}" preserveAspectRatio="xMidYMid meet" style="${style}">`
    + `<rect width="${enc.width}" height="${h + 12}" fill="#fff"/>${rects}`
    + `<text x="${enc.width / 2}" y="${h + 9}" font-family="monospace" font-size="9" text-anchor="middle" fill="#000">${esc(value)}</text></svg>`;
}
