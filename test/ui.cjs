const { chromium } = require('playwright');
(async () => {
  const [W, H] = (process.env.SIZE || '1440x900').split('x').map(Number);
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await pg.goto('http://localhost:8790/');
  await pg.evaluate(() => localStorage.setItem('xuong.key', 'test123'));
  await pg.reload();
  await pg.waitForFunction(() => document.querySelectorAll('#ind option').length > 20, null, { timeout: 10000 });
  await pg.selectOption('#ind', process.env.IND || 'bat-dong-san');
  if (process.env.STY) await pg.selectOption('#sty', process.env.STY);
  await pg.setInputFiles('#fMain', process.env.AROLL);
  await pg.setInputFiles('#fB', process.env.BROLL.split('|'));
  await pg.screenshot({ path: `test/out-${W}-1-setup.png` });
  const t0 = Date.now();
  await pg.click('#go');
  await pg.waitForSelector('#ed:not(.hidden)');
  for (let k = 0; k < 14; k++) { // chụp quá trình dựng trực tiếp
    await pg.waitForTimeout(1500);
    const st = await pg.textContent('#stx');
    console.log('live', k, st.slice(0, 110));
    await pg.screenshot({ path: `test/out-${W}-live-${k}.png` });
    if (/Bước \d+\/\d+|Xong\./.test(st)) break;
  }
  await pg.waitForFunction(() => /Xong\./.test(document.querySelector('#stx').textContent), null, { timeout: 120000 });
  console.log('build+replay sec', ((Date.now() - t0) / 1000).toFixed(1), 'clips shown', await pg.$$eval('.clip.show', e => e.length), '/', await pg.$$eval('.clip', e => e.length));
  await pg.waitForTimeout(2500);
  await pg.screenshot({ path: `test/out-${W}-4-done.png` });
  // thẻ “AI hiểu video” + bảng điểm: chạm mở → phải đóng lại được (4/11 19:41 Giang: “mở lên nhưng không tắt được”)
  const hS = () => pg.$eval('#story', e => Math.round(e.getBoundingClientRect().height));
  const h0 = await hS(); await pg.click('#story .sum'); await pg.waitForTimeout(300); const h1 = await hS();
  await pg.screenshot({ path: `test/out-${W}-4b-story-open.png` });
  const closeSel = (await pg.$('#story .x:visible')) ? '#story .x' : '#story .sum';
  await pg.click(closeSel); await pg.waitForTimeout(300); const h2 = await hS();
  console.log('story h', h0, '→ mở', h1, '→ đóng', h2, h2 <= h0 + 2 && h1 > h0 ? '✅' : '❌');
  // chọn hook rồi chat
  await pg.click('.clip[data-id=hook]');
  await pg.fill('#msg', 'đổi màu xanh lá');
  await pg.click('#send');
  await pg.waitForFunction(() => /Xem lại|Không có thay đổi|⚠|chưa làm được/.test(document.querySelector('#stx').textContent), null, { timeout: 120000 });
  console.log('chat:', await pg.textContent('#stx'));
  await pg.waitForTimeout(2500);
  await pg.screenshot({ path: `test/out-${W}-5-chat.png` });
  if (process.env.EXPORT) {
    const e0 = Date.now();
    await pg.click('#exp');
    await pg.waitForFunction(() => /Xuất xong|⚠/.test(document.querySelector('#mtx').textContent), null, { timeout: 600000 });
    console.log('export:', await pg.textContent('#mtx'), ((Date.now() - e0) / 1000).toFixed(0), 's');
    await pg.screenshot({ path: `test/out-${W}-6-export.png` });
    console.log('url', await pg.getAttribute('#mact a', 'href'), 'hash', await pg.evaluate(() => location.hash));
  }
  console.log('errors:', errs.slice(0, 5));
  await b.close();
})();
