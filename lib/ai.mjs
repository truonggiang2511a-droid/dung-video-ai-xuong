// Bộ não AI: 'api' = Claude Haiku qua khoá API (rẻ, phục vụ khách được, có luồng chữ để trình diễn trực tiếp)
//            'claude' = Claude Code trên máy (gói Claude cá nhân — CHỈ thử nội bộ) · 'local' = bộ dựng dự phòng theo luật
import fs from 'node:fs';
import path from 'node:path';
import { run } from './run.mjs';

const ROOT = path.join(import.meta.dirname, '..');
// đọc file .env (ANTHROPIC_API_KEY=..., XUONG_AI=api…) — không bao giờ ghi khoá vào code
// (cau-hinh.txt = cùng định dạng, dễ mở bằng Notepad trên Windows)
for (const f of ['.env', 'cau-hinh.txt']) {
  try {
    for (const l of fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
      const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {}
}

// chưa điền khoá API mà chọn api → tạm dùng Claude Code trên máy (thử nội bộ)
export const aiMode = () => { const m = process.env.XUONG_AI || 'api'; return m === 'api' && !process.env.ANTHROPIC_API_KEY ? 'claude' : m; };
const RULES = () => fs.readFileSync(path.join(ROOT, 'kit', 'LUAT-DUNG.md'), 'utf8');
// giá Haiku 5.5 (USD / 1 triệu token, prompt ≤ 100k) — ghi đè bằng AI_PRICE_IN / AI_PRICE_OUT nếu đổi mô hình
const PRICE_IN = +process.env.AI_PRICE_IN || 0.1, PRICE_OUT = +process.env.AI_PRICE_OUT || 0.5;

export async function askAI(job, task, input, onPartial, log) {
  const t0 = Date.now();
  let r;
  if (aiMode() === 'api') r = await viaApi(job, task, input, onPartial);
  else r = await viaClaudeCode(job, task, input);
  job.aiSec = (job.aiSec || 0) + (Date.now() - t0) / 1000;
  if (task === 'chat') return Array.isArray(r) ? r : r?.ops;
  if (!r || typeof r !== 'object') throw new Error('AI trả về sai định dạng');
  return r;
}

// ---------- Claude Haiku qua API (luồng chữ) ----------
async function viaApi(job, task, input, onPartial) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('chưa có ANTHROPIC_API_KEY trong file .env');
  const system = RULES() + (task === 'plan'
    ? '\n\nBÂY GIỜ: làm Việc 1 với brief.json người dùng gửi. Chỉ trả 1 JSON plan.json, theo đúng thứ tự khoá: understand, script, drop, fix, hook, cold_open, texts, brolls, chapters, speaker, cta, cta_style, channel.'
    : '\n\nBÂY GIỜ: làm Việc 2 với chat.json người dùng gửi. Chỉ trả JSON {"ops":[…]}.');
  const user = `${task === 'plan' ? 'brief.json' : 'chat.json'}:\n${JSON.stringify(input).slice(0, 300000)}`;
  const res = await fetch((process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com') + '/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    // Haiku 5.5: không gửi temperature/top_p; mặc định có suy nghĩ → effort thấp + max_tokens rộng (bài học app 1/11)
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5', max_tokens: task === 'plan' ? 16000 : 4000, stream: true,
      output_config: { effort: process.env.AI_EFFORT || 'low' }, system, messages: [{ role: 'user', content: user }] }),
  });
  if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error('Claude API: ' + (j.error?.message || res.status)); }
  let text = '', buf = '', inTok = 0, outTok = 0, stop = '', last = 0;
  const dec = new TextDecoder();
  for await (const chunk of res.body) {
    buf += dec.decode(chunk, { stream: true });
    let k;
    while ((k = buf.indexOf('\n\n')) >= 0) {
      const ev = buf.slice(0, k); buf = buf.slice(k + 2);
      const d = ev.split('\n').find(l => l.startsWith('data:'));
      if (!d) continue;
      let j; try { j = JSON.parse(d.slice(5)); } catch { continue; }
      if (j.type === 'message_start') inTok = j.message?.usage?.input_tokens || 0;
      if (j.type === 'content_block_delta' && j.delta?.type === 'text_delta') text += j.delta.text;
      if (j.type === 'message_delta') { outTok = j.usage?.output_tokens || outTok; stop = j.delta?.stop_reason || stop; }
      if (j.type === 'error') throw new Error('Claude API: ' + (j.error?.message || 'lỗi'));
    }
    if (onPartial && Date.now() - last > 700) { last = Date.now(); onPartial({ understand: obj(text, 'understand'), script: objs(text, 'script'), drop: objs(text, 'drop'), hook: obj(text, 'hook'), texts: objs(text, 'texts'), brolls: objs(text, 'brolls') }); }
  }
  job.aiCost = (job.aiCost || 0) + (inTok * PRICE_IN + outTok * PRICE_OUT) / 1e6;
  job.ai = 'Claude Haiku (API)';
  if (stop === 'refusal') throw new Error('Claude từ chối');
  try { fs.writeFileSync(path.join(job.dir, `ai-${task}.txt`), text); } catch {} // giữ bản AI viết để soi lỗi
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(stop === 'max_tokens' ? 'Claude trả lời quá dài' : 'Claude không trả JSON');
  return parseLoose(m[0], task === 'plan' ? ['drop', 'fix', 'texts', 'brolls', 'chapters', 'script'] : ['ops'], ['hook', 'cold_open', 'speaker', 'understand']);
}
// AI đôi khi viết JSON hỏng 1 ký tự (hay gặp: dấu " trong câu trích “lại nha” không thoát, dấu phẩy thừa) → sửa, không được thì nhặt từng mục
// (4/11 15:23: Haiku hỏng ở dòng 38 → cả kế hoạch bị bỏ → máy dùng bộ dự phòng → không cắt đoạn nói lại)
export function parseLoose(t, arrays = [], objects = []) {
  try { return JSON.parse(t); } catch {}
  let o = '', inStr = false;
  for (let k = 0; k < t.length; k++) {
    const ch = t[k];
    if (!inStr) { o += ch; if (ch === '"') inStr = true; continue; }
    if (ch === '\\') { o += ch + (t[k + 1] ?? ''); k++; continue; }
    if (ch === '\n') { o += '\\n'; continue; }
    if (ch === '"') { const nx = t.slice(k + 1).match(/^\s*(.)/)?.[1]; if (!nx || ',:}]'.includes(nx)) { o += ch; inStr = false; } else o += '\\"'; continue; }
    o += ch;
  }
  o = o.replace(/,(\s*[}\]])/g, '$1');
  try { return JSON.parse(o); } catch {}
  const r = {};
  for (const k of arrays) r[k] = objs(o, k);
  for (const k of objects) { const v = obj(o, k); if (v) r[k] = v; }
  const cta = o.match(/"cta"\s*:\s*"([^"]*)"/); if (cta) r.cta = cta[1];
  const ch = o.match(/"channel"\s*:\s*"([^"]*)"/); if (ch) r.channel = ch[1];
  const cs = o.match(/"cta_style"\s*:\s*"([^"]*)"/); if (cs) r.cta_style = cs[1];
  if (!arrays.some(k => r[k].length)) throw new Error('Claude trả JSON hỏng');
  r._salvaged = true;
  return r;
}
// lấy các đối tượng {…} đã viết xong trong mảng "key": [ … ] (khi Claude còn đang viết dở)
function objs(text, key) {
  const i = text.search(new RegExp(`"${key}"\\s*:\\s*\\[`));
  if (i < 0) return [];
  const out = [];
  let depth = 0, st = -1, inStr = false, esc = false;
  for (let k = text.indexOf('[', i) + 1; k < text.length; k++) {
    const ch = text[k];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '{') { if (depth++ === 0) st = k; }
    else if (ch === '}') { if (--depth === 0 && st >= 0) { try { out.push(JSON.parse(text.slice(st, k + 1))); } catch {} st = -1; } }
    else if (ch === ']' && depth === 0) break;
  }
  return out;
}
function obj(text, key) {
  const m = text.match(new RegExp(`"${key}"\\s*:\\s*(\\{[^{}]*\\})`));
  try { return m ? JSON.parse(m[1]) : null; } catch { return null; }
}

