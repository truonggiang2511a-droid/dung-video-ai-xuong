// AI NHÌN CẢNH PHỤ: mỗi cảnh (cảnh dài thì từng đoạn 8 giây) → 1 ảnh ghép 3 khung → /api/vision của app
// (Workers AI, miễn phí, nhãn tiếng Việt) → AI dựng ghép cảnh theo THỨ NHÌN THẤY, không chỉ theo tên file (“DJI 0541” chẳng nói gì)
import fs from 'node:fs';
import path from 'node:path';
import { run } from './run.mjs';
import { getJson, putJson } from './cache.mjs';
const APP_URL = process.env.APP_URL || 'https://dung-video-ai.truonggiang2511a.workers.dev';

const r1 = n => Math.round(n * 10) / 10;

// TÁCH CẢNH: đọc khung khoá (file đã đổi có khung khoá mỗi 1 s → rất nhanh: cảnh 176 s mất ~4 s) tìm chỗ đổi cảnh thật,
// đoạn < 2 s gộp vào bên cạnh, đoạn dài chia ≤ maxLen s (máy quay đi liên tục qua nhiều phòng không có chỗ cắt).
async function sceneCuts(file) {
  try {
    const { err, out } = await run('ffmpeg', ['-v', 'error', '-skip_frame', 'nokey', '-i', file, '-vf', "scale=192:-2,select='gt(scene,0.28)',metadata=print:file=-", '-an', '-fps_mode', 'passthrough', '-f', 'null', '-']);
    return [...String(out || '').concat(err || '').matchAll(/pts_time:([\d.]+)/g)].map(m => +m[1]);
  } catch { return []; }
}
export async function partsOf(file, dur, maxLen = 8, maxParts = 24) {
  if (dur <= 6) return [{ from: r1(Math.min(0.3, dur / 4)), to: r1(Math.max(0.5, dur - 0.3)) }];
  const cuts = (await sceneCuts(file)).filter(t => t > 1 && t < dur - 1);
  let b = [0.3, ...cuts, dur - 0.3];
  for (let k = 1; k < b.length - 1; k++) if (b[k] - b[k - 1] < 2) { b.splice(k, 1); k--; }
  if (b.length > 2 && b[b.length - 1] - b[b.length - 2] < 2) b.splice(b.length - 2, 1);
  const len = Math.max(maxLen, dur / maxParts);
  const out = [];
  for (let k = 0; k + 1 < b.length; k++) {
    const a = b[k], e = b[k + 1], n = Math.ceil((e - a) / len - 0.15);
    for (let j = 0; j < n; j++) out.push({ from: r1(a + (e - a) * j / n), to: r1(a + (e - a) * (j + 1) / n), ...(j === 0 && k > 0 ? { cut: true } : {}) });
  }
  return out.slice(0, maxParts + 6);
}

async function sheet(file, p, out) {
  const len = Math.max(0.5, p.to - p.from);
  await run('ffmpeg', ['-y', '-v', 'error', '-skip_frame', 'nokey', '-ss', String(p.from), '-t', String(len), '-i', file,
    '-vf', `fps=${(3 / len).toFixed(4)},scale=240:-2,tile=3x1`, '-frames:v', '1', '-q:v', '6', out]);
  const b = fs.readFileSync(out);
  return b.length < 210000 ? 'data:image/jpeg;base64,' + b.toString('base64') : null;
}

