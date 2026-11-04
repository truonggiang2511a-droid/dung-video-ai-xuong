// Dựng video: chuẩn bị file → chép lời → dọn bản quay thô (lặng, nói lại, lời ekip) → AI lập kế hoạch → timeline JSON → HyperFrames
import fs from 'node:fs';
import path from 'node:path';
import { run } from './run.mjs';
import { build, GENRES, ICON_KEYS, SIZES } from './gen.mjs';
import { askAI, aiMode } from './ai.mjs';
import { slot } from './queue.mjs';

const ROOT = path.join(import.meta.dirname, '..');
const KIT = path.join(ROOT, 'kit');
// kho emoji gửi kèm dạng 1 file gói (kit/emoji-pack.json) → tự bung ra kit/emoji/ lần đầu chạy
try {
  const pack = path.join(KIT, 'emoji-pack.json'), dir = path.join(KIT, 'emoji');
  if (fs.existsSync(pack) && !fs.existsSync(path.join(dir, 'nhan.json'))) {
    fs.mkdirSync(dir, { recursive: true });
    for (const [f, txt] of Object.entries(JSON.parse(fs.readFileSync(pack, 'utf8')))) fs.writeFileSync(path.join(dir, f), txt);
  }
} catch {}
// emoji 3D (Fluent, MIT) + nghĩa tiếng Việt để AI chọn đúng
export const EMOJI = (() => { try { return JSON.parse(fs.readFileSync(path.join(KIT, 'emoji', 'nhan.json'), 'utf8')); } catch { return {}; } })();
// ước thời lượng còn lại sau khi bỏ lặng + câu máy tự bỏ (để dặn AI số chữ điểm nhấn cần có)
function keptGuess(job) {
  const ss = job.sentences || [];
  return ss.filter(x => !(job.autoDrops || []).some(d => x.i >= d.from && x.i <= d.to)).reduce((t, x) => t + (x.end - x.start), 0) || 30;
}
export const APP_URL = process.env.APP_URL || 'https://dung-video-ai.truonggiang2511a.workers.dev';

const r2 = n => Math.round(n * 100) / 100;
const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const wr = (f, o) => fs.writeFileSync(f, JSON.stringify(o, null, 2));
const plain = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

// ---------- 1. chuẩn bị file ----------
export async function probe(file) {
  const { out } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height,color_transfer', '-of', 'json', file]);
  const j = JSON.parse(out);
  const v = j.streams.find(s => s.codec_type === 'video');
  const hdr = /arib-std-b67|smpte2084/.test(v?.color_transfer || ''); // iPhone quay HDR (HLG) / PQ
  return { dur: +j.format.duration || 0, w: v?.width || 0, h: v?.height || 0, codec: v?.codec_name || '', hdr, audio: j.streams.some(s => s.codec_type === 'audio') };
}

// Đổi về H.264 SDR cạnh ngắn 1080, 30 khung/giây, khung gốc mỗi 1 giây.
// HDR (iPhone) → chuyển sắc SDR bt709 (không thì HyperFrames đi đường HDR, cần ~6 GB/phút ổ tạm, màu xem nhanh bị nhạt).
// Có card AMD/NVIDIA/Intel thì mã hoá bằng card (nhanh hơn nhiều), lỗi thì tự quay về CPU.
let caps = null;
async function ffcaps() {
  if (caps) return caps;
  const f = await run('ffmpeg', ['-hide_banner', '-filters']).then(r => r.out).catch(() => '');
  const e = await run('ffmpeg', ['-hide_banner', '-encoders']).then(r => r.out).catch(() => '');
  const want = process.env.XUONG_HWENC; // amf | nvenc | qsv | off
  const hw = want === 'off' ? null : ['h264_amf', 'h264_nvenc', 'h264_qsv'].find(x => e.includes(x) && (!want || x.endsWith(want)));
  caps = { zscale: /\bzscale\b/.test(f), hw };
  return caps;
}
async function transcode(src, dst, keepAudio, hdr) {
  const c = await ffcaps();
  const scale = "scale='if(gt(iw,ih),-2,min(1080,iw))':'if(gt(iw,ih),min(1080,ih),-2)'";
  const tone = hdr && c.zscale ? 'zscale=t=linear:npl=203,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,' : '';
  // thu nhỏ TRƯỚC rồi mới chuyển sắc HDR (chuyển sắc ở 4K chậm gấp ~2,4 lần — đo 4/11)
  const vf = `${scale},${tone}fps=30,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709`;
  const a = keepAudio ? ['-c:a', 'aac', '-b:a', '160k', '-ac', '2'] : ['-an'];
  const tags = ['-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-movflags', '+faststart'];
  const sw = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-maxrate', '9M', '-bufsize', '18M', '-g', '30'];
  // giới hạn ~6–9 Mbit/s: đủ nét cho 1080p, file nhẹ để xem nhanh qua mạng (bản cũ cqp ra 13 Mbit/s → aroll 3:45 nặng 372 MB)
  const rate = ['-b:v', '6M', '-maxrate', '9M', '-bufsize', '18M'];
  const enc = { h264_amf: ['-c:v', 'h264_amf', '-quality', 'balanced', '-rc', 'vbr_peak', ...rate, '-g', '30'],
    h264_nvenc: ['-c:v', 'h264_nvenc', '-preset', 'p4', '-rc', 'vbr', '-cq', '23', ...rate, '-g', '30'], h264_qsv: ['-c:v', 'h264_qsv', ...rate, '-g', '30'] };
  if (c.hw) {
    try { await run('ffmpeg', ['-y', '-v', 'error', '-hwaccel', 'auto', '-i', src, '-vf', vf, ...enc[c.hw], ...tags, ...a, dst]); return c.hw; }
    catch { /* card không chịu → CPU */ }
  }
  await run('ffmpeg', ['-y', '-v', 'error', '-i', src, '-vf', vf, ...sw, ...tags, ...a, dst]);
  return 'cpu';
}

