// BỘ NHỚ PHÂN TÍCH: file gốc giống hệt (cùng cỡ + cùng 2 MB đầu/cuối) → dùng lại bản đã đổi định dạng, lời chép, nhãn cảnh.
// Dựng lại cùng video không phải chờ đổi file (video 4K 3:45 mất ~280 s) và chép lời / nhìn cảnh lần nữa.
// Thư mục: <gốc>/cache/<khoá>/  (xoá thư mục này = quên hết, an toàn). Đổi cách đổi file / lọc giọng → tăng VER để không dùng bản cũ.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const VER = 'v4'; // v3 = 4/11: lọc giọng −14 LUFS + bù trễ 25 ms · v4 = nét +10 % (unsharp)
const ROOT = process.env.XUONG_CACHE || path.join(import.meta.dirname, '..', 'cache');

export function fileKey(file) {
  const st = fs.statSync(file), h = crypto.createHash('sha1'), n = 2 * 1024 * 1024;
  h.update(VER + ':' + st.size);
  const fd = fs.openSync(file, 'r');
  try {
    const b = Buffer.alloc(Math.min(n, st.size));
    fs.readSync(fd, b, 0, b.length, 0); h.update(b);
    if (st.size > n) { fs.readSync(fd, b, 0, b.length, Math.max(0, st.size - n)); h.update(b); }
  } finally { fs.closeSync(fd); }
  return h.digest('hex').slice(0, 20);
}
const dir = key => path.join(ROOT, key);
export function getJson(key, name) { try { return JSON.parse(fs.readFileSync(path.join(dir(key), name + '.json'), 'utf8')); } catch { return null; } }
export function putJson(key, name, v) { try { fs.mkdirSync(dir(key), { recursive: true }); fs.writeFileSync(path.join(dir(key), name + '.json'), JSON.stringify(v)); } catch {} }
// file media: liên kết cứng (cùng ổ → không tốn thêm chỗ), không được thì chép
function place(src, dst) { try { fs.rmSync(dst, { force: true }); fs.linkSync(src, dst); } catch { fs.copyFileSync(src, dst); } }
export function getFile(key, name, dst) { const f = path.join(dir(key), name); if (!fs.existsSync(f) || !fs.statSync(f).size) return false; place(f, dst); return true; }
export function putFile(key, name, src) { try { fs.mkdirSync(dir(key), { recursive: true }); place(src, path.join(dir(key), name)); } catch {} }
