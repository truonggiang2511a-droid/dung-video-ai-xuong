// Xưởng dựng HyperFrames — chạy trên laptop, app nói chuyện qua đường hầm Cloudflare.
// Chạy: node server.mjs   (mở http://localhost:8790)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { silenceCuts, prepare, transcribe, analyze, plan, finalize, opsForCursor, writeComposition, chat, render, APP_URL } from './lib/pipeline.mjs';
import { aiMode } from './lib/ai.mjs';
import { tagBrolls, tagMain } from './lib/vision.mjs';
import { findFaces, warmFaces } from './lib/faces.mjs';
import { STYLES, INDUSTRIES, IND } from './lib/styles.mjs';
import { qcTimeline, qcExport } from './lib/qc.mjs';
import { queueInfo } from './lib/queue.mjs';
import { verifyToken, corsHeaders, startRegister } from './lib/pro.mjs';
import { applyOps, faceAvoid } from './lib/pipeline.mjs';

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
    // tìm mặt người nói (chữ / nút / nhãn né mặt) — song song, lỗi thì dựng như cũ
    const faceP = findFaces(j, s => step(j, s)).catch(e => step(j, 'Tìm mặt lỗi: ' + e.message));
    await transcribe(j, s => step(j, s), live);
    await analyze(j, s => step(j, s), live);
    if (j.brollsReady) await j.brollsReady;
    await tagBrolls(j, s => step(j, s), live).catch(e => step(j, 'AI nhìn cảnh phụ lỗi: ' + e.message));
    await mainTag;
    await faceP;
    step(j, 'AI đọc hiểu video: tóm ý, viết kịch bản dựng, tìm đoạn nói hỏng, chọn chữ, ghép cảnh phụ theo hình…');
    const p = await plan(j, s => step(j, s), live);
    const { T, removed } = finalize(j, p);
    // KIỂM DUYỆT 100 điểm (Master Rules VIII) — máy đo thật trên timeline; mục “xuất” chấm sau khi có MP4
    j.qc = await qcTimeline(j, T, p).catch(e => ({ score: 0, level: 'Lỗi kiểm duyệt', items: [], error: e.message }));
    fs.writeFileSync(path.join(j.dir, 'timeline.json'), JSON.stringify(T, null, 2));
    writeComposition(j);
    live({ phase: 'done', drops: j.drops, cuts: j.cuts, final: true });
    const nd = j.drops.length;
    step(j, `Cắt bỏ ${Math.round(removed)} s (${j.cuts.length} chỗ${nd ? `, gồm ${nd} đoạn nói hỏng / nói với người quay` : ''}) → video còn ${Math.round(T.duration)} s`);
    if (j.qc?.items?.length) step(j, `Kiểm duyệt chất lượng: ${j.qc.score}/100 · ${j.qc.level}`);
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

