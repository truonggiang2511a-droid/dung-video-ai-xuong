// Thử “chữ hook to, ẩn sau nhân vật + icon nhà to” bằng lệnh chat (bộ hiểu lệnh dự phòng) trên video thật
import { chat } from '../lib/pipeline.mjs';
const job = { dir: process.argv[2], genre: 'bds' };
const t0 = Date.now();
const ops = await chat(job, process.argv[3], 'hook', s => console.log('·', s));
console.log(JSON.stringify(ops), ((Date.now() - t0) / 1000).toFixed(1) + ' s');
