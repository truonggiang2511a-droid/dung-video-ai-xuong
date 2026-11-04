# CLAUDE.md — Xưởng dựng HyperFrames (dung-video-ai-xuong)

Đọc trước khi sửa. Dự án con của **Dựng Video AI** (repo `dung-video-ai`, xem CLAUDE.md của repo đó). Chạy trên laptop Windows của Giang,
app nói chuyện qua đường hầm Cloudflare (quick tunnel). **Chỉ thử nội bộ (admin).** Chữ khách thấy: tiếng Việt. Tên biến/hàm: tiếng Anh.
Không nói "đã chạy được" khi chưa chạy thật.

## Giang chốt
- 4/11/2026: dựng bằng **HyperFrames** (đồ hoạ chuyên nghiệp hơn canvas). Giai đoạn thử: laptop Giang làm xưởng (Windows),
  nối bằng **Cloudflare Tunnel**, **Claude Code trên laptop** làm bộ não (đã phản biện: chỉ được dùng thử nội bộ, phục vụ khách phải
  dùng khoá API), **chỉ admin** dùng — app chính vẫn chạy canvas. Sau này chuyển xưởng lên VPS (Contabo 8 vCPU / 24 GB), R2 + hàng đợi.
- Timeline JSON là **bản gốc**; AI chỉ ghi `plan.json` (dựng mới) / `ops.json` (sửa) — KHÔNG để AI viết HTML.

## Kiến trúc
| File | Việc |
|---|---|
| `server.mjs` | Máy chủ Node (cổng 8790, không thư viện ngoài). `/` trang thử · `/api/jobs` tạo · `PUT /api/jobs/:id/upload?name&offset&main` tải từng khúc ≤ 8 MB (quick tunnel giới hạn 100 MB/lần gửi) · `POST …/start` · `GET /api/jobs/:id` trạng thái + timeline + ops · `POST …/chat {text,target}` · `POST …/render` · `GET /jobs/:id/*` file dự án (có Range cho video). Mã xưởng: header `x-key` (biến `XUONG_KEY` hoặc tự sinh vào `.xuong-key`). Trang xem nhanh `index.html` được **gắn thêm `/ui/hyperframe.runtime.iife.js`** khi phục vụ |
| `lib/pipeline.mjs` | prepare (ffprobe + `color_transfer`; đổi H.264 SDR cạnh ngắn 1080, 30 fps, GOP 1 s; HDR → tonemap; có `h264_amf/nvenc/qsv` thì mã hoá bằng card, lỗi → CPU; **video chính trước**, cảnh phụ đổi nền song song `job.brollsReady`) → transcribe (WAV 16 kHz, đoạn 55 s, `APP_URL/api/transcribe` song song, ghép số tách) → **analyze** (câu `sentencesOf` giây gốc; `localCuts`: lời ekip `CUE`, chào lặp, ờ/à; **lặng theo ồn nền**: RMS 50 ms, ồn = p10, ngưỡng = ồn + max(4, 40 % khoảng p10→p85), ≥ 0,35 s) → **plan** (AI trả `drop` + chữ + cảnh phụ theo GIÂY GỐC, 1 lần gọi) → **finalize** (`checkDrops` = chốt an toàn như app: số trong đoạn bỏ phải còn ở phần giữ, nói lại ≥ 50 % chữ có lại, ekip ≤ 12 chữ/câu, tổng ≤ 45 %; cắt = lặng(+0,1/−0,15) ∪ ờ/à ∪ drop, **trừ trọn chữ đang giữ** (chữ > 1,2 s chỉ giữ 0,4 s đầu); bỏ trước câu đầu/sau câu cuối; chốt an toàn < 30 % thì không cắt; đổi giây gốc → timeline, mục rơi vào chỗ bỏ thì dời tới đoạn giữ kế) → `buildTimeline` → `opsForCursor` → `writeComposition` · chat · render (`--sdr`) |
| `lib/ai.mjs` | Bộ não: `aiMode()` = `XUONG_AI` hoặc tự chọn (`ANTHROPIC_API_KEY` có → `api`, không → `claude`). **api**: Claude Haiku 5.5 `stream:true`, `output_config.effort low`, không temperature; đọc luồng chữ → `objs()` bóc từng `{…}` xong trong `drop/texts/brolls` → `live.draft` để trang vẽ ngay; giá 0,10/0,50 USD/1 triệu token. **claude**: Claude Code (`XUONG_CLAUDE_MODEL` tuỳ chọn). `.env` hoặc `cau-hinh.txt` ở thư mục gốc được nạp tự động (công cụ ghi file từ xa không cho ghi `.env*`). `ANTHROPIC_BASE_URL` để thử bằng `test/mock-anthropic.cjs` |
| `lib/vision.mjs` | **AI nhìn cảnh phụ**: cảnh ≤ 24 s = 1 đoạn, dài hơn = từng đoạn 8 s (tối đa 24) → ảnh ghép 3 khung 240 px → `APP_URL/api/vision` (Workers AI, miễn phí, 8 ảnh/lần) → `m.parts[{from,to,thay}]` → brief `brolls[].parts` để AI ghép theo THỨ NHÌN THẤY (tên file kiểu “DJI 0541” vô nghĩa) và dùng nhiều đoạn của 1 cảnh dài |
| `lib/queue.mjs` | `slot('cpu'|'render', fn, onQueue)`: tối đa `XUONG_CPU` (2) việc đổi file và `XUONG_RENDER` (2) việc xuất cùng lúc, còn lại xếp hàng, báo số thứ tự (`/api/health` → `queue`) |
| `lib/gen.mjs` | Timeline → HTML HyperFrames. Kho mẫu: `video` (đoạn cắt, zoom xen kẽ 1/1,12), `broll` (`whip`/`fade`), `hook-band`, `key-pop` (`*từ*` tô màu), `spec-gold`, `price-red` (màu red/green/gold/blue, `sub` = chữ ký tay), `cta`, `badge` (14 icon SVG), `karaoke` (phụ đề từng chữ), `sfx`. Màu theo ngành `GENRES` |
| `lib/run.mjs` | Chạy lệnh ngoài; Windows: `npx`/`claude` là .cmd → chạy qua shell, có đặt ngoặc kép |
| `kit/LUAT-DUNG.md` | Luật dựng cho Claude Code — chép vào `jobs/<id>/CLAUDE.md`; định dạng `plan.json` / `ops.json` |
| `kit/` | kit.css, 4 font Việt (OFL), gsap.min.js, whoosh/ding/pop.wav (tự tạo bằng ffmpeg), **64 emoji 3D Fluent (MIT)** `kit/emoji/*.svg` + `nhan.json` (nghĩa tiếng Việt cho AI) — gửi lên máy Giang dạng 1 file `emoji-pack.json`, `pipeline.mjs` tự bung lần đầu. Icon/emoji vẽ TRONG khối chữ (`.lock > .ico`, phía trên dòng dẫn) → không bao giờ che chữ; emoji lắc nhẹ (`icoAnim`) |
| `ui/index.html` | Trang (màu Higgsfield, font Geist, **không có chữ “xưởng”/HyperFrames**): chọn ngành + tải lên → **dựng trực tiếp**: hỏi `GET /api/jobs/:id?seq=` mỗi giây, `live` (media, words, sentences, silences, autoDrops, draft, cuts) vẽ theo GIÂY GỐC — khối video đang chuẩn bị (sọc chạy), khối câu chép lời, vạch cắt đỏ (lặng / ekip / nói lại), chữ + cảnh phụ AI vừa viết; con trỏ diễn theo hàng `aq` (dài > 6 thì nhanh) → xong: vạch cắt mờ, timeline co về giờ sau cắt, diễn nhanh icon/âm thanh/phụ đề. Video dài: `setScale` thu nhỏ px/giây. Xuất báo thứ tự hàng chờ |
| `CAI-DAT.cmd` / `CHAY-XUONG.cmd` | Cài 1 lần / chạy xưởng + `cloudflared tunnel --url http://localhost:8790` |

