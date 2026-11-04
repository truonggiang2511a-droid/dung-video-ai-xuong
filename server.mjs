// Xưởng dựng HyperFrames — chạy trên laptop, app nói chuyện qua đường hầm Cloudflare.
// Chạy: node server.mjs   (mở http://localhost:8790)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { silenceCuts, prepare, transcribe, analyze, plan, finalize, opsForCursor, writeComposition, chat, render, APP_URL } from './lib/pipeline.mjs';
import { aiMode } from './lib/ai.mjs';
import { tagBrolls, tagMain } from './lib/vision.mjs';
import { queueInfo } from './lib/queue.mjs';

const ROOT = import.meta.dirname;
const JOBS = path.join(ROOT, 'jobs');
const PORT = +process.env.PORT || 8790;
fs.mkdirSync(JOBS, { recursive: true });
const keyFile = path.join(ROOT, '.xuong-key');
const KEY = process.env.XUONG_KEY || (fs.existsSync(keyFile) ? fs.readFileSync(keyFile, 'utf8').trim() : (() => { const k = crypto.randomBytes(9).toString('base64url'); fs.writeFileSync(keyFile, k); return k; })());

const jobs = new Map();
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.mp4': 'video/mp4', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };

function load(id) {
  if (!/^[a-zA-Z0-9_-]{10,40}$/.test(id)) return null;
  if (jobs.has(id)) return jobs.get(id);
  const f = path.join(JOBS, id, 'state.json');
  if (!fs.existsSync(f)) return null;
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  j.dir = path.join(JOBS, id);
  if (j.status === 'running') j.status = 'error', j.error = 'Máy dựng đã khởi động lại giữa chừng — tạo video mới để dựng lại';
  jobs.set(id, j);
  return j;
}
function save(j) { const { dir, ...rest } = j; fs.writeFileSync(path.join(j.dir, 'state.json'), JSON.stringify(rest)); }
function step(j, say) { j.steps.push({ t: Date.now(), say }); console.log(`[${j.id}] ${say}`); save(j); }

const send = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); };
const body = req => new Promise((ok, no) => { const b = []; req.on('data', d => b.push(d)); req.on('end', () => { try { ok(JSON.parse(Buffer.concat(b).toString() || '{}')); } catch (e) { no(e); } }); });

function serveFile(req, res, file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('Không có file'); }
  const size = fs.statSync(file).size, type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
  if (range) { // video cần trả từng khúc để tua được
    const a = range[1] ? +range[1] : 0, b = range[2] ? Math.min(+range[2], size - 1) : size - 1;
    res.writeHead(206, { 'content-type': type, 'accept-ranges': 'bytes', 'content-range': `bytes ${a}-${b}/${size}`, 'content-length': b - a + 1, 'cache-control': 'no-cache' });
    return fs.createReadStream(file, { start: a, end: b }).pipe(res);
  }
  res.writeHead(200, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes', 'cache-control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}