async function look(job, items, log) {
  let ok = 0;
  const batches = [];
  for (let i = 0; i < items.length; i += 8) batches.push(items.slice(i, i + 8));
  await Promise.all(batches.map(async b => {
    for (let t = 0; t < 2; t++) {
      try {
        const r = await fetch(`${APP_URL}/api/vision`, { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ genre: job.genre, items: b.map(({ id, img }) => ({ id, img })) }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || r.status);
        for (const it of b) {
          const tg = j.tags?.[it.id];
          if (tg) { const pt = it.m.parts[it.k]; pt.thay = [tg.nhan, ...(tg.tu_khoa || [])].filter(Boolean).join(', '); pt.map = /bản đồ|vệ tinh|lộ trình|địa hình|vị trí địa lý|sơ đồ/.test(pt.thay); ok++; }
        }
        return;
      } catch (e) { if (t) log(`AI nhìn cảnh lỗi 1 nhóm: ${e.message}`); await new Promise(r => setTimeout(r, 1200)); }
    }
  }));
  return ok;
}
// đoạn liền nhau cùng nhãn chính → gộp (vd 2 đoạn “nhà vệ sinh” 64–80 s thành 1)
function mergeSame(parts, maxLen = 24) {
  const out = [];
  for (const p of parts) {
    const l = out[out.length - 1], k = x => String(x.thay || '').split(',')[0].trim();
    if (l && k(l) && k(l) === k(p) && !p.cut && p.to - l.from <= maxLen && !!l.map === !!p.map) { l.to = p.to; l.thay = [...new Set([...l.thay.split(', '), ...p.thay.split(', ')])].slice(0, 10).join(', '); }
    else out.push({ ...p });
  }
  return out;
}
async function tagList(job, list, log, { maxLen, maxParts, tag }) {
  const dir = path.join(job.dir, 'sheets');
  fs.mkdirSync(dir, { recursive: true });
  const items = [], fresh = [];
  for (const m of list) {
    // nhãn cảnh nhớ theo GIỜ GỐC; cảnh phụ quay chậm k lần → giờ trong file = giờ gốc × k
    const k = m.slow || 1, c = m.key && getJson(m.key, `${tag}-${job.genre}`);
    if (c) { m.parts = c.map(p => ({ ...p, from: Math.round(p.from * k * 100) / 100, to: Math.round(p.to * k * 100) / 100 })); continue; }
    m.parts = await partsOf(path.join(job.dir, 'media', m.file), m.dur, maxLen * k, maxParts);
    fresh.push(m);
    for (let k = 0; k < m.parts.length; k++) {
      const img = await sheet(path.join(job.dir, 'media', m.file), m.parts[k], path.join(dir, `${m.file}-${k}.jpg`)).catch(() => null);
      if (img) items.push({ id: `${m.file}#${k}`, img, m, k });
    }
  }
  const ok = items.length ? await look(job, items, log) : 0;
  for (const m of fresh) { m.parts = mergeSame(m.parts); const k = m.slow || 1;
    if (m.key && m.parts.some(p => p.thay)) putJson(m.key, `${tag}-${job.genre}`, m.parts.map(p => ({ ...p, from: Math.round(p.from / k * 100) / 100, to: Math.round(p.to / k * 100) / 100 }))); }
  return { ok, n: items.length, reused: list.length - fresh.length };
}
// AI NHÌN VIDEO CHÍNH: biết lúc nào người nói đứng ở đâu / đang khoe gì → đối chiếu lời nói với hình (brief.main_scenes)
export async function tagMain(job, log) {
  const m = job.media.find(x => x.main);
  if (!m) return;
  const r = await tagList(job, [m], log, { maxLen: 10, maxParts: 30, tag: 'main' });
  const seen = [...new Set(m.parts.map(p => (p.thay || '').split(',')[0]).filter(Boolean))];
  log(`AI xem video chính${r.reused ? ' (nhớ từ lần trước)' : ''}: ${m.parts.length} cảnh — ${seen.slice(0, 6).join(' / ') || '—'}`);
}
export async function tagBrolls(job, log, live) {
  const list = job.media.filter(m => !m.main);
  if (!list.length) return;
  live && live({ phase: 'vision' });
  const r = await tagList(job, list, log, { maxLen: 8, maxParts: 24, tag: 'broll' });
  const names = list.map(m => `${m.name}: ${[...new Set(m.parts.map(p => (p.thay || '').split(',')[0]).filter(Boolean))].slice(0, 4).join(' / ') || '—'}`);
  log(`AI nhìn ${r.n ? `${r.ok}/${r.n} đoạn ` : ''}cảnh phụ${r.reused ? ` (nhớ ${r.reused} cảnh từ lần trước)` : ''} — ${names.slice(0, 6).join(' · ')}${names.length > 6 ? ' …' : ''}`);
}