Claude Code gọi: `claude -p "<lệnh tiếng Anh ngắn>" --output-format json --allowedTools Read,Write --permission-mode acceptEdits --max-turns 8`
(cwd = thư mục dự án, timeout 240 s; prompt ASCII để tránh lỗi mã chữ cmd.exe — nội dung tiếng Việt nằm trong file).

## Kiểm thử (máy ảo Linux, 2 nhân, 8 GB)
`XUONG_AI=local XUONG_KEY=test123 node server.mjs` rồi `SIZE=1440x900 EXPORT=1 node test/ui.cjs` (và `SIZE=390x844`).
Đường Claude kiểm bằng CLI giả `test/fake-claude` (đặt vào PATH) — KHÔNG phải AI thật.

## Kiểm thử thêm (4/11 chiều)
`/home/claude/restart.sh` (máy dựng + Anthropic giả) · `AROLL=/tmp/aroll2.mp4 BROLL="/tmp/Phong bep.mp4" SIZE=1440x900 node test/ui.cjs` (chụp `test/out-*-live-*.png`).
Giọng thử có ồn nâu + 1,6/0,9/1,2/1,1/1,5 s lặng + “Giá ba tỷ. Lại nha.” rồi nói lại giá đủ: 21,9 s → 13,3 s, bỏ đúng câu hỏng + “lại nha”, không mất chữ nào.
5 khách cùng lúc (máy 2 nhân): dựng xong cả 5 trong 47 s, xuất 5 × 13 s xong sau ~250 s, hàng chờ báo đúng thứ tự 1-2-3.

## Nhật ký bài học
- 2026-11-04: `<hyperframes-player>` thấy `window.__timelines` thì chạy kiểu "timeline trực tiếp", KHÔNG gắn runtime → clip không ẩn
  ngoài giờ (phụ đề chồng nhau, video không đồng bộ). Sửa: máy chủ gắn runtime vào index.html khi phục vụ xem nhanh (render CLI tự gắn).
  Player mặc định tải runtime từ jsdelivr → tự phục vụ `runtime-src` để không phụ thuộc CDN.