async function pipeline(j) {
  j.status = 'running'; j.error = ''; j.steps = []; j.timeline = null; j.ops = null; j.aiCost = 0; j.aiSec = 0; j.live = { seq: 0 };
  j.render = null; j.chat = null; j.version = (j.version || 0) + 1; j.approved = false; // “Dựng lại” dùng lại file đã tải (bộ nhớ phân tích giúp nhanh)
  const t0 = Date.now();
  // live = những gì trang cần để vẽ quá trình dựng trực tiếp (giây gốc của video chính)
  const live = o => { Object.assign(j.live, o); j.live.seq++; };
  try {
    step(j, 'Nhận video');
    await prepare(j, s => step(j, s), live);
    // AI xem video chính (người nói đang ở đâu, đang khoe gì) chạy song song với chép lời
    const mainTag = tagMain(j, s => step(j, s)).catch(e => step(j, 'AI xem video chính lỗi: ' + e.message));
    await transcribe(j, s => step(j, s), live);
    await analyze(j, s => step(j, s), live);
    if (j.brollsReady) await j.brollsReady;
    await tagBrolls(j, s => step(j, s), live).catch(e => step(j, 'AI nhìn cảnh phụ lỗi: ' + e.message));
    await mainTag;
    step(j, 'AI đọc hiểu video: tóm ý, viết kịch bản dựng, tìm đoạn nói hỏng, chọn chữ, ghép cảnh phụ theo hình…');
    const p = await plan(j, s => step(j, s), live);
    const { T, removed } = finalize(j, p);
    fs.writeFileSync(path.join(j.dir, 'timeline.json'), JSON.stringify(T, null, 2));
    writeComposition(j);
    live({ phase: 'done', drops: j.drops, cuts: j.cuts, final: true });
    const nd = j.drops.length;
    step(j, `Cắt bỏ ${Math.round(removed)} s (${j.cuts.length} chỗ${nd ? `, gồm ${nd} đoạn nói hỏng / nói với người quay` : ''}) → video còn ${Math.round(T.duration)} s`);
    j.timeline = T;
    j.ops = opsForCursor(T);
    j.status = 'done';
    step(j, `Xong: ${T.clips.filter(c => c.type !== 'subs').length} thao tác dựng, tổng ${Math.round((Date.now() - t0) / 1000)} s`);
    console.log(`[${j.id}] AI = ${j.ai} · ${Math.round(j.aiSec)} s · ~${(j.aiCost || 0).toFixed(4)} USD`);
  } catch (e) {
    j.status = 'error'; j.error = e.message; step(j, 'Lỗi: ' + e.message);
  }
  save(j);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    if (p === '/' || p === '/index.html') return serveFile(req, res, path.join(ROOT, 'ui', 'index.html'));
    if (p.startsWith('/ui/')) return serveFile(req, res, path.join(ROOT, 'ui', path.basename(p)));
    if (p === '/api/health') return send(res, 200, { ok: true, ai: aiMode(), app: APP_URL, queue: queueInfo() });
    const fm = p.match(/^\/jobs\/([^/]+)\/(.+)$/); // file của dự án: index.html, media, kit, out.mp4 (id ngẫu nhiên = chìa)
    if (fm && req.method === 'GET') {
      const j = load(fm[1]);
      const f = path.normalize(path.join(JOBS, fm[1], decodeURIComponent(fm[2])));
      if (!j || !f.startsWith(path.join(JOBS, fm[1])) || /raw|state|voice|CLAUDE/.test(fm[2])) { res.writeHead(404); return res.end(); }
      if (/index\.html$/.test(f) && fs.existsSync(f)) { // xem nhanh trên trình duyệt: gắn bộ chạy HyperFrames (lúc render CLI tự gắn)
        const html = fs.readFileSync(f, 'utf8').replace('</body>', '<script src="/ui/hyperframe.runtime.iife.js"></script></body>');
        res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-cache' });
        return res.end(html);
      }
      return serveFile(req, res, f);
    }
    if (!p.startsWith('/api/')) { res.writeHead(404); return res.end(); }
    if (req.headers['x-key'] !== KEY) return send(res, 401, { error: 'Sai mã truy cập' });

    if (p === '/api/jobs' && req.method === 'POST') {
      const b = await body(req);
      const id = crypto.randomBytes(12).toString('base64url');
      const j = { id, genre: b.genre || 'chung', format: b.format || '9:16', status: 'new', steps: [], created: Date.now(), dir: path.join(JOBS, id) };
      fs.mkdirSync(path.join(j.dir, 'raw'), { recursive: true });
      jobs.set(id, j); save(j);
      return send(res, 200, { id });
    }
    const m = p.match(/^\/api\/jobs\/([^/]+)(?:\/(\w+))?$/);
    const j = m && load(m[1]);
    if (!j) return send(res, 404, { error: 'Không thấy dự án' });
    const act = m[2];
    if (act === 'upload' && req.method === 'PUT') { // tải từng khúc ≤ 8 MB (đường hầm miễn phí giới hạn 100 MB/lần gửi)
      const name = path.basename(url.searchParams.get('name') || 'video.mp4').replace(/[^\p{L}\p{N}._ -]/gu, '_');
      const f = path.join(j.dir, 'raw', name), off = +url.searchParams.get('offset') || 0;
      const have = fs.existsSync(f) ? fs.statSync(f).size : 0;
      if (off === 0 && have) fs.rmSync(f);
      else if (off !== have) return send(res, 409, { error: 'Lệch vị trí', have });
      await new Promise((ok, no) => { const w = fs.createWriteStream(f, { flags: 'a' }); req.pipe(w); w.on('finish', ok); w.on('error', no); });
      if (url.searchParams.get('main') === '1') j.main = name;
      save(j);
      return send(res, 200, { have: fs.statSync(f).size });
    }
    if (act === 'start' && req.method === 'POST') {
      const b = await body(req);
      if (b.genre) j.genre = b.genre;
      if (j.status === 'running') return send(res, 409, { error: 'Đang dựng' });
      pipeline(j);
      return send(res, 200, { ok: true });
    }
    if (!act && req.method === 'GET') {
      const { dir, words, tlWords, brollsReady, sentences, silences, autoDrops, fillCuts, mumbleCuts, segs, live, ...pub } = j;
      const since = +url.searchParams.get('seq') || -1;
      if (live && live.seq !== since) { // gửi phần đang dựng (chỉ khi có thay đổi)
        pub.live = { ...live, media: (j.media || []).map(({ name, dur, main, ready, file }) => ({ name, dur, main, ready, file })),
          words: (j.words || []).map(w => [w.w, Math.round(w.s * 100) / 100, Math.round(w.e * 100) / 100]),
          silences: [...(j.silences ? silenceCuts(j) : []), ...(j.mumbleCuts || [])], /* chỉ chỗ sẽ cắt thật */ autoDrops: (j.autoDrops || []).map(d => ({ ...d, a: sentences?.[d.from]?.start, b: sentences?.[d.to]?.end })),
          sentences: (sentences || []).map(x => [x.start, x.end]) };
      }
      if (!url.searchParams.has('admin')) { delete pub.ai; delete pub.aiCost; delete pub.aiSec; }
      return send(res, 200, pub);
    }
    if (act === 'chat' && req.method === 'POST') {
      // chạy nền: tách người khỏi nền có thể mất > 100 s (đường hầm cắt yêu cầu dài) → trang hỏi lại trạng thái j.chat
      const b = await body(req);
      if (j.status !== 'done') return send(res, 409, { error: 'Video chưa dựng xong' });
      if (j.chat?.status === 'running') return send(res, 409, { error: 'AI đang sửa yêu cầu trước' });
      const n = (j.chat?.n || 0) + 1, t0 = Date.now();
      j.chat = { status: 'running', n, t0 }; save(j);
      const text = String(b.text || '').slice(0, 800);
      chat(j, text, b.target, s => { step(j, s); j.chat.say = s; })
        .then(({ ops, say }) => {
          j.timeline = JSON.parse(fs.readFileSync(path.join(j.dir, 'timeline.json'), 'utf8'));
          j.version = (j.version || 0) + 1; j.approved = false;
          j.chat = { status: 'done', n, ops, say, version: j.version };
          (j.chatLog = j.chatLog || []).push({ t: Date.now(), text, target: b.target || '', say, ops: ops.map(o => o.op + ':' + (o.id || '')) }); // lưu để soi khi khách báo AI không hiểu
          step(j, `Sửa theo chat: ${ops.length} thao tác (${Math.round((Date.now() - t0) / 1000)} s)`);
        })
        .catch(e => { j.chat = { status: 'error', n, error: e.message }; step(j, 'Sửa lỗi: ' + e.message); })
        .finally(() => save(j));
      return send(res, 200, { n });
    }
    if (act === 'render' && req.method === 'POST') {
      if (j.render?.status === 'running') return send(res, 409, { error: 'Đang xuất' });
      j.render = { status: 'running', pct: 0, t0: Date.now(), queue: 0 }; save(j);
      render(j, pct => { j.render.pct = pct; }, q => { j.render.queue = q; })
        .then(() => { j.render = { status: 'done', pct: 100, sec: Math.round((Date.now() - j.render.t0) / 1000), url: `/jobs/${j.id}/out.mp4` }; step(j, `Xuất MP4 xong trong ${j.render.sec} s`); })
        .catch(e => { j.render = { status: 'error', error: e.message }; step(j, 'Xuất lỗi: ' + e.message); });
      return send(res, 200, { ok: true });
    }
    send(res, 404, { error: 'Không có lệnh này' });
  } catch (e) { console.error(e); send(res, 500, { error: e.message }); }
}).listen(PORT, () => {
  console.log(`\nMáy dựng Dựng Video AI đang chạy: http://localhost:${PORT}`);
  console.log(`Mã truy cập (dán vào trang khi được hỏi): ${KEY}`);
  console.log(`AI: ${aiMode()}${aiMode() === 'claude' ? ' (Claude Code — chỉ dùng thử nội bộ)' : ''} · chép lời qua ${APP_URL}\n`);
});
