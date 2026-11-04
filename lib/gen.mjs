// Timeline JSON (bản gốc) -> index.html HyperFrames. Mỗi clip = 1 phần tử có giờ; "tpl" chọn mẫu trong kho.
import fs from 'node:fs';
import path from 'node:path';
import { STYLES } from './styles.mjs';

export const SIZES = { '9:16': [1080, 1920], '4:5': [1080, 1350], '1:1': [1080, 1080], '16:9': [1920, 1080] };

// Màu theo ngành: nhấn, huy hiệu icon, nút kết
export const GENRES = {
  chung:    { name: 'Chung',         acc: '#D1FE17', badge: ['#7c5cff', '#4b2bd6'], cta: 'THEO DÕI ĐỂ XEM THÊM' },
  bds:      { name: 'Bất động sản',  acc: '#D1FE17', badge: ['#ff8a3d', '#ff3d6a'], cta: 'NHẮN TIN XEM NHÀ NGAY' },
  banhang:  { name: 'Bán hàng',      acc: '#ffd84a', badge: ['#ff3d6a', '#c8101e'], cta: 'NHẮN TIN ĐẶT HÀNG NGAY' },
  amthuc:   { name: 'Ẩm thực',       acc: '#ffb13d', badge: ['#ff7a1a', '#d94800'], cta: 'LƯU LẠI ĐỂ NẤU THỬ' },
  kienthuc: { name: 'Kiến thức',     acc: '#5ce1ff', badge: ['#2f80ff', '#1746b8'], cta: 'THEO DÕI ĐỂ HỌC THÊM' },
  vlog:     { name: 'Vlog',          acc: '#ff6ad5', badge: ['#ff6ad5', '#8a2be2'], cta: 'THEO DÕI MÌNH NHÉ' },
};

export const ICONS = {
  house: '<path d="M8 30 32 10l24 20"/><path d="M14 26v26h36V26"/><path d="M27 52V38h10v14"/>',
  ruler: '<rect x="6" y="22" width="52" height="20" rx="3"/><path d="M16 22v8M26 22v11M36 22v8M46 22v11"/>',
  money: '<rect x="6" y="16" width="52" height="32" rx="5"/><circle cx="32" cy="32" r="8"/><path d="M14 24v16M50 24v16"/>',
  pin: '<path d="M32 58S12 38 12 25a20 20 0 0 1 40 0c0 13-20 33-20 33z"/><circle cx="32" cy="25" r="7"/>',
  key: '<circle cx="20" cy="32" r="10"/><path d="M30 32h26M48 32v10M56 32v7"/>',
  car: '<path d="M8 40l6-16h36l6 16v10H8z"/><circle cx="18" cy="50" r="5"/><circle cx="46" cy="50" r="5"/>',
  star: '<path d="M32 8l7 16 17 2-13 11 4 17-15-9-15 9 4-17L8 26l17-2z"/>',
  check: '<path d="M12 34l13 13 27-29"/>',
  fire: '<path d="M32 58c-11 0-18-8-18-17 0-12 12-18 12-30 8 6 10 12 10 17 3-3 4-6 4-9 7 6 10 13 10 22 0 9-7 17-18 17z"/>',
  cart: '<path d="M6 10h9l7 32h28l6-22H18"/><circle cx="26" cy="52" r="4"/><circle cx="46" cy="52" r="4"/>',
  clock: '<circle cx="32" cy="32" r="24"/><path d="M32 18v15l10 6"/>',
  bulb: '<path d="M22 40c-6-5-9-10-9-17a19 19 0 0 1 38 0c0 7-3 12-9 17v8H22z"/><path d="M24 56h16"/>',
  heart: '<path d="M32 54S8 40 8 23a12 12 0 0 1 24-4 12 12 0 0 1 24 4c0 17-24 31-24 31z"/>',
  gift: '<rect x="8" y="24" width="48" height="10"/><path d="M12 34v22h40V34M32 24v32M32 24c-6-12-18-10-14-2M32 24c6-12 18-10 14-2"/>',
};
export const ICON_KEYS = Object.keys(ICONS);
const PRICE = { red: ['#ffd2c8', '#ff5a4e', '#c8101e'], green: ['#dcffe3', '#6dff8a', '#0f9b3a'], gold: ['#fff6c8', '#ffe36e', '#e0a100'], blue: ['#d8f1ff', '#5cc8ff', '#1462c8'] };
export const DEFAULT_GRADE = { sat: 1.15, bri: 1.10, con: 1.05, sharp: 0.10 };
export const TEXT_TPLS = ['hook-band', 'key-pop', 'spec-gold', 'price-red', 'list', 'stat', 'quote', 'cta', 'cta-follow'];

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const r3 = n => Math.round(n * 1000) / 1000;