// Video chính đổi trước (để chép lời ngay), cảnh phụ đổi song song phía sau
export async function prepare(job, log, live) {
  const raw = path.join(job.dir, 'raw');
  const media = path.join(job.dir, 'media');
  fs.mkdirSync(media, { recursive: true });
  const info = [];
  for (const f of fs.readdirSync(raw)) info.push({ f, ...(await probe(path.join(raw, f))) });
  info.sort((a, b) => b.dur - a.dur);
  const main = info.find(i => i.f === job.main) || info[0];
  if (!main) throw new Error('Chưa có video nào');
  job.media = info.map((i, k) => ({ file: (i === main ? 'aroll' : 'b' + k) + '.mp4', src: i.f, name: i.f.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '), dur: i.dur, main: i === main, audio: i.audio, hdr: i.hdr, ready: false }));
  live({ phase: 'prepare' });
  const one = async (m, i) => {
    const t0 = Date.now();
    const how = await slot('cpu', () => transcode(path.join(raw, m.src), path.join(media, m.file), m.main && m.audio, m.hdr), q => live({ queue: q }));
    m.ready = true;
    log(`Chuẩn bị ${m.main ? 'video chính' : 'cảnh phụ'} “${m.name}”${m.hdr ? ' (HDR → màu thường)' : ''} · ${r2((Date.now() - t0) / 1000)} s${how !== 'cpu' ? ' · card đồ hoạ' : ''}`);
    live({});
  };
  await one(job.media.find(m => m.main));
  job.brollsReady = Promise.all(job.media.filter(m => !m.main).map(m => one(m)));
}

// ---------- 2. chép lời (Whisper của app Dựng Video AI) ----------
const PROMPT = { bds: 'Review nhà đất: giá tỷ, triệu, mét vuông, sổ hồng, mặt tiền, hẻm xe hơi.', banhang: 'Giới thiệu sản phẩm, giá, khuyến mãi, đặt hàng.', amthuc: 'Nấu ăn, món ngon, nguyên liệu, phút.', kienthuc: 'Chia sẻ kiến thức, các bước, mẹo.', vlog: 'Vlog đời thường.', chung: '' };
export async function transcribe(job, log, live) {
  const m = job.media.find(x => x.main);
  job.words = [];
  if (!m.audio) return;
  const wav = path.join(job.dir, 'voice.wav');
  await run('ffmpeg', ['-y', '-v', 'error', '-i', path.join(job.dir, 'media', m.file), '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav]);
  const part = 55, n = Math.ceil(m.dur / part), words = [];
  live({ phase: 'transcribe' });
  await Promise.all(Array.from({ length: n }, async (_, k) => {
    const f = path.join(job.dir, `voice-${k}.wav`);
    await run('ffmpeg', ['-y', '-v', 'error', '-ss', String(k * part), '-t', String(part), '-i', wav, '-c:a', 'pcm_s16le', f]);
    const body = fs.readFileSync(f);
    for (let tries = 0; tries < 3; tries++) {
      try {
        const r = await fetch(`${APP_URL}/api/transcribe?prompt=${encodeURIComponent(PROMPT[job.genre] || '')}`, { method: 'POST', headers: { 'content-type': 'audio/wav' }, body });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || r.status);
        for (const w of j.words || []) words.push({ w: w.w, s: w.s + k * part, e: w.e + k * part });
        job.words = [...words].sort((a, b) => a.s - b.s);
        live({});
        return;
      } catch (e) { if (tries === 2) log(`Đoạn ${k + 1} chép lời lỗi: ${e.message}`); await new Promise(r => setTimeout(r, 1500)); }
    }
  }));
  words.sort((a, b) => a.s - b.s);
  // Whisper hay tách số: "3" + ".8" / "3" + ",800" → ghép lại
  for (let i = 0; i < words.length - 1; i++) if (/^\d+$/.test(words[i].w) && /^[.,]\d+/.test(words[i + 1].w)) { words[i].w += words[i + 1].w.replace('.', ','); words[i].e = words[i + 1].e; words.splice(i + 1, 1); }
  job.words = words;
  log(`Nghe và chép được ${words.length} chữ`);
}

// ---------- 3. dọn bản quay thô ----------
// 3a. câu (giây gốc): tới dấu . ? ! hoặc ngừng ≥ 0,6 s, tối đa 45 chữ
export function sentencesOf(words) {
  const out = [];
  let cur = null;
  words.forEach((w, i) => {
    if (!cur || w.s - words[i - 1].e >= 0.6 || cur.n >= 45) { cur = { i: out.length, start: r2(w.s), end: r2(w.e), a: i, b: i, n: 0, text: '' }; out.push(cur); }
    cur.end = r2(w.e); cur.b = i; cur.n++;
    cur.text += (cur.text ? ' ' : '') + String(w.w).trim();
    if (/[.?!…]$/.test(String(w.w).trim())) cur = null;
  });
  return out;
}
// 3b. độ lớn tiếng từng 50 ms → ngưỡng lặng TỰ ĐO theo ồn nền (ngưỡng cố định -34 dB không cắt được gì khi quay ngoài đường)
async function loudness(wav) {
  const { out } = await run('ffmpeg', ['-v', 'error', '-i', wav, '-af', 'highpass=f=150,lowpass=f=5000,asetnsamples=n=800,astats=metadata=1:reset=1,ametadata=mode=print:key=lavfi.astats.Overall.RMS_level:file=-', '-f', 'null', '-']);
  const fr = [];
  let t = null;
  for (const l of out.split(/\r?\n/)) {
    const a = l.match(/pts_time:([\d.]+)/), b = l.match(/RMS_level=(-?[\d.]+|-inf)/);
    if (a) t = +a[1];
    if (b && t != null) fr.push({ t, db: b[1] === '-inf' ? -120 : +b[1] });
  }
  return fr;
}
function silences(fr, minDur = 0.35) {
  if (fr.length < 20) return { sil: [], thr: null };
  const v = fr.map(f => f.db).filter(x => x > -100).sort((a, b) => a - b);
  const pct = p => v[Math.min(v.length - 1, Math.floor(p * v.length))];
  const noise = pct(0.1), speech = pct(0.85);
  const thr = noise + Math.max(4, (speech - noise) * 0.4);
  const sil = [];
  let s0 = null;
  for (const f of fr) {
    if (f.db < thr) { if (s0 == null) s0 = f.t; }
    else if (s0 != null) { if (f.t - s0 >= minDur) sil.push([s0, f.t]); s0 = null; }
  }
  const end = fr[fr.length - 1].t + 0.05;
  if (s0 != null && end - s0 >= minDur) sil.push([s0, end]);
  return { sil, thr: r2(thr), noise: r2(noise), speech: r2(speech) };
}
// 3c. lời ra hiệu cho ekip, chào lặp, "ờ/à" đứng riêng — không cần AI
const CUE = /^(lai nha|lai nhe|lam lai|quay lai|noi lai|cat cat|cat di|cat nha|em lia|xong chi buoc|xong em buoc|duoc chua|ok roi nha|lai tu dau|quay lai nha)/;
const FILLER = /^(ờ+|ơ+|à+|ừ+|ừm+|ờm+|ừa|hmm+|um+|uh+)$/i;
function localCuts(ss, words) {
  const out = [];
  const norm = t => plain(t).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  ss.forEach((x, i) => {
    if (x.n <= 7 && CUE.test(norm(x.text))) out.push({ from: i, to: i, why: 'ekip', note: `lời nói với người quay: “${x.text}”` });
    else if (i > 0 && x.n <= 4 && x.start - ss[i - 1].end < 1.5 && norm(x.text).replace(/ /g, '') === norm(ss[i - 1].text).replace(/ /g, '')) out.push({ from: i, to: i, why: 'lap', note: `chào lặp: “${x.text}”` });
  });
  const fill = [];
  words.forEach((w, i) => {
    const raw = String(w.w).trim().replace(/[.,!?…]/g, '');
    const gl = i ? w.s - words[i - 1].e : 9, gr = i + 1 < words.length ? words[i + 1].s - w.e : 9;
    if (FILLER.test(raw) && gl >= 0.2 && gr >= 0.2) fill.push([(i ? words[i - 1].e : 0) + 0.12, (i + 1 < words.length ? words[i + 1].s : w.e + 0.3) - 0.08]);
  });
  return { drops: out, fill };
}
export async function analyze(job, log, live) {
  job.sentences = sentencesOf(job.words || []);
  const { drops, fill } = localCuts(job.sentences, job.words || []);
  job.autoDrops = drops;
  job.fillCuts = fill;
  const wav = path.join(job.dir, 'voice.wav');
  const fr = fs.existsSync(wav) ? await loudness(wav) : [];
  const s = silences(fr);
  job.silences = s.sil;
  // tiếng nói mà Whisper KHÔNG chép ra chữ, nằm giữa 2 chữ (nói vấp, nói lặp bị Whisper bỏ — vd “đăng ký kênh… đăng ký kênh”) → cắt
  const W = job.words || [];
  job.mumbleCuts = [];
  // (Whisper hay “kéo dài” chữ cuối qua đoạn nói vấp: chữ dài > 1,2 s → chỉ tính 0,5 s đầu là chữ, phần sau xét như khoảng trống)
  if (s.thr != null) for (let i = 0; i + 1 < W.length; i++) {
    const a = W[i].e - W[i].s > 1.2 ? W[i].s + 0.5 : W[i].e, b = W[i + 1].s, gap = b - a;
    if (gap < 0.9 || gap > 6) continue;
    const fs_ = fr.filter(f => f.t >= a + 0.1 && f.t <= b - 0.1);
    const loud = fs_.filter(f => f.db > s.thr).length / Math.max(1, fs_.length);
    if (loud >= 0.4) job.mumbleCuts.push([a + 0.12, b - 0.1]);
  }
  job.silInfo = { thr: s.thr, noise: s.noise, speech: s.speech };
  live({ phase: 'cut' });
  log(`Đo ồn nền ${s.noise ?? '—'} dB, ngưỡng lặng ${s.thr ?? '—'} dB → ${s.sil.length} khoảng lặng${drops.length ? `, ${drops.length} câu nói với người quay / lặp` : ''}${fill.length ? `, ${fill.length} tiếng “ờ/à”` : ''}${job.mumbleCuts.length ? `, ${job.mumbleCuts.length} chỗ nói vấp không thành lời` : ''}`);
}

// ---------- 4. AI lập kế hoạch (dọn nói lại + chữ + cảnh phụ) ----------
export async function plan(job, log, live) {
  const brief = {
    genre: job.genre, genreName: GENRES[job.genre]?.name, format: job.format,
    sentences: job.sentences.map(({ i, start, end, text }) => ({ i, start, end, text })),
    auto_cut: job.autoDrops.map(d => ({ i: d.from, why: d.why })),
    brolls: job.media.filter(x => !x.main).map(x => ({ file: x.file, dur: r2(x.dur), name: x.name, parts: (x.parts || []).map(p => ({ from: p.from, to: p.to, thay: p.thay || '' })) })),
    icons: ICON_KEYS, emojis: EMOJI, cta_default: GENRES[job.genre]?.cta,
    target: { texts: Math.max(4, Math.round(keptGuess(job) / 5)), brolls_every_s: 8 },
  };
  wr(path.join(job.dir, 'brief.json'), brief);
  live({ phase: 'plan' });
  let p = null;
  if (aiMode() !== 'local' && brief.sentences.length) {
    try {
      p = await askAI(job, 'plan', brief, partial => live({ draft: partial }), log);
    } catch (e) { log(`AI lỗi → dùng bộ dựng dự phòng (${e.message})`); }
  }
  if (!p) { p = localPlan(brief); job.ai = 'bộ dựng dự phòng'; }
  wr(path.join(job.dir, 'plan.json'), p);
  return p;
}

// Bộ dựng dự phòng (không cần AI): bắt giá, con số, ý chính theo luật
const PRICE_RE = /(\d+(?:[.,]\d+)?)\s*(tỷ|tỉ|triệu|nghìn|ngàn|k)\b(?:\s*(\d{1,3}))?/i;
const NUM_RE = /(\d+(?:[.,]\d+)?)\s*(m2|m²|mét vuông|phòng|lầu|tầng|%|phút|bước|mẹo|km)/i;
export function localPlan(b) {
  const keep = b.sentences.filter(s => !b.auto_cut.some(c => c.i === s.i));
  const texts = [];
  const t0 = keep[0]?.start ?? 0, tEnd = keep[keep.length - 1]?.end ?? 0;
  const free = (s, d) => s > t0 + 2.5 && s + d < tEnd - 2 && !texts.some(t => s < t.start + t.dur + 0.3 && t.start < s + d + 0.3);
  for (const s of keep) {
    const pm = s.text.match(PRICE_RE), nm = s.text.match(NUM_RE);
    const at = m => r2(s.start + (s.end - s.start) * (s.text.indexOf(m[0]) / Math.max(1, s.text.length)));
    if (pm) {
      const unit = pm[2].toLowerCase().replace('tỉ', 'tỷ');
      const st = at(pm);
      if (free(st, 2.4)) texts.push({ tpl: 'price-red', start: st, dur: 2.4, lead: 'GIÁ', text: `${pm[1]}${pm[3] ? ',' + pm[3] : ''} ${unit.toUpperCase()}`, sub: /sổ hồng/i.test(s.text) ? 'sổ hồng riêng' : '', icon: 'money', why: 'người nói nhắc giá' });
    } else if (nm) {
      const st = at(nm), u = nm[2].toLowerCase();
      const txt = /m2|m²|mét vuông/.test(u) ? `${nm[1]} M²` : `${nm[1]} ${u.toUpperCase()}`;
      if (free(st, 2.4)) texts.push({ tpl: 'spec-gold', start: st, dur: 2.4, lead: /m2|m²|mét/.test(u) ? 'DIỆN TÍCH' : '', text: txt, sub: '', icon: /m2|m²|mét/.test(u) ? 'ruler' : 'check', why: 'người nói nhắc con số' });
    }
  }
  for (const s of keep) {
    const w = s.text.replace(/[.,!?]/g, '').split(/\s+/).filter(Boolean);
    if (w.length >= 3 && free(s.start + 0.1, 2.2) && texts.length < (tEnd - t0) / 5) {
      texts.push({ tpl: 'key-pop', start: r2(s.start + 0.1), dur: 2.2, lead: '', text: w.slice(0, 4).join(' ').toUpperCase().replace(/(\S+)$/, '*$1*'), sub: '', icon: '', why: 'ý chính đầu câu' });
    }
  }
  texts.sort((a, c) => a.start - c.start);
  const slots = keep.slice(1, -1);
  const brolls = b.brolls.map((x, i) => {
    const s = slots[Math.floor(((i + 0.5) * slots.length) / Math.max(1, b.brolls.length))];
    return { file: x.file, start: r2(s ? s.start : t0 + 2), dur: r2(Math.min(2.6, x.dur - 0.3)), from: 0.3, tpl: i % 2 ? 'fade' : 'whip', why: 'rải đều ở đầu câu' };
  });
  const first = (keep[0]?.text || 'VIDEO MỚI').replace(/[.,!?]/g, '').split(/\s+/).slice(0, 4).join(' ').toUpperCase();
  return { drop: [], hook: { text: first, sub: '', why: 'câu mở đầu' }, texts, brolls, cta: b.cta_default };
}

// ---------- 5. chốt chỗ cắt + đổi kế hoạch sang giờ timeline ----------
// Kiểm lại đoạn AI bảo bỏ (giống app): số trong đoạn bỏ phải còn ở phần giữ; nói lại ≥ 50 % chữ có lại; ekip ≤ 12 chữ/câu; tổng ≤ 45 % lời
function checkDrops(ss, cand) {
  const toks = t => plain(t).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(x => x.length > 1);
  const nums = t => String(t).match(/\d+/g) || [];
  const list = cand.map(c => ({ i: Math.max(0, Math.floor(+c.from)), j: Math.min(ss.length - 1, Math.floor(+(c.to ?? c.from))), why: ['noi_lai', 'ekip', 'lap'].includes(c.why) ? c.why : 'noi_lai', note: String(c.note || '').slice(0, 160) }))
    .filter(c => c.j >= c.i && ss[c.i]);
  const inCut = k => list.some(c => k >= c.i && k <= c.j);
  const keptText = ss.filter((_, k) => !inCut(k)).map(x => x.text).join(' ');
  const keptToks = new Set(toks(keptText)), keptNums = new Set(nums(keptText));
  const speech = ss.length ? ss[ss.length - 1].end - ss[0].start : 0;
  const ok = [];
  let total = 0;
  for (const c of list.sort((a, b) => a.i - b.i)) {
    const seg = ss.slice(c.i, c.j + 1), text = seg.map(x => x.text).join(' '), tk = toks(text);
    if (nums(text).some(n => !keptNums.has(n))) continue;
    if (c.why === 'ekip' && seg.some(x => x.n > 12)) continue;
    if (c.why === 'noi_lai' && tk.length > 5 && tk.filter(x => keptToks.has(x)).length / tk.length < 0.5) continue;
    const a = c.i ? Math.max(ss[c.i - 1].end + 0.12, ss[c.i].start - 0.15) : Math.max(0, ss[c.i].start - 0.15);
    const b = c.j + 1 < ss.length ? Math.min(ss[c.j + 1].start - 0.08, ss[c.j].end + 1.5) : ss[c.j].end + 0.4;
    if (b - a <= 0.15 || b - a > 90 || total + (b - a) > speech * 0.45) continue;
    total += b - a;
    ok.push({ a: r2(a), b: r2(b), why: c.why, note: c.note || text.slice(0, 80), text: text.slice(0, 120) });
  }
  return ok;
}

export function finalize(job, p) {
  const m = job.media.find(x => x.main), D0 = m.dur, ss = job.sentences;
  // chỗ bỏ = lặng + ờ/à + câu máy tự bắt + câu AI chỉ ra (đã kiểm)
  const drops = checkDrops(ss, [...job.autoDrops, ...(p.drop || [])]);
  job.drops = drops;
  // lời đang giữ: không cắt lặng xuyên qua lõi chữ (Whisper hay kéo dài chữ qua chỗ nghỉ → chỉ lấy lõi chữ ngắn)
  const inDrop = t => drops.some(d => t >= d.a && t <= d.b);
  // giữ trọn chữ (Whisper hay báo chữ sau chỗ nghỉ SỚM 0,3 s → để dư còn hơn cắt mất đầu chữ); chữ dài > 1,2 s là Whisper kéo qua chỗ nghỉ → chỉ giữ 0,4 s đầu
  const cores = (job.words || []).filter(w => !inDrop((w.s + w.e) / 2)).map(w => [w.s - 0.03, w.e - w.s < 1.2 ? w.e + 0.03 : w.s + 0.4]);
  let cut = [...job.silences.map(([a, b]) => [a + 0.1, b - 0.15]), ...job.fillCuts, ...(job.mumbleCuts || []), ...drops.map(d => [d.a, d.b])].filter(([a, b]) => b - a > 0.15);
  // lặng chồng lõi chữ → bỏ phần chồng
  cut = cut.flatMap(([a, b]) => {
    let parts = [[a, b]];
    for (const [x, y] of cores) parts = parts.flatMap(([u, v]) => (y <= u || x >= v ? [[u, v]] : [[u, x], [y, v]].filter(([p1, p2]) => p2 - p1 > 0.15)));
    return parts;
  }).sort((x, y) => x[0] - y[0]);
  const merged = [];
  for (const c of cut) { const l = merged[merged.length - 1]; if (l && c[0] <= l[1] + 0.05) l[1] = Math.max(l[1], c[1]); else merged.push([...c]); }
  // trước câu đầu + sau câu cuối cũng bỏ
  const firstS = ss.find(s => !inDrop(s.start + 0.01)), lastS = [...ss].reverse().find(s => !inDrop(s.end - 0.01));
  if (firstS && firstS.start > 0.5) merged.unshift([0, firstS.start - 0.15]);
  if (lastS && D0 - lastS.end > 0.8) merged.push([lastS.end + 0.4, D0]);
  merged.sort((x, y) => x[0] - y[0]);
  for (let i = merged.length - 1; i > 0; i--) if (merged[i][0] <= merged[i - 1][1] + 0.05) { merged[i - 1][1] = Math.max(merged[i - 1][1], merged[i][1]); merged.splice(i, 1); }
  const keep = [];
  let t = 0;
  for (const [a, b] of merged) { if (a > t + 0.18) keep.push([t, Math.min(a, D0)]); t = Math.max(t, b); }
  if (t < D0 - 0.1) keep.push([t, D0]);
  let segs = keep.filter(([a, b]) => b - a >= 0.25);
  if (!segs.length || segs.reduce((s, [a, b]) => s + b - a, 0) < D0 * 0.3) segs = [[0, D0]]; // chốt an toàn
  let tl = 0;
  job.segs = segs.map(([a, b]) => { const s = { src: r2(a), end: r2(b), tl: r2(tl) }; tl += b - a; return s; });
  job.duration = r2(tl);
  job.cuts = merged.map(([a, b]) => ({ a: r2(a), b: r2(b), why: drops.find(d => Math.abs(d.a - a) < 0.2)?.why || ((job.mumbleCuts || []).some(([x, y]) => Math.abs(x - a) < 0.3 || Math.abs(y - b) < 0.3) ? 'vap' : 'lang') }));
  const toTl = x => { const s = job.segs.find(g => x >= g.src - 0.02 && x <= g.end + 0.02); return s ? r2(s.tl + Math.max(0, x - s.src)) : null; };
  job.tlWords = (job.words || []).map(w => ({ w: w.w, s: toTl(w.s), e: toTl(w.e) })).filter(w => w.s != null && w.e != null && w.e > w.s);
  // kế hoạch giây gốc → giờ timeline (mục rơi vào chỗ đã bỏ thì dời tới đoạn giữ kế tiếp)
  const fwd = x => { if (toTl(x) != null) return toTl(x); const s = job.segs.find(g => g.src > x); return s ? s.tl : null; };
  const q = { ...p, texts: (p.texts || []).map(x => ({ ...x, start: fwd(+x.start) })).filter(x => x.start != null), brolls: (p.brolls || []).map(x => ({ ...x, start: fwd(+x.start) })).filter(x => x.start != null) };
  const T = buildTimeline(job, q);
  const removed = D0 - tl;
  return { T, removed };
}

// ---------- 6. timeline JSON (bản gốc) ----------
export function buildTimeline(job, p) {
  const D = job.duration, clips = [];
  const okT = s => Math.max(0, Math.min(s, D - 0.5)), okD = (s, d) => Math.max(0.5, Math.min(d, D - s));
  job.segs.forEach((s, i) => clips.push({ id: 'v' + i, type: 'video', track: 0, start: s.tl, dur: r2(s.end - s.src), src: 'media/aroll.mp4', mediaStart: s.src, zoom: i % 2 ? 1.12 : 1, why: i ? 'nối đoạn, zoom xen kẽ che chỗ cắt' : 'video chính' }));
  const bUsed = [];
  (p.brolls || []).sort((a, b) => a.start - b.start).forEach((b, i) => {
    const m = job.media.find(x => x.file === b.file && !x.main);
    if (!m) return;
    const st = okT(+b.start), from = Math.max(0, Math.min(+b.from || 0, m.dur - 0.6));
    if (bUsed.some(([x, y]) => st < y + 0.3 && x < st + (+b.dur || 2.4))) return; // không chồng cảnh phụ
    bUsed.push([st, st + (+b.dur || 2.4)]);
    clips.push({ id: 'b' + i, type: 'broll', track: 1, start: r2(st), dur: r2(okD(st, Math.min(+b.dur || 2.4, m.dur - from))), src: 'media/' + b.file, mediaStart: r2(from), tpl: b.tpl === 'fade' ? 'fade' : 'whip', name: m.name, why: b.why || '' });
  });
  const hookDur = Math.min(2.4, D * 0.3);
  if (p.hook?.text) clips.push({ id: 'hook', type: 'text', track: 2, start: 0.1, dur: r2(hookDur), tpl: 'hook-band', props: { text: p.hook.text, sub: p.hook.sub || '' }, why: p.hook.why || 'tiêu đề mở đầu' });
  let lastEnd = 0.1 + hookDur;
  (p.texts || []).filter(t => ['price-red', 'spec-gold', 'key-pop'].includes(t.tpl)).sort((a, b) => a.start - b.start).forEach((t, i) => {
    let st = Math.max(+t.start || 0, lastEnd + 0.3), d = Math.min(Math.max(+t.dur || 2.2, 1.6), 3.2);
    if (st + d > D - 2.3) { d = D - 2.3 - st; if (d < 1.4) return; }
    clips.push({ id: 't' + i, type: 'text', track: 2, start: r2(st), dur: r2(d), tpl: t.tpl, props: { lead: t.lead || '', text: t.text, sub: t.sub || '' }, why: t.why || '' });
    // mỗi chữ ≤ 1 hình đi kèm, nằm TRONG khối chữ (phía trên) để không bao giờ che chữ; ưu tiên emoji 3D động
    if (t.emoji && EMOJI[t.emoji]) clips.push({ id: 'i' + i, type: 'icon', track: 3, start: r2(st + 0.15), dur: r2(d - 0.15), tpl: 'emoji', attach: 't' + i, props: { emoji: t.emoji }, why: `emoji “${EMOJI[t.emoji]}” đi kèm chữ` });
    else if (t.icon && ICON_KEYS.includes(t.icon)) clips.push({ id: 'i' + i, type: 'icon', track: 3, start: r2(st + 0.2), dur: r2(d - 0.2), tpl: 'badge', attach: 't' + i, props: { icon: t.icon }, why: 'icon đi kèm chữ' });
    lastEnd = st + d;
  });
  const ctaS = Math.min(Math.max(lastEnd + 0.2, D - 2.2), D - 1.2);
  clips.push({ id: 'cta', type: 'text', track: 2, start: r2(ctaS), dur: r2(D - ctaS), tpl: 'cta', props: { text: p.cta || GENRES[job.genre]?.cta }, why: 'câu kêu gọi cuối video' });
  // phụ đề: ≤ 3 chữ / dòng, ≤ 16 ký tự, xuống dòng ở dấu câu
  const lines = [];
  let cur = [];
  for (const w of job.tlWords || []) {
    const txt = [...cur, w].map(x => x.w).join(' ');
    if (cur.length && (cur.length >= 3 || txt.length > 16 || w.s - cur[cur.length - 1].e > 0.5 || /[.?!,]$/.test(cur[cur.length - 1].w))) { lines.push(cur); cur = []; }
    cur.push(w);
  }
  if (cur.length) lines.push(cur);
  lines.forEach((l, i) => {
    const s = l[0].s, e = Math.max(l[l.length - 1].e, s + 0.4), next = lines[i + 1]?.[0].s ?? D;
    clips.push({ id: 's' + i, type: 'subs', track: 4, start: r2(s), dur: r2(Math.max(0.3, Math.min(e + 0.25, next) - s)), tpl: 'karaoke', props: { words: l.map(w => ({ w: w.w.replace(/[.,!?]+$/, ''), s: r2(w.s) })) } });
  });
  // âm thanh: vút khi cảnh phụ / hook, ting khi giá, bụp khi chữ
  let sn = 0;
  const sfx = (kind, t) => clips.push({ id: 'x' + sn++, type: 'sfx', track: 5 + (sn % 2), start: r2(Math.max(0, t)), dur: kind === 'ding' ? 0.6 : 0.45, src: `kit/${kind}.wav`, vol: kind === 'ding' ? 0.55 : 0.6, why: 'âm thanh nhấn' });
  sfx('whoosh', 0.05);
  for (const c of [...clips]) {
    if (c.type === 'broll') sfx('whoosh', c.start - 0.05);
    if (c.tpl === 'price-red') sfx('ding', c.start + 0.35);
    if (c.tpl === 'spec-gold' || c.tpl === 'key-pop') sfx('pop', c.start + 0.08);
  }
  return { format: job.format, genre: job.genre, duration: r2(D), fps: 30, clips };
}

// Thứ tự thao tác cho con trỏ AI diễn lại (giống người dựng thật)
export function opsForCursor(T) {
  const order = ['broll', 'text', 'icon', 'sfx'];
  const label = { broll: 'Ghép cảnh phụ', text: 'Thêm chữ', icon: 'Gắn icon', sfx: 'Thêm âm thanh' };
  return T.clips.filter(c => order.includes(c.type))
    .sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type) || a.start - b.start)
    .map(c => ({ op: 'add', id: c.id, say: c.props?.emoji ? `Gắn emoji động “${EMOJI[c.props.emoji] || c.props.emoji}”` : `${label[c.type]}${c.props?.text ? ' “' + c.props.text.replace(/\*/g, '') + '”' : c.name ? ' “' + c.name + '”' : ''}`, why: c.props?.emoji ? 'đi kèm chữ, nằm phía trên để không che chữ' : c.why || '' }))
    .concat([{ op: 'add', id: 's*', say: 'Thêm phụ đề karaoke', why: 'chữ đang nói sáng lên' }]);
}

// ---------- 7. ghi index.html HyperFrames ----------
export function writeComposition(job) {
  const T = rd(path.join(job.dir, 'timeline.json'));
  fs.mkdirSync(path.join(job.dir, 'kit', 'fonts'), { recursive: true });
  for (const f of ['gsap.min.js', 'whoosh.wav', 'ding.wav', 'pop.wav']) fs.copyFileSync(path.join(KIT, f), path.join(job.dir, 'kit', f));
  for (const f of fs.readdirSync(path.join(KIT, 'fonts'))) fs.copyFileSync(path.join(KIT, 'fonts', f), path.join(job.dir, 'kit', 'fonts', f));
  fs.mkdirSync(path.join(job.dir, 'kit', 'emoji'), { recursive: true });
  for (const f of fs.readdirSync(path.join(KIT, 'emoji'))) if (f.endsWith('.svg')) fs.copyFileSync(path.join(KIT, 'emoji', f), path.join(job.dir, 'kit', 'emoji', f));
  fs.writeFileSync(path.join(job.dir, 'index.html'), build(T));
}

// ---------- 7b. chữ SAU người nói: tách nền người nói đúng đoạn có chữ, đặt lớp người đè lên chữ ----------
export async function makeCutouts(job, T, log) {
  const want = T.clips.filter(c => c.type === 'text' && c.props?.behind);
  // bỏ lớp người cũ của chữ không còn “sau người” / đã đổi giờ
  T.clips = T.clips.filter(c => c.type !== 'cutout' || want.some(t => t.id === c.of && t.start === c.tStart && t.dur === c.tDur));
  for (const t of want) {
    if (T.clips.some(c => c.type === 'cutout' && c.of === t.id)) continue;
    const a0 = t.start, a1 = t.start + t.dur;
    const vids = T.clips.filter(c => c.type === 'video' && c.start < a1 && c.start + c.dur > a0);
    let k = 0;
    for (const v of vids) {
      const s0 = Math.max(a0, v.start), s1 = Math.min(a1, v.start + v.dur);
      if (s1 - s0 < 0.2) continue;
      const id = `k_${t.id}_${k++}`, src = `media/${id}-src.mp4`, out = `media/${id}.webm`;
      const t0 = Date.now();
      await slot('cpu', async () => {
        await run('ffmpeg', ['-y', '-v', 'error', '-ss', String(v.mediaStart + (s0 - v.start)), '-t', String(s1 - s0), '-i', path.join(job.dir, 'media', 'aroll.mp4'), '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', path.join(job.dir, src)]);
        await run('npx', ['hyperframes', 'remove-background', src, '-o', out, '--quality', 'balanced'], { cwd: job.dir, timeout: 15 * 60000 });
      });
      // zoom của đoạn video bên dưới (1 → +0,04 suốt đoạn) — lớp người phải zoom y hệt để khớp
      const z = v.zoom || 1, zAt = x => z + 0.04 * ((x - v.start) / v.dur);
      T.clips.push({ id, type: 'cutout', track: 2, start: r2(s0), dur: r2(s1 - s0), src: out, of: t.id, tStart: t.start, tDur: t.dur, z0: zAt(s0), z1: zAt(s1), why: 'tách người nói khỏi nền để chữ nằm sau người' });
      log && log(`Tách người nói khỏi nền ${r2(s1 - s0)} s cho chữ “${String(t.props.text).replace(/\*/g, '')}” · ${Math.round((Date.now() - t0) / 1000)} s`);
    }
  }
}

// ---------- 8. chat sửa ----------
export async function chat(job, text, target, log) {
  const T = rd(path.join(job.dir, 'timeline.json'));
  const slim = T.clips.filter(c => c.type !== 'subs' && c.type !== 'sfx').map(({ id, type, tpl, start, dur, props, name }) => ({ id, type, tpl, start, dur, props, name }));
  const input = { request: text, target: target || '', timeline: slim, icons: ICON_KEYS, emojis: EMOJI, duration: T.duration };
  let ops = null;
  if (aiMode() !== 'local') {
    try { ops = await askAI(job, 'chat', input, null, log); }
    catch (e) { log && log(`AI lỗi → hiểu lệnh bằng bộ dự phòng (${e.message})`); }
  }
  if (!Array.isArray(ops)) ops = localCommand(text, target, T);
  const applied = applyOps(T, ops);
  await makeCutouts(job, T, log);
  wr(path.join(job.dir, 'timeline.json'), T);
  writeComposition(job);
  return applied;
}

export function applyOps(T, ops) {
  const done = [];
  for (const o of ops || []) {
    if (o.op === 'update') {
      const c = T.clips.find(x => x.id === o.id);
      if (!c) continue;
      if (o.props) c.props = { ...(c.props || {}), ...o.props };
      for (const k of ['start', 'dur']) if (isFinite(+o[k]) && o[k] !== null && o[k] !== '') c[k] = r2(Math.max(0, +o[k]));
      if (o.tpl && ['price-red', 'spec-gold', 'key-pop', 'hook-band', 'cta'].includes(o.tpl)) c.tpl = o.tpl;
      c.locked = true;
      done.push({ ...o, say: o.why || `Sửa ${c.id}` });
    } else if (o.op === 'remove') {
      const n = T.clips.length;
      T.clips = T.clips.filter(x => x.id !== o.id && x.attach !== o.id);
      if (T.clips.length < n) done.push({ ...o, say: o.why || `Xoá ${o.id}` });
    } else if (o.op === 'add' && o.clip) {
      const c = { track: 2, type: 'text', tpl: 'key-pop', props: {}, ...o.clip, id: o.clip.id || 'u' + Date.now().toString(36) + done.length };
      if (!isFinite(+c.start) || !isFinite(+c.dur)) continue;
      T.clips.push(c);
      done.push({ op: 'add', id: c.id, say: o.why || `Thêm ${c.props?.text || c.tpl}` });
    }
  }
  return done;
}

// hiểu vài lệnh đơn giản khi không có AI
const COLORS = { 'xanh lá': 'green', xanh: 'blue', 'đỏ': 'red', 'vàng': 'gold' };
export function localCommand(text, target, T) {
  const t = text.toLowerCase();
  const tgt = T.clips.find(c => c.id === target) || (/giá/.test(t) && T.clips.find(c => c.tpl === 'price-red')) || T.clips.find(c => c.tpl === 'hook-band');
  if (!tgt) return [];
  if (/xoá|xóa|bỏ/.test(t) && !/sau/.test(t)) return [{ op: 'remove', id: tgt.id, why: 'khách nhờ xoá' }];
  const extra = {};
  if (/sau (nhân vật|người|đầu)|ẩn sau|núp sau/.test(t)) extra.behind = true;
  if (/(chữ|hook).{0,12}(to|lớn|khủng)|to hơn|ấn tượng/.test(t)) extra.big = true;
  if (/(icon|emoji|biểu tượng).{0,20}(to|lớn|nửa)/.test(t)) { extra.emoji = tgt.props?.emoji || (/giá|tiền/.test(t) ? 'money-bag' : 'house-with-garden'); extra.emojiSize = 'big'; }
  const col = Object.keys(COLORS).find(k => t.includes(k));
  const m = text.match(/(?:thành|là)\s+["“]?([^"”]+)["”]?\s*$/i);
  const props = {};
  if (col) props.color = tgt.tpl === 'price-red' ? COLORS[col] : { green: '#6dff8a', blue: '#5cc8ff', red: '#ff5a4e', gold: '#ffd84a' }[COLORS[col]];
  if (m) props.text = m[1].trim().toUpperCase();
  Object.assign(props, extra);
  if (extra.behind || extra.big) Object.assign(props, { color: props.color });
  if (!props.color) delete props.color;
  const NAME = { color: 'màu', text: 'chữ', behind: 'đặt sau người nói', big: 'chữ to', emoji: 'icon', emojiSize: 'icon to nửa khung' };
  const longer = extra.big && tgt.dur < 3 ? { dur: 3 } : {};
  return Object.keys(props).length ? [{ op: 'update', id: tgt.id, props, ...longer, why: `${[...new Set(Object.keys(props).map(k => NAME[k]).filter(Boolean))].join(' + ')} theo lời khách` }] : [];
}

// ---------- 9. render MP4 (giới hạn số video xuất cùng lúc) ----------
export async function render(job, onPct, onQueue) {
  const out = path.join(job.dir, 'out.mp4');
  fs.rmSync(out, { force: true });
  const lowMem = process.env.XUONG_LOWMEM === '1' ? [] : ['--no-low-memory-mode'];
  await slot('render', () => run('npx', ['hyperframes', 'render', '--sdr', ...lowMem, '--experimental-fast-capture', '-o', 'out.mp4'], {
    cwd: job.dir, timeout: 30 * 60000,
    onLine: l => { const m = l.match(/(\d{1,3})%/); if (m) onPct(+m[1]); },
  }), onQueue);
  return out;
}

export { SIZES };
