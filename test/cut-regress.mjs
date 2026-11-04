// BÀI KIỂM TRA CẮT THOẠI — mỗi lỗi cắt sai Giang báo được lưu thành 1 file trong test/loi-cat/ (lời chép thật + kết quả đúng).
// Chạy: node test/cut-regress.mjs   → phải ra toàn ✅ trước khi chép code lên laptop.
// Thêm lỗi mới: lấy state.json của job lỗi → node test/cut-regress.mjs --add <state.json> <tên> "<ghi chú>" "<câu bỏ, vd 5-11>"
import fs from 'node:fs';
import path from 'node:path';
import { retakeGuess, finalize, localPlan, sentencesOf } from '../lib/pipeline.mjs';
import { parseLoose } from '../lib/ai.mjs';
const DIR = path.join(import.meta.dirname, 'loi-cat');
if (process.argv[2] === '--add') {
  const [, , , f, name, note, rt] = process.argv, s = JSON.parse(fs.readFileSync(f, 'utf8'));
  const retakes = String(rt || '').split(',').filter(Boolean).map(x => x.split('-').map(Number));
  fs.writeFileSync(path.join(DIR, name + '.json'), JSON.stringify({ note, expect: { retakes, keepAll: true }, words: s.words, sentences: s.sentences.map(({ i, start, end, text, n }) => ({ i, start, end, text, n })) }));
  console.log('đã lưu', name); process.exit(0);
}
let bad = 0;
const ok = (c, msg) => { console.log(c ? '✅' : '❌', msg); if (!c) bad++; };
for (const f of fs.readdirSync(DIR).filter(f => f.endsWith('.json'))) {
  const t = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')), ss = t.sentences;
  console.log(`\n— ${f}: ${t.note}`);
  const got = retakeGuess(ss).map(d => [d.from, d.to]);
  ok(JSON.stringify(got) === JSON.stringify(t.expect.retakes), `bắt đoạn nói lại: ${JSON.stringify(got)} (đúng: ${JSON.stringify(t.expect.retakes)})`);
  // cắt hết quy trình như khi AI lỗi (không cần âm thanh: không có khoảng lặng)
  const end = ss[ss.length - 1].end + 1;
  const job = { dir: '/tmp', genre: 'bds', format: '9:16', words: t.words, sentences: ss, autoDrops: [], fillCuts: [], silences: [], mumbleCuts: [], media: [{ file: 'aroll.mp4', main: true, dur: end }] };
  const p = localPlan({ sentences: ss, auto_cut: [], brolls: [], cta_default: 'X' });
  p.drop = retakeGuess(ss);
  finalize(job, p);
  const inDrop = w => job.drops.some(d => w.s >= d.a - 0.05 && w.e <= d.b + 0.05);
  const kept = w => job.segs.some(g => w.s + 0.05 >= g.src && w.s + 0.05 <= g.end);
  const lost = t.words.filter(w => !inDrop(w) && !kept(w));
  if (t.expect.keepAll) ok(!lost.length, `không mất chữ ngoài đoạn bỏ${lost.length ? ': ' + lost.slice(0, 8).map(w => `${w.w}@${w.s.toFixed(1)}`).join(' ') : ''}`);
  for (const [a, b] of t.expect.retakes) { const sa = ss[a].start, sb = ss[b].end; ok(job.drops.some(d => d.a <= sa + 0.3 && d.b >= sb - 0.3), `đoạn câu ${a}–${b} (${sa.toFixed(1)}–${sb.toFixed(1)} s) đã bị bỏ`); }
}
console.log('\n— AI trả JSON hỏng vẫn dùng được');
const p1 = parseLoose('{"drop":[{"from":5,"to":11,"why":"noi_lai","note":"sau câu "lại nha" nói lại"}],"texts":[{"tpl":"key-pop","start":3,"text":"A",}],"cta":"X"}', ['drop', 'texts'], ['hook']);
ok(p1.drop?.[0]?.to === 11 && p1.texts.length === 1, 'dấu " trong chuỗi + phẩy thừa → sửa được');
const p2 = parseLoose('{"drop":[{"from":5,"to":11,"why":"noi_lai"}],"texts":[{"tpl":"a" "start":3},{"tpl":"b","start":4}],"cta":"X"}', ['drop', 'texts'], []);
ok(p2.drop?.length === 1 && p2.texts.length === 1, 'hỏng nặng → nhặt từng mục, vẫn giữ đoạn bỏ');
console.log(bad ? `\n❌ ${bad} lỗi — KHÔNG chép lên laptop` : '\n✅ Tất cả đạt');
process.exit(bad ? 1 : 0);