- 2026-11-04: Máy 8 GB RAM bị HyperFrames coi là máy yếu → ép 1 luồng + chụp màn hình chậm. `--no-low-memory-mode --experimental-fast-capture`
  (+2 luồng): video 11 s render 45 s (mặc định 66 s) trên 2 nhân không GPU. Qua trang thử (kèm khởi động) 61 s.
- 2026-11-04: `hyperframes lint` cảnh báo `nested_structure_needs_subcomposition` (mỗi mẫu nên là sub-composition có biến) — chưa đổi,
  render vẫn đúng; làm khi chuyển kho mẫu sang dạng `data-composition-variables`.
- 2026-11-04: Chữ Anton có dấu (Ỷ) bị mất phần dấu khi dùng `background-clip:text` → thêm `padding-top` cho khối chữ giá.
- 2026-11-04 (laptop Giang, Aroll Nhà Xinh 4K HEVC HDR 3:45 + 14 cảnh phụ): dựng 643 s — đổi file 534 s (83 %), chép lời 12 s, cắt 13 s,
  Claude Code 100 s (~0,467 USD theo giá API, gói Max không bị trừ tiền). Xuất lỗi: file đổi định dạng vẫn mang nhãn HDR (HLG) → HyperFrames
  đi đường HDR, cần ~23,5 GB khung 16-bit ở ổ tạm C:. Sửa: `probe` đọc `color_transfer`; HDR → `zscale…tonemap=hable` về bt709 + gắn nhãn bt709;
  render luôn `--sdr`. Kiểm bằng clip HLG giả (x265 arib-std-b67) → b1.mp4 bt709, xuất 85 s OK.
- 2026-11-04: Aroll Nhà Xinh chỉ cắt được 5,5 s / 225 s: (1) `silencedetect -34 dB` cố định — quay ngoài đường ồn nền > −34 dB nên KHÔNG có khoảng lặng nào (thử ồn nâu: 0 khoảng); (2) hợp với cả khoảng chữ Whisper (chữ kéo dài qua chỗ nghỉ) nên lấp hết; (3) chưa bỏ nói lại. Sửa: ngưỡng theo ồn nền + chỉ giữ trọn chữ ngắn + AI `drop` trong cùng lần lập kế hoạch + luật ekip/chào lặp của app.
- 2026-11-04: lần đầu thu lõi chữ 25 % mỗi đầu → mất chữ đầu câu (“Hôm”, “Diện”) vì Whisper báo chữ sau chỗ nghỉ sớm → giữ TRỌN chữ (dư 0,03 s).
- 2026-11-04: `pkill -f "node server.mjs"` trong cùng lệnh bash giết luôn shell (mã 144) → dùng `/home/claude/restart.sh` (ps + awk theo đúng lệnh).
- 2026-11-04 13:55: dựng Aroll lần 2 kẹt ở bước đổi video chính > 9 phút: chuyển sắc HDR (zscale float) chạy ở 4K. Đo clip 4K HLG 3 s (2 nhân): chuyển sắc ở 4K 13,3 s · thu nhỏ trước 5,6 s · không chuyển sắc 3,6 s → thu nhỏ trước rồi chuyển sắc.
- 2026-11-04 14:16 (Giang xem bản dựng Aroll lần 3 — Haiku API 34 s, ~0,005 USD; dựng tổng 374 s, đổi video chính 280 s bằng card AMD):
  (1) **ghép cảnh phụ sai**: 11 cảnh, tên “DJI 05xx”, 1 cảnh dài 176 s chứa cả phòng khách/bếp/toilet/cầu thang/phòng ngủ/sân thượng mà AI
  chỉ biết tên file → thêm AI nhìn từng đoạn 8 s (thử trên dữ liệu thật: 17/17 đoạn ra nhãn đúng). (2) **cuối video “đăng ký kênh” nói 2 lần
  không cắt**: Whisper bỏ lần lặp và kéo chữ “kênh” dài 2,9 s → chữ > 1,2 s chỉ tính 0,5 s đầu, phần sau + khoảng trống ≥ 0,9 s mà ≥ 40 %
  khung to hơn ngưỡng lặng = nói vấp → cắt (bắt được 212,72–214,90). (3) **ít điểm nhấn** (10 chữ / 166 s) → brief có `target.texts`
  = thời lượng/5 + luật mật độ. (4) **icon che chữ** (icon đặt góc phải cố định) → đưa vào trong khối chữ. Kèm: bản đổi file bằng AMF
  cqp nặng 13 Mbit/s (aroll 372 MB) → giới hạn 6–9 Mbit/s.
- HyperFrames có gói trả phí "HyperFrames Pro" (templates, style-sampling) và bật telemetry mặc định → `npx hyperframes telemetry disable`.
