// KIỂM DUYỆT CHẤT LƯỢNG — thang 100 điểm theo MASTER EDITING RULES V1.0 mục VIII (docs/MASTER-RULES-V1.md).
// Máy ĐO THẬT trên timeline + file (không để AI tự chấm cho mình): mỗi mục có điểm + ghi chú lỗi cụ thể bằng tiếng Việt.
// qcTimeline: chạy ngay sau khi dựng (mục 10 “xuất” = 0 tới khi có MP4) · qcExport: đo out.mp4 (khung đen, hình đứng, âm lượng, thời lượng).
// “Điểm số chỉ là công cụ kiểm soát, không thay thế việc xem video thực tế.”
import fs from 'node:fs';
import path from 'node:path';
import { run } from './run.mjs';

const r1 = n => Math.round(n * 10) / 10;
export const LEVEL = s => (s >= 95 ? 'Xuất sắc' : s >= 90 ? 'Chuyên nghiệp' : s >= 80 ? 'Tốt' : s >= 70 ? 'Cần hoàn thiện' : 'Phải chỉnh sửa');

async function loud(file) { // tích hợp LUFS + đỉnh thật
  try {
    const { err } = await run('ffmpeg', ['-nostats', '-i', file, '-vn', '-af', 'ebur128=peak=true', '-f', 'null', '-']);
    const I = +(err.match(/I:\s+(-?[\d.]+) LUFS/g) || []).pop()?.match(/-?[\d.]+/)[0];
    const P = +(err.match(/Peak:\s+(-?[\d.]+) dBFS/g) || []).pop()?.match(/-?[\d.]+/)[0];
    return { I: isFinite(I) ? I : null, P: isFinite(P) ? P : null };
  } catch { return { I: null, P: null }; }
}

