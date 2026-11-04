// TÌM MẶT NGƯỜI NÓI trên video chính (4/11 20:21 Giang: nút “NHẮN TIN XEM NHÀ NGAY” che mặt nhân vật) → chữ / nút / nhãn né mặt.
// Mô hình YuNet (OpenCV Zoo, giấy phép MIT, 232 KB, kit/yunet.onnx — skill batdongsan-editor cũng dùng) chạy bằng onnxruntime-node
// mà HyperFrames tự cài cho tính năng tách nền (~/.cache/hyperframes/optional/onnxruntime-node@1.21.1). Chưa có thì tự cài 1 lần, chạy nền;
// cài không được → bỏ qua (dựng như cũ, không lỗi).
// Đọc khung KHOÁ (file đã đổi có khung khoá mỗi 1 s → nhanh: video 3:45 ≈ 225 khung) ở 320 px, lấy mặt to nhất mỗi khung.
// Kết quả: [{t (giây gốc), x, y, w, h (tỉ lệ khung 0–1, góc trên trái), s (độ tin)}]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { run } from './run.mjs';

const ORT_VER = '1.21.1';
const ROOT = path.join(import.meta.dirname, '..');
const MODEL = path.join(ROOT, 'kit', 'yunet.onnx');
const ORT_DIR = path.join(process.env.HYPERFRAMES_CACHE_DIR ? path.resolve(process.env.HYPERFRAMES_CACHE_DIR) : path.join(os.homedir(), '.cache', 'hyperframes'), 'optional', `onnxruntime-node@${ORT_VER}`);

let ortP = null, installing = null;
function tryLoad() {
  for (const base of [ROOT, ORT_DIR]) {
    try { return createRequire(path.join(base, 'package.json'))('onnxruntime-node'); } catch {}
  }
  return null;
}
async function ort(log) {
  const o = tryLoad();
  if (o) return o;
  if (!installing) {
    installing = (async () => {
      fs.mkdirSync(ORT_DIR, { recursive: true });
      if (!fs.existsSync(path.join(ORT_DIR, 'package.json'))) fs.writeFileSync(path.join(ORT_DIR, 'package.json'), JSON.stringify({ dependencies: { 'onnxruntime-node': `^${ORT_VER}` } }));
      log?.('Cài bộ chạy mô hình tìm mặt (1 lần, chạy nền)…');
      await run('npm', ['install', '--no-audit', '--no-fund', '--prefix', ORT_DIR, `onnxruntime-node@${ORT_VER}`], { timeout: 15 * 60e3 });
      return tryLoad();
    })().catch(e => { log?.('Chưa cài được bộ tìm mặt: ' + e.message.slice(0, 120)); return null; });
  }
  return installing;
}
async function session(log) {
  if (!ortP) ortP = (async () => { const o = await ort(log); if (!o || !fs.existsSync(MODEL)) return null; return { o, s: await o.InferenceSession.create(MODEL) }; })().catch(() => null);
  const r = await ortP;
  if (!r) ortP = null; // lần sau thử lại (vd đang cài dở)
  return r;
}

// khung khoá → ảnh BGR W×H (đệm đáy về bội số 32 cho mô hình) + giờ của từng khung
function keyframes(file, W) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-v', 'info', '-skip_frame', 'nokey', '-i', file, '-an', '-vf', `scale=${W}:-2,showinfo,format=bgr24`, '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'], { windowsHide: true });
    const chunks = [];
    let err = '', size = null;
    p.stdout.on('data', b => chunks.push(b));
    p.stderr.on('data', b => { err += b.toString(); if (!size) { const m = err.match(/Stream #0:\d.*?Video: rawvideo.*?, (\d+)x(\d+)/); if (m) size = [+m[1], +m[2]]; } });
    p.on('error', reject);
    p.on('close', code => {
      if (code !== 0 || !size) return reject(new Error('ffmpeg đọc khung lỗi'));
      const times = [...err.matchAll(/pts_time:\s*([\d.]+)/g)].map(m => +m[1]);
      resolve({ buf: Buffer.concat(chunks), w: size[0], h: size[1], times });
    });
  });
}

// giải mã đầu ra YuNet (giống FaceDetectorYN của OpenCV): mỗi bước 8/16/32 px có điểm cls·obj, hộp (tâm lệch + log cỡ)
function decode(out, PW, PH, thr = 0.6) {
  const faces = [];
  for (const st of [8, 16, 32]) {
    const cols = PW / st, rows = PH / st, cls = out[`cls_${st}`].data, obj = out[`obj_${st}`].data, bb = out[`bbox_${st}`].data;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c, s = Math.sqrt(Math.min(1, Math.max(0, cls[i])) * Math.min(1, Math.max(0, obj[i])));
      if (s < thr) continue;
      const cx = (c + bb[i * 4]) * st, cy = (r + bb[i * 4 + 1]) * st, w = Math.exp(bb[i * 4 + 2]) * st, h = Math.exp(bb[i * 4 + 3]) * st;
      faces.push({ x: cx - w / 2, y: cy - h / 2, w, h, s });
    }
  }
  faces.sort((a, b) => b.s - a.s);
  const keep = [], iou = (a, b) => { const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)); return x * y / (a.w * a.h + b.w * b.h - x * y); };
  for (const f of faces) if (!keep.some(k => iou(k, f) > 0.3)) keep.push(f);
  return keep;
}