// LỊCH SỬ SỬA (hoàn tác / làm lại) — mỗi lần chat / sửa tay lưu timeline trước đó, giữ 30 bước
function pushHist(j) {
  const f = path.join(j.dir, 'timeline.json');
  if (!fs.existsSync(f)) return;
  j.hist = (j.hist || []).concat([fs.readFileSync(f, 'utf8')]).slice(-30); j.redo = [];
}
function setTimeline(j, T) {
  fs.writeFileSync(path.join(j.dir, 'timeline.json'), JSON.stringify(T, null, 2));
  j.timeline = T; j.version = (j.version || 0) + 1; j.approved = false;
  writeComposition(j);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  // trang app chính (khác địa chỉ) gọi thẳng máy dựng → CORS chỉ cho địa chỉ app
  for (const [k, v] of Object.entries(corsHeaders(req, APP_URL))) res.setHeader(k, v);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  try {
    if (p === '/' || p === '/index.html') return serveFile(req, res, path.join(ROOT, 'ui', 'index.html'));
    if (p.startsWith('/ui/')) return serveFile(req, res, path.join(ROOT, 'ui', path.basename(p)));
    if (p === '/api/styles') return send(res, 200, { industries: INDUSTRIES.map(([id, name, style]) => ({ id, name, style })), styles: Object.entries(STYLES).map(([id, v]) => ({ id, name: v.name, acc: v.acc })) });
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
    // ai được dùng: Giang (mã xưởng x-key, thấy mọi dự án) hoặc khách app chính (mã do app ký, chỉ thấy dự án của mình)
    const who = req.headers['x-key'] === KEY ? { u: 'admin', adm: true } : verifyToken(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
    if (!who) return send(res, 401, { error: 'Sai mã truy cập' });
    if (p === '/api/jobs' && req.method === 'GET') { // danh sách dự án của khách (mới nhất trước)
      const list = fs.readdirSync(JOBS).map(load).filter(x => x && (who.adm || x.owner === who.u)).sort((a, b) => b.created - a.created).slice(0, 50)
        .map(x => ({ id: x.id, status: x.status, created: x.created, duration: x.timeline?.duration, industry: x.industry, style: x.styleInfo?.id, name: x.media?.find(m => m.main)?.name || '' }));
      return send(res, 200, { jobs: list });
    }

    if (p === '/api/jobs' && req.method === 'POST') {
      const b = await body(req);
      const id = crypto.randomBytes(12).toString('base64url');
      // ngành (20 nhóm, rỗng = AI tự nhận diện) + phong cách (rỗng = theo ngành / AI chọn)
      const ind = IND[b.industry] ? b.industry : '', sty = STYLES[b.style] ? b.style : '';
      const j = { id, owner: who.u, ownerName: who.n || '', genre: b.genre || IND[ind]?.genre || 'chung', industry: ind, style: sty, format: b.format || '9:16', status: 'new', steps: [], created: Date.now(), dir: path.join(JOBS, id) };
      fs.mkdirSync(path.join(j.dir, 'raw'), { recursive: true });
      jobs.set(id, j); save(j);
      return send(res, 200, { id });
    }
    const m = p.match(/^\/api\/jobs\/([^/]+)(?:\/(\w+))?$/);
    const j = m && load(m[1]);
    if (!j || (!who.adm && j.owner !== who.u)) return send(res, 404, { error: 'Không thấy dự án' });
    const act = m[2];
    // SỬA TAY trên timeline (app chính / trang thử): dời, kéo dài, xoá, sửa chữ, cắt đoạn… = cùng bộ thao tác với chat, KHÔNG gọi AI
    if (act === 'ops' && req.method === 'POST') {
      const b = await body(req);
      if (j.status !== 'done') return send(res, 409, { error: 'Video chưa dựng xong' });
      const ops = (Array.isArray(b.ops) ? b.ops : []).slice(0, 50).map(o => ({ ...o, by: 'user' }));
      if (!ops.length) return send(res, 400, { error: 'Không có thao tác' });
      pushHist(j);
      const T = JSON.parse(fs.readFileSync(path.join(j.dir, 'timeline.json'), 'utf8'));
      const applied = applyOps(T, ops, j);
      faceAvoid(T, j);
      setTimeline(j, T);
      (j.chatLog = j.chatLog || []).push({ t: Date.now(), text: '(sửa tay)', ops: applied.map(o => o.op + ':' + (o.id || '')) });
      save(j);
      qcTimeline(j, T).then(q => { j.qc = q; save(j); }).catch(() => {});
      return send(res, 200, { ops: applied, version: j.version, timeline: T });
    }
    if ((act === 'undo' || act === 'redo') && req.method === 'POST') {
      const from = act === 'undo' ? (j.hist || []) : (j.redo || []), to = act === 'undo' ? (j.redo = j.redo || []) : (j.hist = j.hist || []);
      if (!from.length) return send(res, 409, { error: act === 'undo' ? 'Không còn gì để hoàn tác' : 'Không còn gì để làm lại' });
      const f = path.join(j.dir, 'timeline.json');
      to.push(fs.readFileSync(f, 'utf8'));
      setTimeline(j, JSON.parse(from.pop()));
      save(j);
      return send(res, 200, { version: j.version, timeline: j.timeline, undo: (j.hist || []).length, redo: (j.redo || []).length });
    }
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
      if (b.industry !== undefined && (b.industry === '' || IND[b.industry])) j.industry = b.industry;
      if (b.style !== undefined && (b.style === '' || STYLES[b.style])) j.style = b.style;
      delete j.styleOverride;
      if (j.status === 'running') return send(res, 409, { error: 'Đang dựng' });
      pipeline(j);
      return send(res, 200, { ok: true });
    }
    if (!act && req.method === 'GET') {
      const { dir, words, tlWords, brollsReady, sentences, silences, autoDrops, fillCuts, mumbleCuts, segs, live, hist, redo, faces, ...pub } = j;
      pub.undo = (hist || []).length; pub.redoN = (redo || []).length;
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
      j.chat = { status: 'running', n, t0 }; pushHist(j); save(j);
      const text = String(b.text || '').slice(0, 800);
      chat(j, text, b.target, s => { step(j, s); j.chat.say = s; })
        .then(({ ops, say }) => {
          j.timeline = JSON.parse(fs.readFileSync(path.join(j.dir, 'timeline.json'), 'utf8'));
          j.version = (j.version || 0) + 1; j.approved = false;
          j.chat = { status: 'done', n, ops, say, version: j.version };
          qcTimeline(j, j.timeline).then(q => { j.qc = q; save(j); }).catch(() => {});
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
        .then(async () => {
          j.render = { status: 'done', pct: 100, sec: Math.round((Date.now() - j.render.t0) / 1000), url: `/jobs/${j.id}/out.mp4` };
          step(j, `Xuất MP4 xong trong ${j.render.sec} s`);
          // đo file xuất thật: thời lượng, khung đen, hình đứng, âm lượng → cập nhật điểm
          if (j.qc?.items?.length) { j.qc = await qcExport(j, j.timeline, j.qc).catch(() => j.qc); step(j, `Kiểm duyệt sau xuất: ${j.qc.score}/100 · ${j.qc.level}`); }
          save(j);
        })
        .catch(e => { j.render = { status: 'error', error: e.message }; step(j, 'Xuất lỗi: ' + e.message); });
      return send(res, 200, { ok: true });
    }
    send(res, 404, { error: 'Không có lệnh này' });
  } catch (e) { console.error(e); send(res, 500, { error: e.message }); }
}).listen(PORT, process.env.XUONG_HOST || undefined, () => { // VPS: XUONG_HOST=127.0.0.1 (chỉ đường hầm vào được, không lộ cổng 8790 ra mạng)
  console.log(`\nMáy dựng Dựng Video AI đang chạy: http://localhost:${PORT}`);
  console.log(`Mã truy cập (dán vào trang khi được hỏi): ${KEY}`);
  console.log(`AI: ${aiMode()}${aiMode() === 'claude' ? ' (Claude Code — chỉ dùng thử nội bộ)' : ''} · chép lời qua ${APP_URL}\n`);
  warmFaces(s => console.log(s));
  // báo địa chỉ máy dựng cho app chính (khách app chính dựng qua máy này) — cần XUONG_SECRET trong cau-hinh.txt
  startRegister(APP_URL, () => ({ queue: queueInfo(), ver: 'xuong-1' }), s => console.log(s));
  // TỰ DỌN Ổ (VPS): XUONG_KEEP_DAYS = số ngày giữ dự án (mặc định 0 = không dọn — laptop Giang giữ để soi lỗi).
  // Mỗi dự án ~1 GB (file gốc + bản đổi); bộ nhớ phân tích cache/ không dùng tới sau 2× số ngày đó cũng xoá.
  const keep = +process.env.XUONG_KEEP_DAYS || 0;
  if (keep > 0) {
    const sweep = () => {
      const old = Date.now() - keep * 86400e3; let n = 0;
      for (const id of fs.readdirSync(JOBS)) {
        const j = load(id); if (!j || j.status === 'running' || j.render?.status === 'running' || j.chat?.status === 'running') continue;
        if ((j.created || 0) < old) { fs.rmSync(path.join(JOBS, id), { recursive: true, force: true }); jobs.delete(id); n++; }
      }
      const C = path.join(ROOT, 'cache');
      if (fs.existsSync(C)) for (const k of fs.readdirSync(C)) { const d = path.join(C, k); try { if (fs.statSync(d).mtimeMs < Date.now() - 2 * keep * 86400e3) { fs.rmSync(d, { recursive: true, force: true }); n++; } } catch {} }
      if (n) console.log(`Dọn ổ: xoá ${n} dự án / bộ nhớ cũ hơn ${keep} ngày`);
    };
    sweep(); setInterval(sweep, 6 * 3600e3);
  }
});
