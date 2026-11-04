// Máy chủ GIẢ của Anthropic (chỉ để kiểm đường ống luồng chữ) — trả plan theo brief, gửi từng mẩu như API thật
const http = require('http');
http.createServer((req, res) => {
  let b = ''; req.on('data', d => b += d); req.on('end', async () => {
    const body = JSON.parse(b);
    const u = body.messages[0].content, brief = JSON.parse(u.slice(u.indexOf('\n') + 1));
    let out;
    if (brief.sentences) {
      const ss = brief.sentences;
      const bad = ss.findIndex((s, i) => /gi[aá]/i.test(s.text) && s.text.split(' ').length <= 4 && ss[i + 1] && /l[aạ]i nh[aàá]/i.test(ss[i + 1].text));
      const price = ss.find(s => /tỷ/.test(s.text) && s.i !== bad), area = ss.find(s => /mét vuông|m2|m²/i.test(s.text));
      const last = ss.length - 1;
      out = { understand: { summary: 'Giới thiệu nhà phố mặt tiền 52 m², 1 trệt 2 lầu, giá 3 tỷ 990, sổ hồng riêng', audience: 'người mua nhà phố', goal: 'nhắn tin xem nhà', tone: 'năng động', best: 'giá 3 tỷ 990, sổ hồng riêng' },
        script: [{ part: 'MỞ ĐẦU', from: 0, to: 1, goal: 'giới thiệu căn nhà', visual: 'video chính' }, { part: 'DIỆN TÍCH', from: (area || ss[1]).i, to: (area || ss[1]).i, goal: 'công năng', visual: 'cảnh bếp' }, { part: 'GIÁ BÁN', from: price ? price.i : last, to: last, goal: 'chốt giá', visual: 'video chính' }],
        drop: bad >= 0 ? [{ from: bad, to: bad, why: 'noi_lai', note: 'nói giá hỏng, phía sau nói lại đầy đủ' }] : [],
        hook: { text: 'NHÀ PHỐ MẶT TIỀN', sub: '', why: 'câu mở đầu hấp dẫn' },
        texts: [area && { tpl: 'spec-gold', start: area.start + 0.3, dur: 2.4, lead: 'DIỆN TÍCH', text: '52 M²', sub: '1 trệt · 2 lầu', icon: 'ruler', emoji: 'house', why: 'nhắc diện tích' },
                price && { tpl: 'price-red', start: price.start + 0.2, dur: 2.6, lead: 'GIÁ CHỈ', text: '3 TỶ 990', sub: 'sổ hồng riêng', icon: 'money', emoji: 'money-bag', why: 'nhắc giá' }].filter(Boolean),
        brolls: brief.brolls.map(x => ({ file: x.file, start: (area || ss[1]).start, dur: 2.2, from: 0.3, tpl: 'whip', why: 'cảnh bếp minh hoạ' })), cta: 'NHẮN TIN XEM NHÀ NGAY' };
    } else {
      const q = brief.request.toLowerCase(), ph = (brief.transcript || []).find(l => /bếp|phòng/.test(l.text));
      if (/cảnh|bếp/.test(q) && ph) out = { say: `Đã chèn cảnh bếp lúc ${ph.start} s chị nói “${ph.text.slice(0, 20)}”`, ops: [{ op: 'add', clip: { type: 'broll', file: brief.brolls[0].file, from: 0.3, start: ph.start, dur: 2.2, tpl: 'zoom' }, why: 'chèn cảnh bếp đúng lời' }] };
      else if (/cắt/.test(q)) out = { say: 'Đã cắt đoạn 3–5 s', ops: [{ op: 'cut', from: 3, to: 5, why: 'cắt theo lời khách' }] };
      else if (/nhạc/.test(q)) out = { say: 'Hiện chưa thêm nhạc nền được; mình có thể tăng âm thanh nhấn cho sôi động hơn.', ops: [] };
      else out = { say: 'Đã đổi giá sang màu xanh lá', ops: [{ op: 'update', id: 't1', props: { color: 'green' }, why: 'khách muốn giá màu xanh lá' }] };
    }
    const text = JSON.stringify(out, null, 1);
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const ev = (t, d) => res.write(`event: ${t}\ndata: ${JSON.stringify(d)}\n\n`);
    ev('message_start', { type: 'message_start', message: { usage: { input_tokens: 5200 } } });
    for (let i = 0; i < text.length; i += 60) { ev('content_block_delta', { type: 'content_block_delta', delta: { type: 'text_delta', text: text.slice(i, i + 60) } }); await new Promise(r => setTimeout(r, 120)); }
    ev('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 900 } });
    res.end();
  });
}).listen(8799, () => console.log('mock anthropic :8799'));
