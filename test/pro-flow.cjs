// KIỂM ĐƯỜNG KHÁCH ĐI TRÊN TRÌNH DUYỆT (không cần Cloudflare / VPS thật):
// app chính (worker.js + site/ chạy trong Node) → trang pro.html → link mời ?c=… → mã khách → chuyển sang máy dựng (địa chỉ …trycloudflare.com giả,
// trình duyệt được nối về máy dựng chạy 127.0.0.1) → trang máy dựng nhận mã, KHÔNG hỏi mã xưởng, thấy “Video đã dựng” của đúng khách, mở được.
// node test/pro-flow.cjs <thư mục app chính (có site/ đã build)> <job đã dựng xong>   · SIZE=390x844
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const [appDir, doneJob] = process.argv.slice(2);
const [W0, H0] = (process.env.SIZE || '390x844').split('x').map(Number);
const ok = (c, m) => { console.log(c ? '✅' : '❌', m); if (!c) process.exitCode = 1; };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
(async () => {
  const W = await import(path.resolve(appDir, 'worker.js'));
  const store = new Map(), storage = { get: async k => store.get(k), put: async (k, v) => store.set(k, v), deleteAll: async () => store.clear() };
  const SECRET = 'thu-bi-mat-flow', env = { PRO_SECRET: SECRET, PRO_ADMIN: 'admin-9999', PRO_CODES: 'chi-thuy:moi-2611,anh-nam:moi-7788' };
  const gate = new W.AiGate({ storage }, env);
  env.AI_GATE = { idFromName: n => n, get: () => ({ fetch: (u, init) => gate.fetch(new Request(u, init)) }) };
  // app chính: /api/* → worker, còn lại → site/
  const app = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname.startsWith('/api/')) {
      const b = []; for await (const c of req) b.push(c);
      const r = await W.default.fetch(new Request('http://localhost:8787' + req.url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(b) }), env);
      res.writeHead(r.status, Object.fromEntries(r.headers)); return res.end(Buffer.from(await r.arrayBuffer()));
    }
    const f = path.join(appDir, 'site', u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname));
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  }).listen(8787);
  const HOST = 'khach-thu-nghiem.trycloudflare.com';
  const tun = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify({ hostname: HOST })); }).listen(20298, '127.0.0.1');
  const root = path.resolve(__dirname, '..');
  const xs = spawn('node', ['server.mjs'], { cwd: root, env: { ...process.env, PORT: '8792', XUONG_HOST: '127.0.0.1', XUONG_KEY: 'test123', XUONG_SECRET: SECRET, APP_URL: 'http://localhost:8787', XUONG_PUBLIC_URL: '', XUONG_TUNNEL_METRICS: '127.0.0.1:20298' } });
  let log = ''; xs.stdout.on('data', d => log += d); xs.stderr.on('data', d => log += d);
  // job đã dựng gán cho khách “chi-thuy” (chủ = k-<hmac mã mời>, đúng cách app tính)
  const crypto = require('node:crypto');
  const owner = 'k-' + crypto.createHmac('sha256', SECRET).update('u:moi-2611').digest('base64url').slice(0, 12);
  const id = 'flow' + Date.now().toString(36) + 'ab', dst = path.join(root, 'jobs', id);
  fs.cpSync(doneJob, dst, { recursive: true });
  const st = JSON.parse(fs.readFileSync(path.join(dst, 'state.json'), 'utf8')); st.id = id; st.owner = owner; st.created = Date.now(); fs.writeFileSync(path.join(dst, 'state.json'), JSON.stringify(st));
  const b = await chromium.launch();
  try {
    for (let k = 0; k < 30; k++) { const i = await (await fetch('http://localhost:8787/api/pro/info')).json().catch(() => ({})); if (i.on) break; await new Promise(r => setTimeout(r, 500)); }
    const ctx = await b.newContext({ viewport: { width: W0, height: H0 }, deviceScaleFactor: 1 });
    // địa chỉ đường hầm giả → nối về máy dựng chạy trong máy
    await ctx.route(`https://${HOST}/**`, async r => { const u = r.request().url().replace(`https://${HOST}`, 'http://127.0.0.1:8792'); r.fulfill({ response: await r.fetch({ url: u }) }); });
    const p = await ctx.newPage(); let dialogs = 0;
    p.on('dialog', d => { dialogs++; d.dismiss(); });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    // 1) app tắt máy dựng giả lập: mã sai
    await p.goto('http://localhost:8787/pro.html');
    await p.waitForSelector('#st.on', { timeout: 8000 });
    ok(/đang mở/.test(await p.textContent('#stx')), 'trang Dựng chuyên nghiệp: “Máy dựng đang mở”');
    await p.fill('#code', 'sai-ma'); await p.click('#send'); await p.waitForFunction(() => document.querySelector('#err').textContent.length > 0);
    ok(/không đúng/.test(await p.textContent('#err')), 'mã mời sai → báo “Mã mời không đúng”');
    await p.screenshot({ path: path.join(root, 'test', `out-pro-${W0}-1.png`) });
    // 2) link mời ?c= → tự vào máy dựng
    await p.goto('http://localhost:8787/pro.html?c=moi-2611');
    await p.waitForURL(u => u.host === HOST, { timeout: 15000 });
    await p.waitForSelector('#mine:not(.hidden)', { timeout: 15000 });
    ok(!p.url().includes('#t='), `vào máy dựng, mã khách đã xoá khỏi thanh địa chỉ (${p.url()})`);
    ok(await p.evaluate(() => !!localStorage.getItem('xuong.tok')), 'trang máy dựng lưu mã khách');
    const items = await p.$$eval('#mineList .mj', a => a.map(x => x.getAttribute('href')));
    ok(items.includes('#' + id), `“Video đã dựng” có video của khách (${items.length} video)`);
    ok(dialogs === 0, 'không hỏi “Nhập mã truy cập” (khách không có mã xưởng)');
    await p.screenshot({ path: path.join(root, 'test', `out-pro-${W0}-2.png`) });
    await p.click(`#mineList .mj[href="#${id}"]`);
    await p.waitForSelector('#ed:not(.hidden)', { timeout: 15000 });
    await p.waitForFunction(() => document.querySelectorAll('#tl .clip').length > 3, null, { timeout: 20000 });
    ok(true, `mở video → timeline có ${await p.$$eval('#tl .clip', a => a.length)} clip`);
    await p.waitForTimeout(1500);
    await p.screenshot({ path: path.join(root, 'test', `out-pro-${W0}-3.png`) });
    // 3) khách khác không thấy video này
    const p2 = await (await b.newContext({ viewport: { width: W0, height: H0 } })).newPage();
    await p2.context().route(`https://${HOST}/**`, async r => { const u = r.request().url().replace(`https://${HOST}`, 'http://127.0.0.1:8792'); r.fulfill({ response: await r.fetch({ url: u }) }); });
    await p2.goto('http://localhost:8787/pro.html?c=moi-7788');
    await p2.waitForURL(u => u.host === HOST, { timeout: 15000 });
    await p2.waitForTimeout(2500);
    const items2 = await p2.$$eval('#mineList .mj', a => a.map(x => x.getAttribute('href')));
    ok(!items2.includes('#' + id), 'khách 2 không thấy video của khách 1');
    // 4) mã khách bị sửa / hết hạn → báo quay lại app
    await p2.evaluate(() => localStorage.setItem('xuong.tok', localStorage.getItem('xuong.tok').slice(0, -3) + 'abc'));
    await p2.goto(`https://${HOST}/#${id}`);
    await p2.waitForTimeout(2500);
    ok(/hết hạn|quay lại app/i.test(await p2.textContent('body')), 'mã khách hỏng → “Mã vào đã hết hạn — quay lại app…”');
    // 5) quay lại pro.html lần sau: đã có mã → nút “Vào dựng video”
    await p.goto('http://localhost:8787/pro.html');
    await p.waitForSelector('#have:not(.hidden)');
    ok(/chi-thuy/.test(await p.textContent('#who')), 'lần sau vào lại: nhớ mã, có nút “Vào dựng video”');
    ok(!errs.length, 'không lỗi JS' + (errs.length ? ': ' + errs.join(' | ') : ''));
  } finally {
    await b.close(); xs.kill(); app.close(); tun.close(); fs.rmSync(dst, { recursive: true, force: true });
  }
})().catch(e => { console.error('❌', e.message); process.exit(1); });
