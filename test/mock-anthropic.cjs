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
      out = { drop: bad >= 0 ? [{ from: bad, to: bad, why: 'noi_lai', note: 'nói giá hỏng, phía sau nói lại đầy đủ' }] : [],
        hook: { text: 'NHÀ PHỐ MẶT TIỀN', sub: '', why: 'câu mở đầu hấp dẫn' },
        texts: [area && { tpl: 'spec-gold', start: area.start + 0.3, dur: 2.4, lead: 'DIỆN TÍCH', text: '52 M²', sub: '1 trệt · 2 lầu', icon: 'ruler', why: 'nhắc diện tích' },
                price && { tpl: 'price-red', start: price.start + 0.2, dur: 2.6, lead: 'GIÁ CHỈ', text: '3 TỶ 990', sub: 'sổ hồng riêng', icon: 'money', why: 'nhắc giá' }].filter(Boolean),
        brolls: brief.brolls.map(x => ({ file: x.file, start: (area || ss[1]).start, dur: 2.2, from: 0.3, tpl: 'whip', why: 'cảnh bếp minh hoạ' })), cta: 'NHẮN TIN XEM NHÀ NGAY' };
    } else out = { ops: [{ op: 'update', id: 't1', props: { color: 'green' }, why: 'khách muốn giá màu xanh lá' }] };
    const text = JSON.stringify(out, null, 1);
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const ev = (t, d) => res.write(`event: ${t}\ndata: ${JSON.stringify(d)}\n\n`);
    ev('message_start', { type: 'message_start', message: { usage: { input_tokens: 5200 } } });
    for (let i = 0; i < text.length; i += 60) { ev('content_block_delta', { type: 'content_block_delta', delta: { type: 'text_delta', text: text.slice(i, i + 60) } }); await new Promise(r => setTimeout(r, 120)); }
    ev('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 900 } });
    res.end();
  });
}).listen(8799, () => console.log('mock anthropic :8799'));
