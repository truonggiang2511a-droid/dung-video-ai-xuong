// KIỂM CHỮ ĐÈ CHỮ (luật cứng Giang 4/11): mở index.html của 1 job, mỗi 0,25 s đo khung mọi khối chữ đang hiện
// (hook, chữ điểm nhấn, nhãn, phụ đề, nút kết, nút theo dõi). 2 khối chồng nhau > 4 % diện tích khối nhỏ = LỖI.
// Chạy: node test/overlap.cjs <url index.html>   vd http://localhost:8790/jobs/<id>/index.html
// Trả mã 1 khi có chỗ đè (dùng được trong kiểm thử tự động / trước khi xuất).
const { chromium } = require('playwright');
(async () => {
  const url = process.argv[2];
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  await pg.goto(url, { waitUntil: 'load' });
  await pg.waitForFunction(() => !!(window.__timelines && window.__timelines.main), null, { timeout: 30000, polling: 300 });
  const res = await pg.evaluate(async () => {
    const tl = window.__timelines.main, D = tl.duration(), out = [];
    const clips = [...document.querySelectorAll('#root > .clip')];
    const SEL = '.lock, .hook, .lt, .cta, .fol, .sub';
    const alpha = el => { let a = 1; for (let e = el; e && e.id !== 'root'; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return 0; a *= +cs.opacity; } return a; };
    for (let t = 0.05; t < D; t += 0.25) {
      for (const c of clips) { const s = +c.dataset.start, d = +c.dataset.duration; c.style.visibility = t >= s && t < s + d ? 'visible' : 'hidden'; }
      tl.seek(t, false);
      const boxes = [];
      for (const c of clips) {
        if (c.style.visibility === 'hidden') continue;
        for (const el of c.querySelectorAll(SEL)) {
          if (alpha(el) < 0.25 || !el.textContent.trim()) continue;
          const r = el.getBoundingClientRect();
          if (r.width < 4 || r.height < 4) continue;
          boxes.push({ id: c.id, k: el.className.split(' ')[0], txt: el.textContent.trim().slice(0, 24), r });
        }
      }
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const A = boxes[i].r, B = boxes[j].r;
        if (boxes[i].id === boxes[j].id) continue;
        const w = Math.min(A.right, B.right) - Math.max(A.left, B.left), h = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
        if (w <= 0 || h <= 0) continue;
        const ratio = (w * h) / Math.min(A.width * A.height, B.width * B.height);
        if (ratio > 0.04) out.push({ t: Math.round(t * 100) / 100, a: `${boxes[i].id}.${boxes[i].k} “${boxes[i].txt}”`, b: `${boxes[j].id}.${boxes[j].k} “${boxes[j].txt}”`, pct: Math.round(ratio * 100) });
      }
    }
    return { D, out };
  });
  // gộp các lần liền nhau của cùng 1 cặp
  const seen = new Map();
  for (const o of res.out) { const k = o.a + '|' + o.b; if (!seen.has(k)) seen.set(k, { ...o, t2: o.t }); else seen.get(k).t2 = o.t; }
  if (!seen.size) console.log(`✅ không có chữ đè chữ (${res.D.toFixed(1)} s, kiểm mỗi 0,25 s)`);
  else for (const o of seen.values()) console.log(`❌ ${o.t}–${o.t2} s: ${o.a} đè ${o.b} (${o.pct} %)`);
  await b.close();
  process.exit(seen.size ? 1 : 0);
})();
