// Dựng lại timeline của 1 job THẬT (state.json + plan.json lấy từ laptop) bằng code hiện tại — không cần file video.
// node test/sim-job.mjs <thư mục job thật> <thư mục ra> [slow]  (slow = giả lập cảnh phụ quay chậm k lần, vd 1.6667 cho 50 khung/s)
import fs from 'node:fs';
import path from 'node:path';
import { finalize, writeComposition } from '../lib/pipeline.mjs';
const [src, out, slow] = process.argv.slice(2);
const st = JSON.parse(fs.readFileSync(path.join(src, 'state.json'), 'utf8'));
const plan = JSON.parse(fs.readFileSync(path.join(src, 'plan.json'), 'utf8'));
fs.mkdirSync(out, { recursive: true });
const job = { ...st, dir: out, styleInfo: null };
const k = +slow || 1;
if (k > 1) {
  for (const m of job.media) if (!m.main) { m.slow = k; m.dur = Math.round(m.dur * k * 100) / 100; m.parts = (m.parts || []).map(p => ({ ...p, from: p.from * k, to: p.to * k })); }
  for (const b of plan.brolls || []) if (b.from != null) b.from = b.from * k;
}
const { T } = finalize(job, plan);
fs.writeFileSync(path.join(out, 'timeline.json'), JSON.stringify(T, null, 1));
writeComposition(job);
const C = t => T.clips.filter(c => c.type === t);
const st2 = a => a.length ? `${Math.min(...a).toFixed(1)}–${Math.max(...a).toFixed(1)} s (tb ${(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1)})` : '—';
console.log('phong cách', T.style, '· dài', T.duration, 's');
console.log('cảnh phụ', C('broll').length, '/', job.media.filter(m => !m.main).length, 'file ·', st2(C('broll').filter(c => c.kind !== 'map').map(c => c.dur)), '· kiểu', [...new Set(C('broll').map(c => c.tpl))].join('/'),
  '· phủ', Math.round(C('broll').reduce((a, c) => a + c.dur, 0) / T.duration * 100) + '%');
console.log('chữ nhấn', C('text').filter(c => !/^cta|hook/.test(c.tpl)).length, '·', st2(C('text').filter(c => !/^cta|hook/.test(c.tpl)).map(c => c.dur)));
const by = {}; for (const c of C('sfx')) { const n = path.basename(c.src, '.wav').replace(/\d$/, ''); by[n] = (by[n] || 0) + 1; }
console.log('âm thanh', C('sfx').length, `(${(C('sfx').length / (T.duration / 60)).toFixed(0)}/phút)`, JSON.stringify(by));
const tt = C('text').sort((a, b) => a.start - b.start); let ov = 0;
for (let i = 1; i < tt.length; i++) if (tt[i].start < tt[i - 1].start + tt[i - 1].dur - 0.01) ov++;
console.log('chữ chồng nhau', ov);