export async function qcTimeline(job, T, p = {}) {
  const S = job.styleInfo || {}, D = T.duration, items = [];
  const add = (k, name, max, got, notes) => items.push({ k, name, max, got: r1(Math.max(0, Math.min(max, got))), notes: notes.filter(Boolean) });
  const C = t => T.clips.filter(c => c.type === t);
  const texts = T.clips.filter(c => c.type === 'text' && !['cta', 'cta-follow', 'hook-band'].includes(c.tpl));
  const st = job.story || {};

  // 1. Nội dung & storytelling (15)
  { let g = 0; const n = [];
    if (st.summary) g += 4; else n.push('AI chưa tóm được ý chính video');
    if ((st.parts || []).length >= 3) g += 5; else n.push('kịch bản dựng dưới 3 phần');
    if (C('label').some(c => /^\d\d$/.test(c.props?.kicker || '')) || D < 45) g += 3; else n.push('video dài nhưng chưa có thẻ chương');
    if (T.clips.some(c => c.tpl === 'cta' || c.tpl === 'cta-follow')) g += 3; else n.push('thiếu câu kêu gọi cuối video');
    add('story', 'Nội dung & kể chuyện', 15, g, n); }

  // 2. Hook & giữ chân (10)
  { let g = 0; const n = [];
    const hook = T.clips.find(c => c.id === 'hook');
    if (hook && hook.start < 0.5) g += 5; else n.push('không có tiêu đề hook trong 0,5 s đầu');
    if (job.coldDur || !S.coldOpen || D < 20) g += 3; else n.push('chưa đưa câu hấp dẫn nhất lên đầu (cold open)');
    const firstChange = Math.min(...T.clips.filter(c => ['text', 'broll', 'label', 'fx'].includes(c.type)).map(c => c.start), 99);
    if (firstChange <= 1.5) g += 2; else n.push(`giây đầu chưa có chuyển động (thay đổi đầu tiên ở ${r1(firstChange)} s)`);
    add('hook', 'Hook & giữ chân', 10, g, n); }

  // 3. Cắt dựng & nhịp (15)
  { let g = 0; const n = [];
    const inSeg = (a, b) => (job.segs || []).filter(s => !s.cold && s.src < b && s.end > a).reduce((t, s) => t + Math.min(b, s.end) - Math.max(a, s.src), 0);
    const maxPause = Math.max(0, ...(job.silences || []).map(([a, b]) => inSeg(a, b)));
    const allow = (S.pauseKeep || 0.25) + 0.2;
    if (maxPause <= allow) g += 5; else n.push(`còn chỗ im lặng ${r1(maxPause)} s (cho phép ${r1(allow)} s)`);
    const W = job.words || []; let gap = 0;
    for (let i = 0; i + 1 < W.length; i++) { const a = W[i].e - W[i].s > 1.2 ? W[i].s + 0.5 : W[i].e; if (W[i + 1].s - a > 0.6) gap = Math.max(gap, inSeg(a, W[i + 1].s)); }
    if (gap <= 0.55) g += 4; else n.push(`còn khoảng không có lời ${r1(gap)} s`);
    const ev = T.clips.filter(c => ['video', 'broll', 'text', 'label'].includes(c.type)).flatMap(c => [c.start, ...(c.type === 'broll' || c.type === 'label' ? [c.start + c.dur] : []), ...(c.punch || [])]).sort((a, b) => a - b);
    let still = 0; for (let k = 1; k < ev.length; k++) still = Math.max(still, ev[k] - ev[k - 1]);
    const lim = (S.pace?.punchGap ?? 4) >= 60 ? 12 : (S.pace?.punchGap ?? 4) + 1.5;
    if (still <= lim) g += 4; else n.push(`có đoạn ${r1(still)} s màn hình không đổi gì (phong cách cho phép ~${r1(lim)} s)`);
    const hint = job.retakeGuess || [], dropped = job.drops || [];
    if (!hint.length || hint.every(h => dropped.some(d => d.why === 'noi_lai'))) g += 2; else n.push('máy thấy đoạn nói lại nhưng chưa bỏ');
    add('cut', 'Cắt dựng & nhịp', 15, g, n); }

  // 4. Hình ảnh & bố cục (10)
  { let g = 10; const n = [];
    const over = []; // 2 chữ lớn cùng lúc (luật “1 chữ lớn mỗi lúc”)
    const big = T.clips.filter(c => c.type === 'text' && c.tpl !== 'cta' && c.tpl !== 'cta-follow');
    for (let i = 0; i < big.length; i++) for (let j = i + 1; j < big.length; j++) if (big[i].start < big[j].start + big[j].dur - 0.05 && big[j].start < big[i].start + big[i].dur - 0.05) over.push(`${big[i].id}/${big[j].id}`);
    if (over.length) { g -= 5; n.push(`${over.length} chỗ 2 chữ lớn hiện cùng lúc`); }
    const longT = texts.filter(c => String(c.props?.text || '').replace(/\*/g, '').split(/\s+/).length > 6);
    if (longT.length) { g -= Math.min(5, longT.length); n.push(`${longT.length} chữ điểm nhấn quá dài (> 6 từ) khó đọc trên điện thoại`); }
    add('layout', 'Hình ảnh & bố cục', 10, g, n); }

  // 5. B-roll & liên quan (10)
  { let g = 0; const n = [];
    const have = job.media.filter(m => !m.main), used = new Set(C('broll').map(c => c.src.replace('media/', '')));
    if (!have.length) { g += 4; n.push('khách không gửi cảnh phụ'); }
    else { const r = used.size / have.length; g += r >= 0.8 ? 4 : r >= 0.5 ? 2 : 0; if (r < 0.8) n.push(`mới dùng ${used.size}/${have.length} cảnh phụ khách gửi`); }
    const per = C('broll').length / Math.max(1, D / (S.pace?.brollEvery || 8));
    if (!have.length || per >= 0.6) g += 3; else n.push(`ít cảnh phụ so với phong cách (${C('broll').length} cảnh / ${Math.round(D)} s)`);
    const reuse = {}; for (const c of C('broll')) { const k = c.src + '@' + Math.round(c.mediaStart); reuse[k] = (reuse[k] || 0) + 1; }
    if (Object.values(reuse).every(x => x <= 1)) g += 1; else n.push('1 đoạn cảnh phụ bị dùng lặp');
    const miss = st.missing || [];
    if (!miss.length) g += 2; else n.push(`thiếu cảnh quay: ${miss.map(m => m.need).join(', ')}`);
    add('broll', 'Cảnh phụ & liên quan', 10, g, n); }

  // 6. Chữ & phụ đề (10)
  { let g = 0; const n = [];
    const said = (job.tlWords || []).length, shown = C('subs').reduce((t, c) => t + (c.props?.words?.length || 0), 0);
    if (T.subs?.hide) { g += 4; n.push('khách đã tắt phụ đề'); } else if (!said || shown / said >= 0.95) g += 4; else n.push(`phụ đề mới phủ ${Math.round(shown / said * 100)} % lời nói`);
    if (C('subs').some(c => c.props?.words?.some(w => w.hl))) g += 2; else n.push('phụ đề chưa tô cụm từ khoá');
    const want = D / (S.pace?.textEvery || 5);
    if (texts.length >= want * 0.6) g += 2; else n.push(`ít chữ điểm nhấn (${texts.length}, phong cách cần ~${Math.round(want)})`);
    const lone = texts.filter(c => /\*[^*\s]+\*/.test(c.props?.text || '') && String(c.props.text).replace(/\*/g, '').split(/\s+/).length >= 3);
    if (!lone.length) g += 2; else n.push(`${lone.length} chữ chỉ tô 1 tiếng lẻ (nên tô cả cụm có nghĩa)`);
    add('type', 'Chữ & phụ đề', 10, g, n); }

  // 7. Đồ hoạ chuyển động (10)
  { let g = 0; const n = [];
    const kinds = new Set(texts.map(c => c.tpl)); if (kinds.size >= 2 || texts.length < 3) g += 3; else n.push('chữ điểm nhấn chỉ 1 kiểu');
    const tr = new Set(C('broll').map(c => c.tpl)); if (tr.size >= Math.min(3, (S.transitions || []).length, C('broll').length)) g += 3; else n.push('chuyển cảnh lặp 1 kiểu');
    if (C('label').length || D < 30) g += 2; else n.push('chưa có nhãn / thẻ chương');
    if (texts.length / Math.max(1, D / 60) <= 16) g += 2; else n.push('chữ động quá dày (lạm dụng)');
    add('motion', 'Đồ hoạ chuyển động', 10, g, n); }

  // 8. Âm thanh (10)
  { let g = 0; const n = [];
    const L = await loud(path.join(job.dir, 'media', job.media.find(m => m.main)?.file || 'aroll.mp4'));
    if (L.I == null) n.push('không đo được âm lượng giọng');
    else if (L.I >= -17 && L.I <= -11) g += 4; else n.push(`giọng ${r1(L.I)} LUFS (chuẩn mạng xã hội −14)`);
    if (L.P != null && L.P <= -0.5) g += 2; else if (L.P != null) n.push(`đỉnh tiếng ${r1(L.P)} dB dễ rè`);
    const sfx = C('sfx').length / Math.max(1, D / 60), cap = { hi: 30, mid: 22, lo: 10, min: 5 }[S.sfx] ?? 22;
    if (T.sfx?.off || sfx <= cap) g += 2; else n.push(`âm thanh nhấn dày (${Math.round(sfx)}/phút)`);
    n.push('chưa có nhạc nền (chờ chọn nguồn nhạc có bản quyền)');
    add('sound', 'Âm thanh', 10, g, n); }

  // 9. Màu (5)
  { let g = 0; const n = []; const gr = T.grade || {};
    if (!gr.off) g += 3; else n.push('đang tắt chỉnh màu');
    if ((+gr.sat || 1) <= 1.25 && (+gr.bri || 1) <= 1.2) g += 2; else n.push('bão hoà / độ sáng đẩy quá mức');
    add('color', 'Màu', 5, g, n); }

  // 10. Kỹ thuật xuất (5) — cập nhật sau khi xuất
  add('export', 'Xuất & kiểm duyệt', 5, 0, ['chưa xuất MP4 — điểm mục này có sau khi xuất']);
  return summarize(items);
}

