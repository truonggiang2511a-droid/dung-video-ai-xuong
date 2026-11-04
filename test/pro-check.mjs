// Kiểm 6 luật dựng chuyên nghiệp + kho mẫu mới trên dữ liệu THẬT (Nhà Xinh 3:45): lời chép, voice.wav, cảnh phụ, plan Haiku thật
// + các khoá mới mô phỏng đúng luật (cold_open, chapters, label) để kiểm phần máy làm.
import fs from 'node:fs';
import path from 'node:path';
import { analyze, finalize, writeComposition } from '../lib/pipeline.mjs';
import { tagBrolls } from '../lib/vision.mjs';
const [dir, jobDir] = process.argv.slice(2);
const st = JSON.parse(fs.readFileSync(path.join(jobDir, 'state.json'), 'utf8'));
const plan = JSON.parse(fs.readFileSync(path.join(jobDir, 'plan.json'), 'utf8'));
const job = { dir, genre: 'bds', format: '9:16', words: st.words, media: [{ file: 'aroll.mp4', main: true, dur: 224.87 }, { file: 'b1.mp4', name: 'Đăng tiktok cô thùy 2', dur: 176.45 }, { file: 'b7.mp4', name: 'Đường trước nhà trên cao', dur: 15 }] };
const log = s => console.log('·', s);
await analyze(job, log, () => {});
const cache = path.join(dir, 'parts.json');
if (fs.existsSync(cache)) { const c = JSON.parse(fs.readFileSync(cache, 'utf8')); for (const m of job.media) if (c[m.file]) m.parts = c[m.file]; }
else { await tagBrolls(job, log); fs.writeFileSync(cache, JSON.stringify(Object.fromEntries(job.media.filter(m => m.parts).map(m => [m.file, m.parts])))); }
plan.brolls = [ // ghép theo thứ AI nhìn thấy (như luật mới: label + đổi kiểu vào)
  { kind: 'map', file: 'b1.mp4', start: 17.2, end: 29.7 },
  { file: 'b7.mp4', start: 29.8, dur: 2.6, from: 1, tpl: 'radial', label: 'ĐƯỜNG CÂY XANH' },
  { file: 'b1.mp4', start: 98.6, dur: 2.6, from: 48.5, tpl: 'zoom', label: 'PHÒNG KHÁCH' },
  { file: 'b1.mp4', start: 107.5, dur: 2.4, from: 56.5, tpl: 'push', label: 'BẾP' },
  { file: 'b1.mp4', start: 113, dur: 2.4, from: 64.5, tpl: 'slide' },
  { file: 'b1.mp4', start: 127.4, dur: 2.6, from: 80.5, tpl: 'push', label: 'LÊN LẦU 1' },
  { file: 'b1.mp4', start: 131, dur: 2.6, from: 88.5, tpl: 'radial' },
  { file: 'b1.mp4', start: 159.6, dur: 2.8, from: 112.5, tpl: 'zoom', label: 'SÂN THƯỢNG' },
  { file: 'b1.mp4', start: 169.5, dur: 2.8, from: 136.5, tpl: 'blur' },
  { file: 'b1.mp4', start: 184.4, dur: 2.6, from: 152.5, tpl: 'fade' }];
const W = st.words, at = t => W.find(w => w.s >= t - 0.05);
const price = W.find(w => w.s > 193 && /^3$/.test(w.w));
Object.assign(plan, {
  cold_open: { start: price.s, end: W.find(w => w.s > price.s + 2.2 && /lượng/.test(w.w))?.e ?? price.s + 3, why: 'giá gây tò mò' },
  chapters: [{ start: 17.2, title: 'VỊ TRÍ' }, { start: 87.3, title: 'BÊN TRONG' }, { start: 127.2, title: 'LẦU 1' }, { start: 144.8, title: 'LẦU 2' }, { start: 184.2, title: 'GIÁ BÁN' }],
});
const { T, removed } = finalize(job, plan);
fs.writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify(T, null, 1));
writeComposition(job);
console.log('cắt', Math.round(removed), 's → còn', T.duration, 's · mở đầu', job.coldDur, 's');
const words = (a, b) => job.tlWords.filter(w => w.s >= a && w.s < b).map(w => w.w).join(' ');
console.log('LỜI MỞ ĐẦU:', words(0, job.coldDur));
console.log('LỜI SAU MỞ ĐẦU:', words(job.coldDur, job.coldDur + 4));
for (const c of T.clips.filter(c => ['label', 'fx', 'broll'].includes(c.type))) console.log(c.type.padEnd(6), String(c.start).padStart(6), '+', c.dur, c.tpl, c.props?.text || c.name || '', c.props?.style || '');
// nhịp: khoảng dài nhất không có gì thay đổi
const ev = T.clips.filter(c => ['video', 'broll', 'text', 'label'].includes(c.type)).flatMap(c => [c.start, ...(c.type === 'broll' || c.type === 'label' ? [c.start + c.dur] : []), ...(c.punch || [])]).sort((a, b) => a - b);
let worst = [0, 0];
for (let k = 1; k < ev.length; k++) if (ev[k] - ev[k - 1] > worst[1] - worst[0]) worst = [ev[k - 1], ev[k]];
console.log('punch:', T.clips.filter(c => c.punch).reduce((n, c) => n + c.punch.length, 0), '· khoảng không đổi dài nhất', (worst[1] - worst[0]).toFixed(2), 's tại', worst[0]);