export function build(T) {
  const [W, H] = SIZES[T.format] || SIZES['9:16'];
  // phong cách theo ngành (lib/styles.mjs): màu nhấn, font, kiểu chữ chạy, phụ đề, zoom — mỗi video 1 phong cách thống nhất
  const SY = STYLES[T.style] || null;
  const G = { ...(GENRES[T.genre] || GENRES.chung), ...(SY ? { acc: SY.acc, badge: SY.badge } : {}) };
  const ANIM = SY?.anim || 'pop', SUBL = SY?.subs?.look || 'stroke';
  // CHỈNH MÀU TỰ ĐỘNG (4/11 Giang): bão hoà +15 %, sáng +10 %, tương phản +5 % cho mọi video / cảnh phụ / lớp người tách nền
  // (độ nét +10 % làm 1 lần lúc đổi file — xem pipeline transcode). T.grade sửa được qua chat; {off:true} = tắt.
  const gr = { ...DEFAULT_GRADE, ...(T.grade || {}) };
  // kiểu phụ đề / chữ / âm thanh khách chỉnh qua chat: T.subs {hide, scale, pos: top|mid|bottom, color, mode: word|meaning}
  // T.textStyle {scale, color} (mọi chữ điểm nhấn) · T.sfx {vol, off}
  const SB = T.subs || {}, TS = T.textStyle || {}, SX = T.sfx || {};
  const subTop = { top: 60, mid: 60, bottom: 67, low: 72 }[SB.pos] ?? null; // không cho lên trên cùng (chỗ chữ điểm nhấn) → “trên” = 60 % // “giữa” = 60 % (49–58 % là chỗ của nhãn)
  const GF = gr.off ? 'none' : `saturate(${r3(gr.sat)}) brightness(${r3(gr.bri)}) contrast(${r3(gr.con)})${+gr.warm > 0 ? ` sepia(${r3(gr.warm)})` : ''}`;
  const attrs = c => `id="${c.id}" class="clip" data-start="${r3(c.start)}" data-duration="${r3(c.dur)}" data-track-index="${c.track}" data-tpl="${c.tpl || c.type}"`;
  // hình đi kèm chữ (icon / emoji) vẽ NGAY TRONG khối chữ, phía trên → không bao giờ che chữ
  // phụ đề trùng lúc chữ cực to (hook to) thì hạ xuống thấp cho khỏi đè
  const bigSpans = T.clips.filter(c => c.type === 'text' && c.props?.big).map(c => [c.start, c.start + c.dur]);
  const att = {};
  for (const c of T.clips) if (c.type === 'icon' && c.attach) att[c.attach] = c;
  const ico = c => { const a = att[c.id];
    if (a && a.tpl === 'emoji') return `<div id="${a.id}" class="ico emo${a.props.size === 'big' || c.props.emojiSize === 'big' ? ' big' : ''}"><img src="kit/emoji/${a.props.emoji}.svg" alt=""></div>`;
    if (a) return `<div id="${a.id}" class="ico badge" style="background:linear-gradient(145deg,${G.badge[0]},${G.badge[1]})"><svg viewBox="0 0 64 64" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round">${ICONS[a.props.icon] || ICONS.star}</svg></div>`;
    if (c.props?.emoji) return `<div id="${c.id}-e" class="ico emo${c.props.emojiSize === 'big' ? ' big' : ''}"><img src="kit/emoji/${esc(c.props.emoji)}.svg" alt=""></div>`;
    return ''; };
  // emoji gắn thẳng vào chữ (props.emoji, vd khách nhờ “thêm icon nhà to”) → chạy theo giờ của chữ
  const selfIco = c => (!att[c.id] && c.props?.emoji ? icoAnim({ id: `${c.id}-e`, attach: c.id, start: c.start + 0.1, dur: c.dur - 0.1 }, true, true) : []);
  // chữ to luôn VỪA khung: số/giá 1 dòng, ý chính ≤ 2 dòng — chữ dài tự co (không xuống dòng đè nhãn / phụ đề; 4/11 “SÂN TRƯỚC 8 M” 2 dòng đè nhãn)
  const ts = +TS.scale || 1;
  const fitBig = t => { const n = String(t || '').replace(/\*/g, '').length; return `font-size:${Math.round(Math.min(200 * ts, (W * 0.9) / Math.max(1, n) / 0.5))}px;white-space:nowrap;`; };
  const KB = { corporate: 96, cinematic: 76, beauty: 84, edu: 100, interview: 100, vlog: 104 }[T.style] || 112; // cỡ gốc chữ ý chính theo phong cách
  const fitKey = t => { const n = String(t || '').replace(/\*/g, '').length; return `font-size:${Math.round(Math.min(KB * ts, (W * 0.84 * 2) / Math.max(1, n) / (T.style === 'cinematic' ? 0.85 : 0.66)))}px;`; };
  const K = {
    video: {
      html: c => `<video ${attrs(c)} src="${c.src}" data-media-start="${r3(c.mediaStart || 0)}" data-has-audio="true" playsinline></video>`,
      // zoom xen kẽ ở mỗi đoạn để che chỗ cắt; “giật zoom” (punch-in) tại các mốc c.punch: nhảy +10 % rồi trôi tiếp
      anim: c => { const z = c.zoom || 1, e = c.start + c.dur, zAt = t => z + 0.04 * ((t - c.start) / c.dur);
        const pts = [c.start, ...(c.punch || []).filter(t => t > c.start && t < e), e];
        // T.punch: jump = nhảy +10 % (mạng xã hội) · smooth = đẩy máy chậm 0,9 s (+6 %, BĐS/doanh nghiệp: “hạn chế zoom giật”)
        const sm = T.punch === 'smooth', A = sm ? 0.06 : 0.1, offOf = k => (k % 2 ? (z > 1.05 ? -A : A) : 0);
        return pts.slice(0, -1).flatMap((t, k) => { const off = offOf(k), t1 = pts[k + 1], ir = k ? 'false' : 'true';
          if (sm && k && t1 - t > 1.1) return [`tl.fromTo("#${c.id}",{scale:${r3(zAt(t) + offOf(k - 1))}},{scale:${r3(zAt(t + 0.9) + off)},duration:0.9,ease:"sine.inOut",immediateRender:false},${r3(t)});`,
            `tl.fromTo("#${c.id}",{scale:${r3(zAt(t + 0.9) + off)}},{scale:${r3(zAt(t1) + off)},duration:${r3(t1 - t - 0.9)},ease:"none",immediateRender:false},${r3(t + 0.9)});`];
          return [`tl.fromTo("#${c.id}",{scale:${r3(zAt(t) + off)}},{scale:${r3(zAt(t1) + off)},duration:${r3(t1 - t)},ease:"none",immediateRender:${ir}},${r3(t)});`]; }); } },
    broll: {
      // tiếng môi trường của cảnh phụ (du lịch, ẩm thực…): T.brollVol > 0 thì nghe nhỏ dưới giọng nói
      html: c => `<video ${attrs(c)} src="${c.src}" data-media-start="${r3(c.mediaStart || 0)}" ${+T.brollVol > 0 && c.audio !== false ? `data-has-audio="true" data-volume="${r3(+T.brollVol)}"` : 'muted'} playsinline></video>`,
      // kiểu vào / ra theo kho chuyển cảnh HyperFrames (transitions-push/scale/blur/radial/dissolve) — làm lại cho video dọc
      anim: c => {
        // 4/11 19:41 Giang: “cảnh phụ ghép vào giật lag” → vào/ra MƯỢT: hoà / mờ / đẩy nhẹ 0,5 s ease sine (trước 0,28–0,42 s expo/power3,
        // zoom 1,7 → giật), ra = hoà 0,4 s (trước văng ngang 0,22 s). whip/slide/push chỉ còn ở phong cách nhanh (bán hàng, thể thao, vlog).
        const s = c.start, d = c.dur, id = `"#${c.id}"`, IN = {
          whip: [`x:${W},scale:1.12`, 'x:0,scale:1.04', 0.32, 'power3.out'],
          fade: ['opacity:0,scale:1.08', 'opacity:1,scale:1.04', 0.5, 'sine.inOut'],
          push: [`y:${H},scale:1.08`, 'y:0,scale:1.04', 0.36, 'power3.out'],
          slide: [`x:${-W},scale:1.12`, 'x:0,scale:1.04', 0.34, 'power3.out'],
          zoom: [`scale:1.22,opacity:0,filter:"${GF} blur(8px)"`, `scale:1.04,opacity:1,filter:"${GF} blur(0px)"`, 0.55, 'power2.out'],
          blur: [`opacity:0,scale:1.08,filter:"${GF} blur(16px)"`, `opacity:1,scale:1.04,filter:"${GF} blur(0px)"`, 0.55, 'power2.out'],
          radial: ['clipPath:"circle(0% at 50% 45%)",scale:1.12', 'clipPath:"circle(80% at 50% 45%)",scale:1.04', 0.5, 'power2.inOut'] }[c.tpl] || null;
        const [a, b, t, ease] = IN || ['opacity:0', 'opacity:1', 0.5, 'sine.inOut'];
        const hard = { whip: `x:${-W}`, slide: `x:${W}`, push: `y:${-H}` }[c.tpl], to = hard ? 0.26 : 0.4;
        return [`tl.fromTo(${id},{${a}},{${b},duration:${t},ease:"${ease}"},${r3(s)});`,
          `tl.to(${id},{scale:1.1,duration:${r3(Math.max(0.1, d - t - to))},ease:"none"},${r3(s + t)});`,
          `tl.to(${id},{${hard || 'opacity:0'},duration:${to},ease:"${hard ? 'power2.in' : 'sine.inOut'}"},${r3(s + d - to)});`]; } },
    'hook-band': {
      html: c => `<div ${attrs(c)}><div class="hook${c.props.big ? ' big' : ''}">${ico(c)}<div class="band" style="background:${c.props.color || G.acc}"><span>${esc(c.props.text)}</span></div>${c.props.sub ? `<div class="hsub">${esc(c.props.sub)}</div>` : ''}</div></div>`,
      anim: c => [`tl.fromTo("#${c.id} .band",{scaleX:0},{scaleX:1,duration:0.35,ease:"expo.out"},${r3(c.start)});`,
        `tl.fromTo("#${c.id} .band span",{y:60,opacity:0},{y:0,opacity:1,duration:0.35,ease:"back.out(2)"},${r3(c.start + 0.15)});`,
        c.props.sub ? `tl.fromTo("#${c.id} .hsub",{y:-30,opacity:0},{y:0,opacity:1,duration:0.3},${r3(c.start + 0.35)});` : '',
        `tl.to("#${c.id} .hook",{opacity:0,y:-40,duration:0.25},${r3(c.start + c.dur - 0.25)});`, ...selfIco(c)] },
    'key-pop': {
      html: c => `<div ${attrs(c)} style="--acc:${c.props.color || G.acc}"><div class="lock">${ico(c)}${c.props.lead ? `<div class="lead">${esc(c.props.lead)}</div>` : ''}<div class="keyw" style="${fitKey(c.props.text)}">${hl(c.props.text)}</div></div></div>`,
      anim: c => [...pop(c, ANIM === 'stamp' ? 'pop' : ANIM), ...selfIco(c)] },
    'spec-gold': {
      html: c => `<div ${attrs(c)}><div class="lock">${ico(c)}${c.props.lead ? `<div class="lead">${esc(c.props.lead)}</div>` : ''}<div class="big gold" style="${fitBig(c.props.text)}">${esc(c.props.text)}</div>${c.props.sub ? `<div class="chip">${esc(c.props.sub)}</div>` : ''}</div></div>`,
      anim: c => [...pop(c, ANIM), ...selfIco(c)] },
    'price-red': {
      html: c => { const [g, a, b] = PRICE[c.props.color] || PRICE.red;
        return `<div ${attrs(c)}><div class="lock">${ico(c)}${c.props.lead ? `<div class="lead">${esc(c.props.lead)}</div>` : ''}<div class="big price" style="${fitBig(c.props.text)}background-image:linear-gradient(180deg,${g} 0%,${a} 38%,${b} 100%)">${esc(c.props.text)}</div>${c.props.sub ? `<div class="sign">${esc(c.props.sub)}</div>` : ''}</div></div>`; },
      anim: c => [...pop(c, 'stamp'), ...selfIco(c), c.props.sub ? `tl.fromTo("#${c.id} .sign",{opacity:0,x:-40,rotation:-8},{opacity:1,x:0,rotation:-6,duration:0.4,ease:"power2.out"},${r3(c.start + 0.45)});` : ''] },
    cta: {
      html: c => `<div ${attrs(c)}><div class="cta" style="background:${c.props.color || G.acc}"><span>${esc(c.props.text)}</span></div></div>`,
      anim: c => [`tl.fromTo("#${c.id} .cta",{y:200,opacity:0},{y:0,opacity:1,duration:0.45,ease:"back.out(1.6)"},${r3(c.start)});`,
        `tl.to("#${c.id} .cta",{scale:1.06,duration:0.35,yoyo:true,repeat:${Math.max(1, Math.floor(c.dur / 0.35) - 3)},ease:"sine.inOut"},${r3(c.start + 0.6)});`] },
    // DANH SÁCH ✓ (tính năng / các bước) — bán hàng, doanh nghiệp, giáo dục
    list: {
      html: c => `<div ${attrs(c)} style="--acc:${c.props.color || G.acc}"><div class="lock">${ico(c)}${c.props.lead ? `<div class="lead">${esc(c.props.lead)}</div>` : ''}<div class="lst">${(c.props.items || [c.props.text]).filter(Boolean).map((x, k) => `<div class="li"><i>${c.props.numbered ? k + 1 + '.' : '✓'}</i><span>${esc(x)}</span></div>`).join('')}</div></div></div>`,
      anim: c => [c.props.lead ? `tl.fromTo("#${c.id} .lead",{y:30,opacity:0},{y:0,opacity:1,duration:0.25},${r3(c.start)});` : '',
        `tl.fromTo("#${c.id} .li",{x:-60,opacity:0},{x:0,opacity:1,duration:0.35,ease:"power3.out",stagger:0.45},${r3(c.start + 0.2)});`,
        `tl.to("#${c.id} .lock",{opacity:0,duration:0.22},${r3(c.start + c.dur - 0.22)});`, ...selfIco(c)].filter(Boolean) },
    // SỐ LIỆU CHẠY SỐ (0 → 138 M², 0 → 1,9 TỶ) — doanh nghiệp, tài chính, BĐS
    stat: {
      html: c => `<div ${attrs(c)}><div class="lock">${ico(c)}${c.props.lead ? `<div class="lead">${esc(c.props.lead)}</div>` : ''}<div class="big gold stat" style="${fitBig(c.props.text)}">${esc(c.props.text)}</div>${c.props.sub ? `<div class="chip">${esc(c.props.sub)}</div>` : ''}</div></div>`,
      anim: c => { const m = String(c.props.text || '').match(/(\d+(?:[.,]\d+)?)/); if (!m) return pop(c, ANIM);
        const pre = JSON.stringify(c.props.text.slice(0, m.index)), suf = JSON.stringify(c.props.text.slice(m.index + m[1].length)), dec = (m[1].split(/[.,]/)[1] || '').length, val = +m[1].replace(',', '.');
        return [...pop(c, 'fade'), `(function(){var el=document.querySelector("#${c.id} .stat"),o={v:0};tl.fromTo(o,{v:0},{v:${val},duration:1.1,ease:"power2.out",onUpdate:function(){el.textContent=${pre}+o.v.toFixed(${dec}).replace(".",",")+${suf};}},${r3(c.start + 0.1)});})();`, ...selfIco(c)]; } },
    // THẺ TRÍCH DẪN — câu đáng chú ý của người nói (phỏng vấn / podcast)
    quote: {
      html: c => `<div ${attrs(c)} style="--acc:${c.props.color || G.acc}"><div class="lock qtb"><div class="qm">“</div><div class="qt">${esc(String(c.props.text || '').replace(/\*/g, ''))}</div>${c.props.who ? `<div class="qw">— ${esc(c.props.who)}</div>` : ''}</div></div>`,
      anim: c => [`tl.fromTo("#${c.id} .qm",{scale:0.4,opacity:0},{scale:1,opacity:1,duration:0.4,ease:"back.out(2)"},${r3(c.start)});`,
        `tl.fromTo("#${c.id} .qt",{y:24,opacity:0},{y:0,opacity:1,duration:0.55,ease:"sine.out"},${r3(c.start + 0.15)});`,
        c.props.who ? `tl.fromTo("#${c.id} .qw",{opacity:0},{opacity:1,duration:0.4},${r3(c.start + 0.6)});` : '',
        `tl.to("#${c.id} .lock",{opacity:0,duration:0.25},${r3(c.start + c.dur - 0.25)});`].filter(Boolean) },
    // NHÃN (thanh tên / nhãn phòng / thẻ chương) — làm lại theo kho lower-third HyperFrames: lt-color-block, lt-kicker-name,
    // lt-mask-reveal, lt-stack-bars, lt-soft-pill (Apache 2.0)
    label: {
      html: c => { const st = c.props.style || 'pill', A = c.props.color || G.acc;
        const inner = st === 'kicker' ? `${c.props.kicker ? `<div class="lk">${esc(c.props.kicker)}</div>` : ''}<div class="ln">${esc(c.props.text)}</div><div class="lr"></div>`
          : st === 'bars' ? `<div class="ln">${esc(c.props.text)}</div>${c.props.sub ? `<div class="ls">${esc(c.props.sub)}</div>` : ''}`
          : st === 'pill' ? `<i class="dot"></i><div class="ln">${esc(c.props.text)}</div>`
          : st === 'mask' ? `<div class="sweep"></div><div class="ln">${esc(c.props.text)}</div>${c.props.sub ? `<div class="ls">${esc(c.props.sub)}</div>` : ''}`
          : `<div class="ln">${esc(c.props.text)}</div>${c.props.sub ? `<div class="ls">${esc(c.props.sub)}</div>` : ''}`;
        // nhãn luôn 1 dòng: chữ dài thì thu nhỏ cho vừa (không xuống dòng đè phụ đề)
        const base = { kicker: 118, mask: 120, pill: 50 }[st] || 86, len = String(c.props.text || '').length, k = st === 'pill' ? 34 : 15;
        const fs = Math.min(base, Math.floor((W - 300) / Math.max(1, len) / (st === 'pill' ? 0.62 : 0.47)));
        return `<div ${attrs(c)} style="--acc:${A}"><div class="lt lt-${st}" style="--lfs:${fs}px">${inner}</div></div>`; },
      anim: c => { const s = c.start, e = s + c.dur, st = c.props.style || 'pill', q = x => `"#${c.id} ${x}"`, o = [];
        if (st === 'block') o.push(`tl.fromTo(${q('.lt')},{x:-120,opacity:0},{x:0,opacity:1,duration:0.5,ease:"back.out(1.4)"},${r3(s)});`, `tl.fromTo(${q('.ln')},{y:30,opacity:0},{y:0,opacity:1,duration:0.4,ease:"power3.out"},${r3(s + 0.18)});`, `tl.fromTo(${q('.ls')},{y:20,opacity:0},{y:0,opacity:1,duration:0.4,ease:"power3.out"},${r3(s + 0.28)});`);
        if (st === 'kicker') o.push(`tl.fromTo(${q('.lk')},{scale:0,opacity:0},{scale:1,opacity:1,duration:0.35,ease:"back.out(2.2)"},${r3(s)});`, `tl.fromTo(${q('.ln')},{y:50,opacity:0},{y:0,opacity:1,duration:0.42,ease:"power4.out"},${r3(s + 0.12)});`, `tl.fromTo(${q('.lr')},{scaleX:0},{scaleX:1,duration:0.5,ease:"power3.inOut"},${r3(s + 0.25)});`);
        if (st === 'bars') o.push(`tl.fromTo(${q('.ln')},{clipPath:"inset(0 100% 0 0)"},{clipPath:"inset(0 0% 0 0)",duration:0.45,ease:"power3.out"},${r3(s)});`, `tl.fromTo(${q('.ls')},{clipPath:"inset(0 0 0 100%)"},{clipPath:"inset(0 0 0 0%)",duration:0.45,ease:"power3.out"},${r3(s + 0.2)});`);
        if (st === 'pill') o.push(`tl.fromTo(${q('.lt')},{scale:0.4,opacity:0},{scale:1,opacity:1,duration:0.42,ease:"back.out(2)"},${r3(s)});`, `tl.fromTo(${q('.dot')},{scale:0.6},{scale:1.25,duration:0.5,yoyo:true,repeat:${Math.max(1, Math.floor(c.dur / 0.5) - 2)},ease:"sine.inOut"},${r3(s + 0.4)});`);
        if (st === 'mask') o.push(`tl.fromTo(${q('.sweep')},{scaleX:0,transformOrigin:"0 50%"},{scaleX:1,duration:0.3,ease:"power2.in"},${r3(s)});`, `tl.set(${q('.sweep')},{transformOrigin:"100% 50%"},${r3(s + 0.3)});`, `tl.to(${q('.sweep')},{scaleX:0,duration:0.3,ease:"power2.out"},${r3(s + 0.3)});`, `tl.fromTo(${q('.ln')},{clipPath:"inset(0 100% 0 0)"},{clipPath:"inset(0 0% 0 0)",duration:0.3,ease:"none"},${r3(s + 0.3)});`, `tl.fromTo(${q('.ls')},{opacity:0},{opacity:1,duration:0.3},${r3(s + 0.55)});`);
        o.push(`tl.to(${q('.lt')},{x:-80,opacity:0,duration:0.3,ease:"power2.in"},${r3(e - 0.3)});`);
        return o; } },
    // HIỆU ỨNG CHUYỂN (lớp phủ, không đụng video) — theo organic-light-leak-overlay + transitions-light (flash, burn)
    fx: {
      html: c => c.tpl === 'leak' ? `<div ${attrs(c)}><div class="leak"><i class="la"></i><i class="lb"></i><i class="lg"></i></div></div>`
        : c.tpl === 'burn' ? `<div ${attrs(c)}><div class="burn"><i></i><i></i><i></i></div></div>` : `<div ${attrs(c)}><div class="flash"></div></div>`,
      anim: c => { const s = c.start, d = c.dur, q = x => `"#${c.id} ${x}"`;
        if (c.tpl === 'leak') return [`tl.fromTo(${q('.leak')},{opacity:0},{opacity:0.72,duration:${r3(d * 0.3)},ease:"sine.out"},${r3(s)});`, `tl.to(${q('.leak')},{opacity:0,duration:${r3(d * 0.45)},ease:"sine.in"},${r3(s + d * 0.55)});`,
          `tl.fromTo(${q('.la')},{xPercent:-25,rotation:-4},{xPercent:20,rotation:2,duration:${r3(d)},ease:"sine.inOut"},${r3(s)});`, `tl.fromTo(${q('.lb')},{xPercent:22,yPercent:-8},{xPercent:-18,yPercent:8,duration:${r3(d)},ease:"sine.inOut"},${r3(s)});`, `tl.fromTo(${q('.lg')},{xPercent:-30},{xPercent:26,duration:${r3(d)},ease:"sine.inOut"},${r3(s)});`];
        if (c.tpl === 'burn') return [`tl.fromTo(${q('i')},{opacity:0,x:${W}},{opacity:1,x:${-W * 0.3},duration:${r3(d * 0.55)},stagger:0.05,ease:"power1.in"},${r3(s)});`, `tl.to(${q('i')},{opacity:0,x:${-W},duration:${r3(d * 0.4)},ease:"power1.out"},${r3(s + d * 0.6)});`];
        return [`tl.fromTo(${q('.flash')},{opacity:0},{opacity:1,duration:${r3(d * 0.35)},ease:"power2.in"},${r3(s)});`, `tl.to(${q('.flash')},{opacity:0,duration:${r3(d * 0.6)},ease:"power2.out"},${r3(s + d * 0.4)});`]; } },
    // nút kết kiểu “theo dõi kênh” (theo tiktok-follow / instagram-follow, KHÔNG dùng logo hãng): thẻ kênh + nút Theo dõi → Đã theo dõi ✓
    'cta-follow': {
      html: c => `<div ${attrs(c)}><div class="fol"><div class="av" style="background:linear-gradient(145deg,${G.badge[0]},${G.badge[1]})">${esc(String(c.props.name || '★').trim()[0] || '★').toUpperCase()}</div><div class="fi"><div class="fn">${esc(c.props.name || '')}</div><div class="fs">${esc(c.props.text || '')}</div></div><div class="fb" style="background:${c.props.color || G.acc}"><span class="f1">Theo dõi</span><span class="f2">Đã theo dõi ✓</span></div></div></div>`,
      anim: c => { const s = c.start, q = x => `"#${c.id} ${x}"`;
        return [`tl.fromTo(${q('.fol')},{y:240,opacity:0},{y:0,opacity:1,duration:0.5,ease:"back.out(1.5)"},${r3(s)});`, `tl.fromTo(${q('.fb')},{scale:1},{scale:0.88,duration:0.12,yoyo:true,repeat:1},${r3(s + Math.min(1.2, c.dur * 0.5))});`,
          `tl.set(${q('.f1')},{display:"none"},${r3(s + Math.min(1.32, c.dur * 0.55))});`, `tl.set(${q('.f2')},{display:"inline"},${r3(s + Math.min(1.32, c.dur * 0.55))});`, `tl.set(${q('.fb')},{background:"#2b2f36",color:"#fff"},${r3(s + Math.min(1.32, c.dur * 0.55))});`]; } },
    badge: { html: () => '', anim: c => icoAnim(c) },
    emoji: { html: () => '', anim: c => icoAnim(c, true) },
    karaoke: {
      // tô màu cả CỤM có nghĩa (w.hl: “CÂY XANH”, “1,9 TỶ”) ngay khi dòng hiện; tiếng đang nói chỉ nảy nhẹ (không đổi màu từng tiếng)
      html: c => SB.hide ? '' : `<div ${attrs(c)}><div class="sub look-${SUBL}${bigSpans.some(([a, b]) => c.start < b && c.start + c.dur > a) ? ' low' : ''}">${c.props.words.map(w => `<b${w.hl && SB.mode !== 'word' ? ` class="hl" style="color:${esc(SB.color || G.acc)}"` : ''}>${esc(w.w)}</b>`).join(' ')}</div></div>`,
      anim: c => SB.hide ? [] : SB.mode === 'word' ? [`tl.fromTo("#${c.id} .sub",{scale:0.7,opacity:0},{scale:1,opacity:1,duration:0.16,ease:"back.out(3)"},${r3(c.start)});`,
        ...c.props.words.map((w, k) => `tl.set("#${c.id} b:nth-child(${k + 1})",{color:"${esc(SB.color || G.acc)}",scale:1.12},${r3(Math.max(c.start, w.s))});` + (k ? `tl.set("#${c.id} b:nth-child(${k})",{color:"#fff",scale:1},${r3(Math.max(c.start, w.s))});` : ''))] : [`tl.fromTo("#${c.id} .sub",{scale:0.7,opacity:0},{scale:1,opacity:1,duration:0.16,ease:"back.out(3)"},${r3(c.start)});`,
        ...c.props.words.map((w, k) => `tl.fromTo("#${c.id} b:nth-child(${k + 1})",{scale:1},{scale:1.12,duration:0.08,yoyo:true,repeat:1,ease:"power2.out",immediateRender:false},${r3(Math.max(c.start, w.s))});`)] },
    cutout: {
      html: c => `<video ${attrs(c).replace('class="clip"', 'class="clip cut"')} src="${c.src}" data-media-start="0" muted playsinline></video>`,
      anim: c => [`tl.fromTo("#${c.id}",{scale:${r3(c.z0 || 1)}},{scale:${r3(c.z1 || 1)},duration:${r3(c.dur)},ease:"none"},${r3(c.start)});`] },
    sfx: { html: c => SX.off ? '' : `<audio ${attrs(c)} src="${c.src}" data-volume="${r3(Math.min(1, (c.vol ?? 0.7) * (+SX.vol || 1)))}"></audio>`, anim: () => [] },
  };
  function icoAnim(c, emo, self) {
    if (!self && !att[c.attach]) return [];
    const s = c.start;
    return [`tl.fromTo("#${c.id}",{scale:0,rotation:${emo ? -25 : -40},y:30},{scale:1,rotation:0,y:0,duration:0.45,ease:"back.out(2.6)"},${r3(s)});`,
      emo ? `tl.to("#${c.id}",{rotation:8,y:-10,duration:0.45,yoyo:true,repeat:${Math.max(1, Math.floor(c.dur / 0.45) - 2)},ease:"sine.inOut"},${r3(s + 0.45)});`
          : `tl.to("#${c.id}",{y:-12,duration:0.6,yoyo:true,repeat:${Math.max(1, Math.floor(c.dur / 0.6) - 2)},ease:"sine.inOut"},${r3(s + 0.4)});`];
  }
  function pop(c, kind) {
    const s = c.start;
    return [c.props.lead ? `tl.fromTo("#${c.id} .lead",{y:30,opacity:0},{y:0,opacity:1,duration:0.25},${r3(s)});` : '',
      // kiểu chữ hiện theo phong cách: pop (nảy) · stamp (dập) · slide (trượt vào, doanh nghiệp/giáo dục) · fade (mờ dần lên, làm đẹp/cinematic)
      kind === 'stamp' ? `tl.fromTo("#${c.id} .big",{scale:2.6,opacity:0},{scale:1,opacity:1,duration:0.3,ease:"power4.in"},${r3(s + 0.08)});`
        : kind === 'slide' ? `tl.fromTo("#${c.id} .big, #${c.id} .keyw",{x:-90,opacity:0},{x:0,opacity:1,duration:0.45,ease:"power3.out"},${r3(s + 0.08)});`
        : kind === 'fade' ? `tl.fromTo("#${c.id} .big, #${c.id} .keyw",{y:26,opacity:0},{y:0,opacity:1,duration:0.6,ease:"sine.out"},${r3(s + 0.08)});`
        : `tl.fromTo("#${c.id} .big, #${c.id} .keyw",{scale:0.3,opacity:0},{scale:1,opacity:1,duration:0.42,ease:"back.out(2.4)"},${r3(s + 0.08)});`,
      kind === 'stamp' ? `tl.fromTo("#${c.id} .lock",{x:-10},{x:10,duration:0.05,repeat:5,yoyo:true},${r3(s + 0.38)});` : '',
      `tl.fromTo("#${c.id} .chip",{scaleX:0},{scaleX:1,duration:0.3,ease:"power2.out"},${r3(s + 0.4)});`,
      `tl.to("#${c.id} .lock",{opacity:0,scale:0.9,duration:0.22},${r3(s + c.dur - 0.22)});`].filter(Boolean);
  }
  const clips = T.clips.filter(c => K[c.tpl] || K[c.type]);
  const kit = c => K[c.tpl] || K[c.type];
  const body = clips.map(c => kit(c).html(c)).join('\n      ');
  const anim = clips.flatMap(c => kit(c).anim(c)).filter(Boolean).join('\n      ');
  const css = fs.readFileSync(path.join(import.meta.dirname, '..', 'kit', 'kit.css'), 'utf8');
  return `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <script src="kit/gsap.min.js"></script>
    <style>
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:#000}
video.clip{filter:${GF}}
:root{--ts:${r3(+TS.scale || 1)};--ss:${r3((+SB.scale || 1) * (SY?.subs?.scale || 1))};--f-head:${SY?.fonts?.head || 'BVP'};--f-big:${SY?.fonts?.big || 'Anton'}}

${css.replace(/url\(fonts\//g, 'url(kit/fonts/')}
/* chỉnh của khách qua chat — đặt SAU kit.css để thắng */
${subTop != null ? `.sub{top:${subTop}%}` : ''}
${TS.color ? `.keyw,.band span{color:${esc(TS.color)}!important}` : ''}
    </style>
  </head>
  <body>
    <div id="root" class="st-${esc(T.style || 'bds')}" data-composition-id="main" data-start="0" data-duration="${r3(T.duration)}" data-width="${W}" data-height="${H}" data-fps="${T.fps || 30}">
      ${body}
      <div id="prog" class="clip" data-start="0" data-duration="${r3(T.duration)}" data-track-index="9"><div class="prog" style="background:${G.acc}"></div></div>
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      tl.fromTo("#prog .prog",{scaleX:0},{scaleX:1,duration:${r3(T.duration)},ease:"none"},0);
      ${anim}
      window.__timelines["main"] = tl;
      tl.seek(0);
    </script>
  </body>
</html>
`;
}
// chữ trong *dấu sao* = tô màu nhấn
function hl(t) { return esc(t).replace(/\*([^*]+)\*/g, '<em>$1</em>'); }
