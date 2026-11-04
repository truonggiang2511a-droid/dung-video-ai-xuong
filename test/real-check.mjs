// Kiểm luật cắt + AI nhìn cảnh phụ trên dữ liệu THẬT của laptop (lời chép + voice.wav + vài cảnh phụ)
import fs from 'node:fs';
import { analyze } from '../lib/pipeline.mjs';
import { tagBrolls } from '../lib/vision.mjs';
const dir = process.argv[2], st = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const job = { dir, genre: 'bds', words: st.words, media: [{ file: 'aroll.mp4', main: true, dur: 224.87 }, { file: 'b1.mp4', name: 'Đăng tiktok cô thùy 2', dur: 176.45 }, { file: 'b7.mp4', name: 'Đường trước nhà trên cao', dur: 15 }] };
const log = s => console.log('·', s);
await analyze(job, log, () => {});
console.log('mumble cuts:', job.mumbleCuts.map(([a, b]) => `${a.toFixed(2)}–${b.toFixed(2)}`).join(', '));
console.log('silences:', job.silences.length, 'tổng', job.silences.reduce((t, [a, b]) => t + b - a, 0).toFixed(1), 's');
await tagBrolls(job, log);
for (const m of job.media.filter(m => !m.main)) { console.log('==', m.name); for (const p of m.parts) console.log(`  ${p.from}-${p.to}: ${p.thay}`); }
