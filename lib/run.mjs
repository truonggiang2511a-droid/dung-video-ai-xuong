// Chạy lệnh ngoài (ffmpeg, npx, claude) — chạy được cả Windows lẫn Linux/macOS
import { spawn } from 'node:child_process';

const WIN = process.platform === 'win32';
const CMD_SHIMS = new Set(['npx', 'npm', 'claude']); // trên Windows là file .cmd -> phải chạy qua shell

const q = a => (/[\s"&|<>^()]/.test(a) ? `"${String(a).replace(/"/g, '\\"')}"` : a);

export function run(cmd, args = [], { cwd, timeout = 0, onLine, env } = {}) {
  return new Promise((resolve, reject) => {
    const shell = WIN && CMD_SHIMS.has(cmd);
    const p = shell
      ? spawn([cmd, ...args.map(q)].join(' '), { cwd, shell: true, env: { ...process.env, ...env }, windowsHide: true })
      : spawn(cmd, args, { cwd, env: { ...process.env, ...env }, windowsHide: true });
    let out = '', err = '', timer;
    if (timeout) timer = setTimeout(() => { p.kill(); reject(new Error(`${cmd} quá ${Math.round(timeout / 1000)} giây`)); }, timeout);
    const feed = (buf, isErr) => {
      const s = buf.toString();
      if (isErr) err += s; else out += s;
      if (onLine) s.split(/\r?\n|\r/).forEach(l => l.trim() && onLine(l));
    };
    p.stdout.on('data', b => feed(b, false));
    p.stderr.on('data', b => feed(b, true));
    p.on('error', e => { clearTimeout(timer); reject(new Error(`Không chạy được "${cmd}": ${e.message}`)); });
    p.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve({ out, err });
      else reject(Object.assign(new Error(`${cmd} lỗi (mã ${code}): ${(err || out).trim().split('\n').slice(-3).join(' | ')}`), { out, err }));
    });
  });
}