// ---------- Claude Code trên máy (chỉ thử nội bộ) ----------
async function viaClaudeCode(job, task, input) {
  const inFile = task === 'plan' ? 'brief.json' : 'chat.json', outFile = task === 'plan' ? 'plan.json' : 'ops.json';
  fs.writeFileSync(path.join(job.dir, inFile), JSON.stringify(input, null, 2));
  fs.copyFileSync(path.join(ROOT, 'kit', 'LUAT-DUNG.md'), path.join(job.dir, 'CLAUDE.md'));
  const f = path.join(job.dir, outFile);
  fs.rmSync(f, { force: true });
  const prompt = task === 'plan'
    ? 'Read CLAUDE.md and brief.json. Do task 1 (Viec 1): write plan.json exactly in the format described. Do not ask questions.'
    : 'Read CLAUDE.md and chat.json. Do task 2 (Viec 2): write ops.json (a JSON array) exactly in the format described. Do not ask questions.';
  const model = process.env.XUONG_CLAUDE_MODEL ? ['--model', process.env.XUONG_CLAUDE_MODEL] : [];
  const { out } = await run('claude', ['-p', prompt, '--output-format', 'json', '--allowedTools', 'Read,Write', '--permission-mode', 'acceptEdits', '--max-turns', '8', ...model],
    { cwd: job.dir, timeout: 300000 });
  try { const j = JSON.parse(out); job.aiCost = (job.aiCost || 0) + (+j.total_cost_usd || 0); } catch {}
  job.ai = 'Claude Code';
  let r; try { r = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { r = null; }
  if (!r) throw new Error(`Claude Code không ghi ${outFile}`);
  return r;
}
