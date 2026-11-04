// Timeline JSON (bản gốc) -> index.html HyperFrames. Mỗi clip = 1 phần tử có giờ; "tpl" chọn mẫu trong kho.
import fs from 'node:fs';
import path from 'node:path';

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
export const TEXT_TPLS = ['hook-band', 'key-pop', 'spec-gold', 'price-red', 'cta'];

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const r3 = n => Math.round(n * 1000) / 1000;

export function build(T) {
  const [W, H] = SIZES[T.format] || SIZES['9:16'];
  const G = GENRES[T.genre] || GENRES.chung;
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
  const K = {
    video: {
      html: c => `<video ${attrs(c)} src="${c.src}" data-media-start="${r3(c.mediaStart || 0)}" data-has-audio="true" playsinline></video>`,
      // zoom xen kẽ ở mỗi đoạn để che chỗ cắt
      anim: c => { const z = c.zoom || 1; return [`tl.fromTo("#${c.id}",{scale:${z}},{scale:${r3(z + 0.04)},duration:${r3(c.dur)},ease:"none"},${r3(c.start)});`]; } },
    broll: {
      html: c => `<video ${attrs(c)} src="${c.src}" data-media-start="${r3(c.mediaStart || 0)}" muted playsinline></video>`,
      anim: c => {
        const s = c.start, d = c.dur, tin = c.tpl === 'fade' ? 'opacity:0' : `x:${W}`;
        return [`tl.fromTo("#${c.id}",{${tin},scale:1.15},{${c.tpl === 'fade' ? 'opacity:1' : 'x:0'},scale:1.05,duration:0.28,ease:"power3.out"},${r3(s)});`,
          `tl.to("#${c.id}",{scale:1.13,duration:${r3(Math.max(0.1, d - 0.5))},ease:"none"},${r3(s + 0.28)});`,
          c.tpl === 'fade' ? `tl.to("#${c.id}",{opacity:0,duration:0.22},${r3(s + d - 0.22)});` : `tl.to("#${c.id}",{x:${-W},duration:0.22,ease:"power3.in"},${r3(s + d - 0.22)});`]; } },
    'hook-band': {
      html: c => `<div ${attrs(c)}><div class="hook${c.props.big ? ' big' : ''}">${ico(c)}<div class="band" style="background:${c.props.color || G.acc}"><span>${esc(c.props.text)}</span></div>${c.props.sub ? `<div class="hsub">${esc(c.props.sub)}</div>` : ''}</div></div>`,
      anim: c => [`tl.fromTo("#${c.id} .band",{scaleX:0},{scaleX:1,duration:0.35,ease:"expo.out"},${r3(c.start)});`,
        `tl.fromTo("#${c.id} .band span",{y:60,opacity:0},{y:0,opacity:1,duration:0.35,ease:"back.out(2)"},${r3(c.start + 0.15)});`,
        c.props.sub ? `tl.fromTo("#${c.id} .hsub",{y:-30,opacity:0},{y:0,opacity:1,duration:0.3},${r3(c.start + 0.35)});` : '',
        `tl.to("#${c.id} .hook",{opacity:0,y:-40,duration:0.25},${r3(c.start + c.dur - 0.25)});`, ...selfIco(c)] },
    'key-pop': {
      html: c => `<div ${attrs(c)} style="--acc:${c.props.color || G.acc}"><div class="lock">${ico(c)}${c.props.lead ? `<div class="lead">${esc(c.props.lead)}</div>` : ''}<div class="keyw">${hl(c.props.text)}</div></div></div>`,
      anim: c => [...pop(c, 'pop'), ...selfIco(c)] },
    'spec-gold': {
      html: c => `<div ${attrs(c)}><div class="lock">${ico(c)}${c.props.lead ? `<div class="lead">${esc(c.props.lead)}</div>` : ''}<div class="big gold">${esc(c.props.text)}</div>${c.props.sub ? `<div class="chip">${esc(c.props.sub)}</div>` : ''}</div></div>`,
      anim: c => [...pop(c, 'pop'), ...selfIco(c)] },
    'price-red': {
      html: c => { const [g, a, b] = PRICE[c.props.color] || PRICE.red;
        return `<div ${attrs(c)}><div class="lock">${ico(c)}${c.props.lead ? `<div class="lead">${esc(c.props.lead)}</div>` : ''}<div class="big price" style="background-image:linear-gradient(180deg,${g} 0%,${a} 38%,${b} 100%)">${esc(c.props.text)}</div>${c.props.sub ? `<div class="sign">${esc(c.props.sub)}</div>` : ''}</div></div>`; },
      anim: c => [...pop(c, 'stamp'), ...selfIco(c), c.props.sub ? `tl.fromTo("#${c.id} .sign",{opacity:0,x:-40,rotation:-8},{opacity:1,x:0,rotation:-6,duration:0.4,ease:"power2.out"},${r3(c.start + 0.45)});` : ''] },
    cta: {
      html: c => `<div ${attrs(c)}><div class="cta" style="background:${c.props.color || G.acc}"><span>${esc(c.props.text)}</span></div></div>`,
      anim: c => [`tl.fromTo("#${c.id} .cta",{y:200,opacity:0},{y:0,opacity:1,duration:0.45,ease:"back.out(1.6)"},${r3(c.start)});`,
        `tl.to("#${c.id} .cta",{scale:1.06,duration:0.35,yoyo:true,repeat:${Math.max(1, Math.floor(c.dur / 0.35) - 3)},ease:"sine.inOut"},${r3(c.start + 0.6)});`] },
    badge: { html: () => '', anim: c => icoAnim(c) },
    emoji: { html: () => '', anim: c => icoAnim(c, true) },
    karaoke: {
      html: c => `<div ${attrs(c)}><div class="sub${bigSpans.some(([a, b]) => c.start < b && c.start + c.dur > a) ? ' low' : ''}">${c.props.words.map(w => `<b>${esc(w.w)}</b>`).join(' ')}</div></div>`,
      anim: c => [`tl.fromTo("#${c.id} .sub",{scale:0.7,opacity:0},{scale:1,opacity:1,duration:0.16,ease:"back.out(3)"},${r3(c.start)});`,
        ...c.props.words.map((w, k) => `tl.set("#${c.id} b:nth-child(${k + 1})",{color:"${G.acc}",scale:1.12},${r3(Math.max(c.start, w.s))});` +
          (k ? `tl.set("#${c.id} b:nth-child(${k})",{color:"#fff",scale:1},${r3(Math.max(c.start, w.s))});` : ''))] },
    cutout: {
      html: c => `<video ${attrs(c).replace('class="clip"', 'class="clip cut"')} src="${c.src}" data-media-start="0" muted playsinline></video>`,
      anim: c => [`tl.fromTo("#${c.id}",{scale:${r3(c.z0 || 1)}},{scale:${r3(c.z1 || 1)},duration:${r3(c.dur)},ease:"none"},${r3(c.start)});`] },
    sfx: { html: c => `<audio ${attrs(c)} src="${c.src}" data-volume="${c.vol ?? 0.7}"></audio>`, anim: () => [] },
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
      kind === 'stamp' ? `tl.fromTo("#${c.id} .big",{scale:2.6,opacity:0},{scale:1,opacity:1,duration:0.3,ease:"power4.in"},${r3(s + 0.08)});`
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
${css.replace(/url\(fonts\//g, 'url(kit/fonts/')}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${r3(T.duration)}" data-width="${W}" data-height="${H}" data-fps="${T.fps || 30}">
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