export async function detectFaces(file, log, { W = 640, minScore = 0.72 } = {}) {
  const ss = await session(log);
  if (!ss) return null;
  const { buf, w, h, times } = await keyframes(file, W);
  // mô hình nhận đúng 640×640 → khung dọc 640×1138 chia 2 ô 640×640 chồng nhau (mặt ở xa ~20 px vẫn thấy; thu cả khung về 640 cao thì mặt chỉ ~11 px)
  const S = 640, n = Math.floor(buf.length / (w * h * 3)), out = [], plane = S * S, inp = new Float32Array(3 * plane);
  const tiles = h <= S ? [0] : [0, ...Array.from({ length: Math.ceil((h - S) / (S * 0.75)) }, (_, i) => Math.min(h - S, Math.round((i + 1) * S * 0.75)))];
  for (let k = 0; k < n; k++) {
    const o = k * w * h * 3, found = [];
    for (const y0 of [...new Set(tiles)]) {
      inp.fill(0);
      for (let y = 0; y < Math.min(S, h - y0); y++) for (let x = 0; x < Math.min(S, w); x++) {
        const si = o + ((y0 + y) * w + x) * 3, di = y * S + x;
        inp[di] = buf[si]; inp[plane + di] = buf[si + 1]; inp[2 * plane + di] = buf[si + 2]; // B, G, R như OpenCV
      }
      const res = await ss.s.run({ input: new ss.o.Tensor('float32', inp, [1, 3, S, S]) });
      for (const f of decode(res, S, S)) found.push({ ...f, y: f.y + y0 });
    }
    // người nói = mặt TO NHẤT đủ tin (mặt nhỏ phía xa / trong cảnh nền không tính); 2 ô chồng nhau thấy cùng 1 mặt → giữ 1
    const f = found.filter(f => f.s >= minScore).sort((a, b) => b.w * b.h - a.w * a.h)[0];
    if (f) out.push({ t: Math.round((times[k] ?? k) * 100) / 100, x: +(f.x / w).toFixed(4), y: +(f.y / h).toFixed(4), w: +(f.w / w).toFixed(4), h: +(f.h / h).toFixed(4), s: +f.s.toFixed(2) });
  }
  return { faces: out, frames: n };
}

// dùng trong dây chuyền: mặt người nói của video chính (nhớ theo file gốc — dựng lại không phải tìm lại)
import { getJson, putJson } from './cache.mjs';
export async function findFaces(job, log) {
  const m = job.media?.find(x => x.main);
  if (!m) return;
  const c = m.key && getJson(m.key, 'faces-v1');
  if (c) { job.faces = c; return log?.(`Tìm mặt người nói: nhớ từ lần trước (${c.length} khung có mặt)`); }
  const t0 = Date.now(), r = await detectFaces(path.join(job.dir, 'media', m.file), log);
  if (!r) return log?.('Chưa tìm được mặt người nói (bộ chạy mô hình chưa sẵn) — chữ đặt theo vùng cố định');
  job.faces = r.faces;
  if (m.key) putJson(m.key, 'faces-v1', r.faces);
  log?.(`Tìm mặt người nói: ${r.faces.length}/${r.frames} khung có mặt · ${Math.round((Date.now() - t0) / 1000)} s${r.faces.length ? ' — chữ, nút, nhãn sẽ né mặt' : ' (không thấy mặt — chữ đặt theo vùng cố định)'}`);
}
// mở máy là chuẩn bị sẵn bộ chạy mô hình (lần đầu tự cài, chạy nền) để lúc dựng không phải chờ
export function warmFaces(log) { session(log).then(s => s && log?.('Bộ tìm mặt sẵn sàng')).catch(() => {}); }
