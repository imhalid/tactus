// Renders every sound offline in real Chromium, writes WAVs and prints an audio QA table.
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';

const out = build_out();
function build_out() { mkdirSync('renders', { recursive: true }); return 'renders'; }

const bundle = await build({
  stdin: { contents: `import { createEngine, builtinSounds, themes } from './src/index.ts'; window.T = { createEngine, names: Object.keys(builtinSounds), themes: Object.keys(themes) };`, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, format: 'iife', write: false,
});
const code = bundle.outputFiles[0].text;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setContent('<html></html>');
await page.addScriptTag({ content: code });

const themes = await page.evaluate(() => window.T.themes);
const names = await page.evaluate(() => window.T.names);
const SR = 48000;

function fft(re, im) { // in-place radix-2
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) {
      const ur = re[i+k], ui = im[i+k], vr = re[i+k+len/2]*cr - im[i+k+len/2]*ci, vi = re[i+k+len/2]*ci + im[i+k+len/2]*cr;
      re[i+k] = ur+vr; im[i+k] = ui+vi; re[i+k+len/2] = ur-vr; im[i+k+len/2] = ui-vi;
      [cr, ci] = [cr*wr - ci*wi, cr*wi + ci*wr]; } }
  }
}
function centroid(x) {
  const n = 8192, re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < Math.min(n, x.length); i++) re[i] = x[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / n));
  fft(re, im);
  let num = 0, den = 0, hi = 0, tot = 0;
  for (let k = 1; k < n / 2; k++) { const f = k * SR / n, m = re[k]**2 + im[k]**2; num += f*m; den += m; tot += m; if (f > 6000) hi += m; }
  return { centroid: num / den, hiRatio: hi / tot };
}
function wav(l, r) {
  const n = l.length, buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n*4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR*4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n*4, 40);
  for (let i = 0; i < n; i++) { buf.writeInt16LE(Math.max(-1, Math.min(1, l[i])) * 32767 | 0, 44 + i*4); buf.writeInt16LE(Math.max(-1, Math.min(1, r[i])) * 32767 | 0, 46 + i*4); }
  return buf;
}

const rows = [];
for (const theme of themes) {
  for (const name of names) {
    const data = await page.evaluate(async ({ theme, name, SR }) => {
      const oc = new OfflineAudioContext(2, SR * 1.8, SR);
      const eng = window.T.createEngine({ context: oc, theme, persist: false, humanize: 0, spatial: 0 });
      eng.play(name, { value: 0.5 });
      const b = await oc.startRendering();
      return [Array.from(b.getChannelData(0)), Array.from(b.getChannelData(1))];
    }, { theme, name, SR });
    const [l, r] = data;
    let peak = 0, sq = 0, last = 0;
    for (let i = 0; i < l.length; i++) { const a = Math.abs(l[i]); if (a > peak) peak = a; sq += l[i]*l[i]; if (a > 0.0015) last = i; }
    const c = centroid(l.slice(Math.floor(0.004*SR)));
    const firstSample = Math.abs(l[0]);
    const tailEnd = Math.max(...l.slice(-2000).map(Math.abs));
    rows.push({ theme, name, peakdB: 20*Math.log10(peak||1e-9), rmsdB: 10*Math.log10(sq/l.length||1e-12), lenMs: Math.round(last/SR*1000), centroid: Math.round(c.centroid), hi6k: +(c.hiRatio*100).toFixed(2), start: firstSample, tail: tailEnd });
    writeFileSync(`${out}/${theme}-${name}.wav`, wav(l, r));
  }
}
await browser.close();

console.log('theme   sound        peak dB  rms dB  len ms  centroid  >6k %   start  tail');
let problems = 0;
for (const r of rows) {
  const warn = [];
  if (r.peakdB > -6) warn.push('LOUD');
  if (r.peakdB < -40) warn.push('SILENT');
  if (r.start > 0.01) warn.push('CLICK-START');
  if (r.tail > 0.002) warn.push('CUT-TAIL');
  if (r.centroid > 4500) warn.push('BRIGHT');
  if (warn.length) problems++;
  console.log(`${r.theme.padEnd(8)}${r.name.padEnd(12)} ${r.peakdB.toFixed(1).padStart(7)} ${r.rmsdB.toFixed(1).padStart(7)} ${String(r.lenMs).padStart(7)} ${String(r.centroid).padStart(8)} ${String(r.hi6k).padStart(7)}  ${r.start.toFixed(4)} ${r.tail.toFixed(4)} ${warn.join(',')}`);
}
console.log(`\n${rows.length} renders, ${problems} flagged`);