function summarize(items) {
  const score = Math.round(items.reduce((t, x) => t + x.got, 0));
  return { score, level: LEVEL(score), items, t: Date.now() };
}

// đo file MP4 đã xuất: thời lượng, có tiếng, khung đen, hình đứng, âm lượng
export async function qcExport(job, T, qc) {
  const f = path.join(job.dir, 'out.mp4'), n = [];
  let g = 0;
  if (!fs.existsSync(f)) return qc;
  try {
    const { out } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', f]);
    const j = JSON.parse(out), dur = +j.format.duration;
    if (Math.abs(dur - T.duration) <= 0.25) g += 1; else n.push(`thời lượng xuất ${r1(dur)} s khác timeline ${r1(T.duration)} s`);
    if (j.streams.some(s => s.codec_type === 'audio')) g += 0.5; else n.push('file xuất không có tiếng');
  } catch { n.push('không đọc được file xuất'); }
  try {
    const { err } = await run('ffmpeg', ['-nostats', '-i', f, '-vf', 'scale=270:-2,blackdetect=d=0.4:pix_th=0.06,freezedetect=n=-55dB:d=2.5', '-an', '-f', 'null', '-']);
    const blacks = (err.match(/black_start/g) || []).length, freezes = (err.match(/freeze_start/g) || []).length;
    if (!blacks) g += 1.5; else n.push(`${blacks} chỗ khung hình đen`);
    if (!freezes) g += 1; else n.push(`${freezes} chỗ hình đứng > 2,5 s`);
  } catch { n.push('không quét được khung hình'); }
  const L = await loud(f);
  if (L.I != null && L.I >= -17 && L.I <= -10) g += 1; else n.push(`âm lượng file xuất ${L.I == null ? '?' : r1(L.I)} LUFS`);
  const items = qc.items.map(x => (x.k === 'export' ? { ...x, got: r1(Math.min(5, g)), notes: n } : x));
  return summarize(items);
}
