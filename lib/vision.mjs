// AI NHÌN CẢNH PHỤ: mỗi cảnh (cảnh dài thì từng đoạn 8 giây) → 1 ảnh ghép 3 khung → /api/vision của app
// (Workers AI, miễn phí, nhãn tiếng Việt) → AI dựng ghép cảnh theo THỨ NHÌN THẤY, không chỉ theo tên file (“DJI 0541” chẳng nói gì)
import fs from 'node:fs';
import path from 'node:path';
import { run } from './run.mjs';
const APP_URL = process.env.APP_URL || 'https://dung-video-ai.truonggiang2511a.workers.dev';

const r1 = n => Math.round(n * 10) / 10;

function partsOf(dur) {
  if (dur <= 24) return [{ from: Math.min(0.3, dur / 4), to: Math.max(0.5, dur - 0.3) }];
  const out = [];
  for (let a = 0.3; a < dur - 2 && out.length < 24; a += 8) out.push({ from: r1(a), to: r1(Math.min(dur - 0.3, a + 8)) });
  return out;
}

async function sheet(file, p, out) {
  const len = Math.max(0.5, p.to - p.from);
  await run('ffmpeg', ['-y', '-v', 'error', '-ss', String(p.from), '-t', String(len), '-i', file,
    '-vf', `fps=${(3 / len).toFixed(4)},scale=240:-2,tile=3x1`, '-frames:v', '1', '-q:v', '6', out]);
  const b = fs.readFileSync(out);
  return b.length < 210000 ? 'data:image/jpeg;base64,' + b.toString('base64') : null;
}

export async function tagBrolls(job, log, live) {
  const list = job.media.filter(m => !m.main);
  if (!list.length) return;
  const dir = path.join(job.dir, 'sheets');
  fs.mkdirSync(dir, { recursive: true });
  const items = [];
  for (const m of list) {
    m.parts = partsOf(m.dur);
    for (let k = 0; k < m.parts.length; k++) {
      const img = await sheet(path.join(job.dir, 'media', m.file), m.parts[k], path.join(dir, `${m.file}-${k}.jpg`)).catch(() => null);
      if (img) items.push({ id: `${m.file}#${k}`, img, m, k });
    }
  }
  live && live({ phase: 'vision' });
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
          if (tg) { it.m.parts[it.k].thay = [tg.nhan, ...(tg.tu_khoa || [])].filter(Boolean).join(', '); ok++; }
        }
        return;
      } catch (e) { if (t) log(`AI nhìn cảnh phụ lỗi 1 nhóm: ${e.message}`); await new Promise(r => setTimeout(r, 1200)); }
    }
  }));
  const names = list.map(m => `${m.name}: ${[...new Set(m.parts.map(p => (p.thay || '').split(',')[0]).filter(Boolean))].slice(0, 4).join(' / ') || '—'}`);
  log(`AI nhìn ${ok}/${items.length} đoạn cảnh phụ — ${names.slice(0, 6).join(' · ')}${names.length > 6 ? ' …' : ''}`);
}
