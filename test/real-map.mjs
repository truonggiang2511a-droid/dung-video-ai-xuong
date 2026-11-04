// Kiểm bản đồ theo lời nói trên dữ liệu thật: lời chép + voice.wav + cảnh phụ thật + plan.json Haiku thật của laptop
import fs from 'node:fs';
import { analyze, finalize } from '../lib/pipeline.mjs';
import { tagBrolls } from '../lib/vision.mjs';
const [dir, stF, planF, briefF] = process.argv.slice(2);
const st = JSON.parse(fs.readFileSync(stF, 'utf8')), plan = JSON.parse(fs.readFileSync(planF, 'utf8')), brief = JSON.parse(fs.readFileSync(briefF, 'utf8'));
const job = { dir, genre: 'bds', format: '9:16', words: st.words, media: [{ file: 'aroll.mp4', main: true, dur: 224.87 }, ...brief.brolls.filter(b => ['b1.mp4', 'b7.mp4'].includes(b.file)).map(b => ({ file: b.file, name: b.name, dur: b.dur }))] };
const log = s => console.log('·', s);
await analyze(job, log, () => {});
await tagBrolls(job, log);
plan.brolls = plan.brolls.filter(b => ['b1.mp4', 'b7.mp4'].includes(b.file));
const { T, removed } = finalize(job, plan);
console.log('cắt bỏ', Math.round(removed), 's → còn', T.duration, 's');
for (const c of T.clips.filter(c => c.type === 'broll')) console.log('B', c.start, '+', c.dur, c.name, 'từ', c.mediaStart, c.kind || '');
const words = (a, b) => job.tlWords.filter(w => w.s >= a && w.s < b).map(w => w.w).join(' ');
const m = T.clips.find(c => c.kind === 'map');
if (m) console.log('LỜI LÚC BẢN ĐỒ:', words(m.start, m.start + m.dur));
