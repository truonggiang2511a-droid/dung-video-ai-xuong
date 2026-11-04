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
| `lib/pipeline.mjs` | prepare (ffprobe + `color_transfer`; đổi H.264 SDR cạnh ngắn 1080, 30 fps, GOP 1 s; **cảnh phụ quay chậm theo khung gốc** (`slowOf`: 50 khung → 0,6×); HDR → tonemap; có `h264_amf/nvenc/qsv` thì mã hoá bằng card, lỗi → CPU; **video chính trước**, cảnh phụ đổi nền song song `job.brollsReady`) → transcribe (WAV 16 kHz, đoạn 55 s, `APP_URL/api/transcribe` song song, ghép số tách) → **analyze** (câu `sentencesOf` giây gốc; `localCuts`: lời ekip `CUE`, chào lặp, ờ/à; **lặng theo ồn nền**: RMS 50 ms, ồn = p10, ngưỡng = ồn + max(4, 40 % khoảng p10→p85), ≥ 0,35 s) → **plan** (AI trả `drop` + chữ + cảnh phụ theo GIÂY GỐC, 1 lần gọi) → **finalize** (`checkDrops` = chốt an toàn như app: số trong đoạn bỏ phải còn ở phần giữ, nói lại ≥ 50 % chữ có lại, ekip ≤ 12 chữ/câu, tổng ≤ 45 %; cắt = lặng(+0,1/−0,15) ∪ ờ/à ∪ drop, **trừ trọn chữ đang giữ** (chữ > 1,2 s chỉ giữ 0,4 s đầu); bỏ trước câu đầu/sau câu cuối; chốt an toàn < 30 % thì không cắt; đổi giây gốc → timeline, mục rơi vào chỗ bỏ thì dời tới đoạn giữ kế) → `buildTimeline` → `opsForCursor` → `writeComposition` · chat · render (`--sdr`) |
| `lib/ai.mjs` | Bộ não: `aiMode()` = `XUONG_AI` hoặc tự chọn (`ANTHROPIC_API_KEY` có → `api`, không → `claude`). **api**: Claude Haiku 5.5 `stream:true`, `output_config.effort low`, không temperature; đọc luồng chữ → `objs()` bóc từng `{…}` xong trong `drop/texts/brolls` → `live.draft` để trang vẽ ngay; giá 0,10/0,50 USD/1 triệu token. **claude**: Claude Code (`XUONG_CLAUDE_MODEL` tuỳ chọn). `.env` hoặc `cau-hinh.txt` ở thư mục gốc được nạp tự động (công cụ ghi file từ xa không cho ghi `.env*`). `ANTHROPIC_BASE_URL` để thử bằng `test/mock-anthropic.cjs` |
| `lib/vision.mjs` | **AI nhìn**: `partsOf` = **tách cảnh thật** (`-skip_frame nokey` + `select=gt(scene,0.28)` trên file đã đổi, GOP 1 s → cảnh 176 s mất ~4 s), đoạn < 2 s gộp, đoạn dài chia ≤ 8 s (video chính ≤ 10 s, ≤ 30 đoạn) → ảnh ghép 3 khung khoá 240 px → `APP_URL/api/vision` (Workers AI, miễn phí, 8 ảnh/lần) → `m.parts[{from,to,thay,cut,map}]` → `mergeSame` gộp đoạn liền cùng nhãn. `tagBrolls` (cảnh phụ → brief `brolls[].parts`) + **`tagMain`** (video chính → brief `main_scenes`, chạy song song lúc chép lời) để AI đối chiếu lời nói ↔ hình. Dữ liệu thật: 71 s → 18 s |
| `lib/cache.mjs` | **Bộ nhớ phân tích** theo file gốc (`fileKey` = sha1(VER + cỡ + 2 MB đầu/cuối)) → `cache/<khoá>/`: `main.mp4`/`broll.mp4` (liên kết cứng), `words-<ngành>.json`, `main-/broll-<ngành>.json` (nhãn cảnh). Dựng lại cùng video: 18 s → 3 s (thử), video 4K bỏ ~280 s đổi file. Đổi cách đổi file/lọc giọng → tăng `VER` |
| `lib/queue.mjs` | `slot('cpu'|'render', fn, onQueue)`: tối đa `XUONG_CPU` (2) việc đổi file và `XUONG_RENDER` (2) việc xuất cùng lúc, còn lại xếp hàng, báo số thứ tự (`/api/health` → `queue`) |
| `lib/gen.mjs` | Timeline → HTML HyperFrames. Kho mẫu: `video` (đoạn cắt, zoom xen kẽ 1/1,12, **`punch` = giật zoom ±10 %** từng khúc fromTo nối nhau), `broll` (`whip|zoom|push|radial|fade|blur|slide`), **`label`** (block/kicker/bars/pill/mask — nhãn phòng, thẻ chương, tên người nói), **`fx`** (leak/flash/burn, lớp phủ z 5), **`cta-follow`**, `hook-band`, `key-pop` (`*từ*` tô màu), `spec-gold`, `price-red` (màu red/green/gold/blue, `sub` = chữ ký tay), `cta`, `badge` (14 icon SVG), `karaoke` (phụ đề từng chữ), `sfx`. Màu theo ngành `GENRES` |
| `lib/run.mjs` | Chạy lệnh ngoài; Windows: `npx`/`claude` là .cmd → chạy qua shell, có đặt ngoặc kép |
| `kit/LUAT-DUNG.md` | Luật dựng cho Claude Code — chép vào `jobs/<id>/CLAUDE.md`; định dạng `plan.json` / `ops.json` |
| `kit/` | kit.css, 4 font Việt (OFL), gsap.min.js, **`kit/sfx/`** (từ 4/11 19:41 = bộ tiếng skill batdongsan-editor mẫu 1: `key1..6` gõ phím đầu dòng phụ đề, `lk_a`/`lk_b` cụm chữ — tiếng Giang gửi 28/10; `whoosh`/`air`/`thud` tổng hợp bằng `hook_sfx.py` của skill; ding/pop/whoosh.wav cũ chỉ còn cho job cũ), **64 emoji 3D Fluent (MIT)** `kit/emoji/*.svg` + `nhan.json` (nghĩa tiếng Việt cho AI) — gửi lên máy Giang dạng 1 file `emoji-pack.json`, `pipeline.mjs` tự bung lần đầu. Icon/emoji vẽ TRONG khối chữ (`.lock > .ico`, phía trên dòng dẫn) → không bao giờ che chữ; emoji lắc nhẹ (`icoAnim`) |
| `ui/index.html` | Trang (màu Higgsfield, font Geist, **không có chữ “xưởng”/HyperFrames**): chọn ngành + tải lên → **dựng trực tiếp**: hỏi `GET /api/jobs/:id?seq=` mỗi giây, `live` (media, words, sentences, silences, autoDrops, draft, cuts) vẽ theo GIÂY GỐC — khối video đang chuẩn bị (sọc chạy), khối câu chép lời, vạch cắt đỏ (lặng / ekip / nói lại), chữ + cảnh phụ AI vừa viết; con trỏ diễn theo hàng `aq` (dài > 6 thì nhanh) → xong: vạch cắt mờ, timeline co về giờ sau cắt, diễn nhanh icon/âm thanh/phụ đề. Video dài: `setScale` thu nhỏ px/giây. Xuất báo thứ tự hàng chờ |
| `CAI-DAT.cmd` / `CHAY-XUONG.cmd` | Cài 1 lần / chạy xưởng + `cloudflared tunnel --url http://localhost:8790` |

Claude Code gọi: `claude -p "<lệnh tiếng Anh ngắn>" --output-format json --allowedTools Read,Write --permission-mode acceptEdits --max-turns 8`
(cwd = thư mục dự án, timeout 240 s; prompt ASCII để tránh lỗi mã chữ cmd.exe — nội dung tiếng Việt nằm trong file).

## Kiểm thử (máy ảo Linux, 2 nhân, 8 GB)
`XUONG_AI=local XUONG_KEY=test123 node server.mjs` rồi `SIZE=1440x900 EXPORT=1 node test/ui.cjs` (và `SIZE=390x844`).
Đường Claude kiểm bằng CLI giả `test/fake-claude` (đặt vào PATH) — KHÔNG phải AI thật.

## MASTER EDITING RULES V1.0 (Giang 4/11 17:05 — bản gốc `docs/MASTER-RULES-V1.md`, phần 2 luật theo ngành)
- **`lib/styles.mjs`**: 20 ngành (`INDUSTRIES`: id, tên, phong cách, CTA, genre cũ) → **10 phong cách** (`STYLES`) với THÔNG SỐ THẬT: `pace`
  (punchGap, punchKey, textEvery, brollEvery), `punch` jump|smooth|none, `pauseKeep` (khoảng nghỉ giữ lại), `coldOpen` (sự kiện/tài liệu/giáo dục giữ
  trình tự), `brollVol` (tiếng môi trường cảnh phụ), `sfx` hi|mid|lo|min, `transitions`, `label`, `anim` pop|stamp|slide|fade, `subs` {look stroke|box|clean,
  scale}, `fonts` {head, big}, `grade` {sat,bri,con,warm}, `fx` {leak, flash}; `RULES` = luật từng nhóm ngành gửi AI (`brief.industry_rules`).
  `resolveStyle(job,p)`: khách chọn > AI chọn (`understand.industry/style`) > theo ngành > genre cũ > bds. BĐS giữ đúng màu Giang chốt (1,15/1,10/1,05).
- Gen: `#root.st-<phong cách>` → kiểu chữ điểm nhấn riêng (bán hàng: ô màu nghiêng · doanh nghiệp: gạch chân · giáo dục/phỏng vấn: ô tối · cinematic/
  làm đẹp/ẩm thực: cụm nhấn viết tay · vlog: nhãn dán), `--f-head/--f-big`, phụ đề `look-*`, punch `smooth` = đẩy 0,9 s +6 %. Mẫu mới: **`list`** (✓ / bước),
  **`stat`** (số chạy 0 → giá trị, GSAP onUpdate — chạy đúng khi tua), **`quote`** (trích dẫn). Đo trên căn LJN: giật zoom bán hàng 37 · BĐS 24 (mượt) ·
  doanh nghiệp 3 · cinematic 0; âm thanh nhấn 44–47 vs 2–3; 7 phong cách đều 0 chỗ đè chữ (`test/overlap.cjs`).
- Cảnh phụ giữ tiếng (`broll-amb.mp4` trong bộ nhớ, aac 96k) — chỉ phát khi `T.brollVol > 0`.
- **Thiếu cảnh quay** `plan.missing` + `missingFootage` (BĐS: không gian người nói nhắc mà không cảnh nào cho thấy) → thẻ “AI hiểu video”.
- **`lib/qc.mjs`** chấm 100 điểm đúng 10 mục Master Rules VIII, MÁY ĐO THẬT (im lặng sót, khoảng không lời, đoạn không đổi, 2 chữ lớn cùng lúc, cảnh phụ dùng/khách gửi,
  lặp đoạn, phụ đề phủ lời, chữ tô 1 tiếng lẻ, LUFS/đỉnh giọng, mật độ SFX, màu quá mức) → `j.qc` sau dựng + sau chat; sau xuất `qcExport` đo out.mp4
  (thời lượng, có tiếng, `blackdetect`, `freezedetect`, LUFS). Trang: “85/100 · Tốt”, chạm thẻ xem từng mục. Nhạc nền: ghi “chưa có” (chờ Giang chọn nguồn có bản quyền).
- Chat: `{"op":"style","style":"cinematic"}` dựng lại timeline theo phong cách mới từ plan.json (không gọi AI). Trang tạo: ô chọn ngành (Tự động + 20) + phong cách (Tự động + 10), `GET /api/styles`.

## CHAT SỬA VIDEO — AI làm được như editor (Giang 4/11 16:48: “yêu cầu gì AI cũng không hiểu”)
- Trước đây AI chat chỉ thấy danh sách clip (KHÔNG có lời thoại, KHÔNG có cảnh phụ) + 3 thao tác → 3/4 lần trả `{"ops":[]}` → trang báo “chưa hiểu”.
- Giờ `chat.json` có `transcript` (lời theo GIỜ TIMELINE), `brolls` (file, tên, `parts[].thay`), `settings`; AI trả `{"say","ops"}` — `say` LUÔN có
  (làm gì / vì sao không làm được + cách gần nhất), hiện ở thanh trạng thái (điện thoại không có ô nhật ký). Thao tác: `update` (kể cả đổi `file`/`from`
  cảnh phụ) · `remove` · `add` (text/label/fx/**broll** — thay cảnh đang ở đó) · **`cut`** (`rippleCut`: xoá khoảng + dồn, tách đoạn video vắt qua,
  dời punch/phụ đề) · **`subs`** {scale, pos mid|bottom|low, color, mode meaning|word, hide} · **`texts`** {scale, color} · **`sfx`** {vol, off} ·
  `grade` · **`replan`** {note} (lập lại kế hoạch với `brief.user_note`, giữ màu/phụ đề/chữ/âm thanh khách đã chỉnh). `localCommand` hiểu các câu
  thường gặp khi AI lỗi (“cắt đoạn 1:20 đến 1:25”, “phụ đề to hơn đưa lên giữa”, “tiếng vút nhỏ lại”, “chữ to hơn”, “làm lại …”).
- `j.chatLog` lưu mọi câu khách chat + `say` + thao tác → khách báo “AI không hiểu” thì đọc `state.json` → `chatLog`.
- Chữ to tự co vừa khung (`fitBig` 1 dòng, `fitKey` ≤ 2 dòng) để “chữ to hơn” không đè nhãn; CSS chỉnh của khách đặt SAU kit.css (đặt trước bị kit.css đè mất).

## LUẬT CỨNG: KHÔNG ĐÈ CHỮ (Giang 4/11 16:21)
- Vùng dọc (9:16): **11–42 %** chữ điểm nhấn/hook · **45–60 %** nhãn (49 %) HOẶC nút kết (47 %) / theo dõi (45 %) — không cùng lúc · **67–76 %** phụ đề.
  Nhãn luôn 1 dòng (`--lfs` tự thu nhỏ theo độ dài). Đổi vị trí bất kỳ khối chữ nào → chạy `node test/overlap.cjs file://…/index.html` (đo khung chữ
  thật mỗi 0,25 s, báo ❌ cặp đè). 4/11: bắt đúng “NHẮN TIN XEM NHÀ NGAY” đè phụ đề “trồng cây xanh” + chương “LẦU 2 VÀ SÂN THƯỢNG” 2 dòng đè phụ đề.

## LUẬT CỨNG: không để cắt thoại sai lặp lại (Giang yêu cầu 4/11 15:33)
- Mỗi lần Giang báo **cắt sai** → (1) lấy `state.json` của job lỗi trên laptop, (2) sửa luật, (3) lưu thành bài kiểm tra:
  `node test/cut-regress.mjs --add <state.json> <ten-loi> "<ghi chú>" "<câu phải bỏ, vd 5-11>"` (lưu lời chép + đáp án vào `test/loi-cat/`).
- **Trước khi chép code lên laptop / đẩy GitHub: `node test/cut-regress.mjs` phải ra toàn ✅.** Có ❌ = sửa mới làm hỏng lỗi cũ → không giao.
- Đang có: `nha-xinh-noi-lai` (nói lại 35,8–82,5 s), `gia-3-ty-lai-nha` (câu hỏng + “lại nha”), JSON AI hỏng. Lỗi cần âm thanh (lặng ngoài đường, vấp “đăng ký kênh”) kiểm bằng `test/real-check.mjs` với voice.wav thật.

## Kiểm thử thêm (4/11 chiều)
`/home/claude/restart.sh` (máy dựng + Anthropic giả) · `AROLL=/tmp/aroll2.mp4 BROLL="/tmp/Phong bep.mp4" SIZE=1440x900 node test/ui.cjs` (chụp `test/out-*-live-*.png`).
Giọng thử có ồn nâu + 1,6/0,9/1,2/1,1/1,5 s lặng + “Giá ba tỷ. Lại nha.” rồi nói lại giá đủ: 21,9 s → 13,3 s, bỏ đúng câu hỏng + “lại nha”, không mất chữ nào.
5 khách cùng lúc (máy 2 nhân): dựng xong cả 5 trong 47 s, xuất 5 × 13 s xong sau ~250 s, hàng chờ báo đúng thứ tự 1-2-3.

## Luật dựng chuyên nghiệp (4/11 15:00, Giang duyệt bước 1 + 2)
- **Mở đầu gây tò mò** `plan.cold_open {start,end}` (giây gốc, 1,2–5 s, bám đầu/cuối chữ, không trong `drop`, chỉ khi sau cắt ≥ 20 s):
  đoạn `cold:true` đứng đầu `job.segs`; `toTl`/`fwd` BỎ QUA đoạn cold (chữ/cảnh phụ ăn theo lần nói chính); phụ đề có bản sao cho đoạn cold;
  `job.coldDur`; chớp trắng `fx flash` ở cuối đoạn cold; cảnh phụ không đặt trong đoạn cold. Bộ dự phòng: câu có giá 1,5–4,5 s.
- **Thẻ chương** `plan.chapters [{start,title}]` → `label` kicker "01 · VỊ TRÍ" + vệt sáng (≤ 3); ≥ 12 s/chương, ≤ 5.
- **Nhãn cảnh phụ** `brolls[].label` (BĐS: thiếu thì lấy `parts[].thay` ≤ 18 ký tự, ≤ 3 từ, không phải bản đồ); không lặp nhãn trong 40 s; 1 nhãn 1 lúc.
- **Đổi nhịp ≤ 4 s** `punches()`: mốc thay đổi = đoạn video, cảnh phụ (đầu+cuối), chữ, nhãn; khoảng > 4 s không bị cảnh phụ che → giật zoom ở đầu chữ gần giữa; key-pop cũng giật zoom. `makeCutouts` xoá `punch` ở đoạn có chữ sau người (lớp người phải zoom khớp).
- **Giọng rõ**: aroll đổi file với `VOICE_AF` (highpass 80 · afftdn · acompressor · loudnorm −14 LUFS · bù trễ 25 ms của bộ lọc, đo tương quan = 0 ms); `XUONG_VOICE=0` tắt. voice.wav (chép lời + đo lặng) lấy từ file GỐC.
- **Vùng an toàn TikTok**: chữ lớn từ 11 %, phụ đề 67 % lề phải 160 px, nút kết đáy 22 %, nhãn 55 % bên trái.
- **Cảnh phụ vào sớm 0,3 s** (bản đồ đúng giờ), dài thêm 0,3 s, ≤ 3,4 s; kiểu vào xoay vòng khi AI không chọn.
- Người nói tự giới thiệu → `plan.speaker {name,role}` → thanh tên `bars`. Nhắc tên kênh → `channel` + `cta_style:"follow"`.
- Kho mẫu lấy ý từ registry HyperFrames (Apache 2.0, ghi công `kit/GHI-CONG-HYPERFRAMES.txt`). KHÔNG dùng khối shader (light-leak/cinematic-zoom/glitch…): chúng chụp DOM thành texture, không chạy với video.
- Kiểm: `node test/pro-check.mjs <thư mục> <job thật>` (dữ liệu Nhà Xinh: cold open “3 tỷ 990 triệu, còn thương lượng” 3,6 s, 5 chương, 6 nhãn phòng, 25 lần giật zoom, khoảng không đổi dài nhất 3,9 s).

## AI đọc hiểu video + kịch bản dựng (4/11 15:40, Giang: “cái khách cần nhất”)
- `plan.understand {summary, audience, goal, tone, best}` + `plan.script [{part, from, to, goal, visual}]` (số câu) — khoá ĐẦU TIÊN của plan
  (luồng chữ vẽ ngay: thẻ “AI hiểu video” + các phần hiện dần). `finalize` → `job.story {…understand, parts[{part,goal,visual,tl}]}`; không có
  `chapters` thì lấy các phần giữa của kịch bản (≥ 45 s). Bộ dự phòng: kịch bản theo loại câu (MỞ ĐẦU / VỊ TRÍ / GIÁ BÁN / KẾT / CHI TIẾT).
- Trang: `#story` dưới thanh trên cùng (điện thoại: tóm 2 dòng, chạm để mở), bấm phần → `pl.seek`.

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
- 2026-11-04 14:31 (Giang chat “làm chữ HOOK ấn tượng to ẩn sau nhân vật”, AI trả lời “chưa hỗ trợ”): HyperFrames CÓ `remove-background`
  (mô hình chạy trên máy, ra WebM trong suốt). Làm: `props.behind` → `makeCutouts` cắt đúng đoạn video chính dưới chữ → tách nền → clip
  `cutout` (z-index 4 > chữ 3, zoom khớp đoạn video bên dưới); `props.big` = hook chữ cực to; `props.emoji` + `emojiSize:"big"` = emoji 520 px.
  Thử trên Aroll Nhà Xinh 8 s: tách nền 3 s mất 92 s (2 nhân, 1,4 khung/giây), chữ “KHU” nằm sau đầu chị, xuất MP4 OK (90 s).
  Chat chạy NỀN (`j.chat`, trang hỏi lại) vì đường hầm cắt yêu cầu > 100 s. Xem nhanh trên iPhone: Safari không phát WebM trong suốt → bản
  xem nhanh có thể thấy chữ trước người, MP4 xuất vẫn đúng.
- 2026-11-04 14:45 (Giang: bản đồ chỉ chèn 1 đoạn ngắn, không khớp lời): cảnh phụ thường bị giới hạn 1,5–3 s. Làm: `vision` đánh dấu đoạn
  `map` (bản đồ / vệ tinh / lộ trình); `mapPlan` = khoảng AI ghi `{"kind":"map", start, end}` hoặc tự tìm các câu liền nhau khớp `LOC_RE`
  (giáp ranh, cách … km, cao tốc, chợ, thuộc xã/huyện…) → nối các đoạn bản đồ liền nhau của cùng file cho đủ dài (≤ 40 s), hiện suốt lúc nói.
  Dữ liệu thật: bản đồ 12,5 s trùng đúng 2 câu “Phước Lý Cần Giuộc… giáp ranh Bình Chánh… cao tốc Bến Lức – Long Thành… cách chợ Bình Chánh 2 km”.
  Kèm: AI trả `fix` sửa chính tả tên riêng trong phụ đề (“Cần Dũ” → “Cần Giuộc”, “trợ” → “chợ”) — `applyFixes` thay chuỗi chữ liên tiếp, giữ giờ.
- 2026-11-04 15:20: nhãn `mask`/`bars` dùng `clip-path` → cắt mất dấu tiếng Việt phía trên (“BẾP MỞ” → “BEP MƠ”) → thêm padding-top.
- 2026-11-04: cảnh phụ “Đăng tiktok cô thùy 2” là video ĐÃ DỰNG (có chữ, phụ đề đóng cứng) → ghép vào bị chồng 2 lớp chữ. Nên dặn khách gửi cảnh quay gốc.
- 2026-11-04 15:27 (Giang: “vẫn cắt thoại sai, lỗi như cũ”): job NcaHiydzHDTj_s4_ — Haiku trả JSON hỏng 1 ký tự (dòng 38) → `JSON.parse` lỗi →
  bỏ CẢ kế hoạch → bộ dự phòng (không biết bắt nói lại) → đoạn nói hỏng 35,8–82,5 s còn nguyên. Sửa 2 lớp: (1) `parseLoose` trong ai.mjs: thoát dấu "
  trong chuỗi, bỏ phẩy thừa, không được thì nhặt từng mục `objs()` (`_salvaged`); lưu bản AI viết ra `jobs/<id>/ai-plan.txt` để soi; luật dặn không dùng " trong chuỗi.
  (2) `retakeGuess` (máy tự đoán nói lại: dừng ≥ 3 s / buột 1–2 chữ / “lại nha” → câu 60 s trước có ≥ 40 % cặp chữ lặp lại trong 40 s sau) → gửi AI dạng
  `retake_hint`; AI lỗi hoặc mất `drop` thì dùng luôn (vẫn qua `checkDrops`). 3 bản chép lời thật đều ra câu 5–11; 10+ video thử khác không bắt nhầm.
  Mô phỏng AI hỏng trên dữ liệu thật: cắt 63 s → còn 161 s, không mất chữ nào ngoài đoạn bỏ (trừ chữ Whisper kéo dài qua chỗ vấp).
- 2026-11-04 15:54 (Giang: “AI cắt chuẩn mà không thấy xoá”): trang vẽ 39 vạch “cắt khoảng lặng” từ `job.silences` THÔ, nhưng finalize chỉ cắt 20
  (lặng ngắn sau khi chừa 0,1/0,15 s còn < 0,15 s; lặng dài bị “lõi chữ” chặn vì máy chép lời báo chữ kéo dài phủ qua, vd “Vô, hai” 71,6–72,7 phủ 1,15 s
  im lặng). Sửa: `silenceCuts(job)` = MỘT nguồn cho cả vạch đỏ (server gửi `live.silences`) lẫn lúc cắt; lặng ≥ 0,45 s cắt theo âm thanh (không trừ lõi chữ,
  còn 0,25 s nghỉ), ngắn hơn mới trừ lõi chữ; lúc xong trang xoá hết vạch, vẽ lại đúng `job.cuts` (đoạn AI đề nghị mà chốt an toàn giữ lại thì vạch biến mất).
  Dữ liệu thật: 25 vạch = 25 chỗ xoá thật, im lặng sót dài nhất 0,40 s (trước 1,15 s), không mất chữ. Bài kiểm tra `nha-xinh-noi-lai` giờ kèm `silences` đo từ âm thanh.
- 2026-11-04 16:21 (Giang, căn LJN1n4GmxcIHWLBj — 13 cảnh phụ): (1) **chỉ 3/13 cảnh vào video**: Haiku “nghĩ” hết `max_tokens` 16 000 (~16 k token ra,
  0,0094 USD) → kế hoạch cụt giữa `brolls` → nâng 48 000 + `job.aiStop/aiTruncated` + **`fillBrolls`** (máy ghép bù cảnh chưa dùng: so TÊN FILE khách đặt
  + nhãn AI nhìn với lời nói, GIỮ DẤU khi so — bỏ dấu thì “tiện”=“tiền”; chữ chung “lầu/phòng/sân” đứng 1 mình không tính; câu giới thiệu tổng quát 12 %
  đầu bị trừ điểm; không khớp thì không ép) → 13/13 cảnh đúng lời; bộ dự phòng cũng dùng cách này thay vì rải đều. (2) **khoảng không lời có tiếng động
  còn sót 1–2 s** (150–155 s) → mọi khoảng ≥ 0,9 s không có chữ đều cắt (chừa 0,15 s). (3) “Đấy, anh ơi.” = ekip (CUE); vấp đầu câu rồi nói lại ngay
  (câu ≤ 10 chữ, câu sau trùng ≥ 4 chữ đầu) → `retakeGuess`. (4) **chữ tô màu phải đủ nghĩa**: phụ đề tô cả CỤM (`plan.keywords` + cụm *…* ≥ 2 tiếng +
  số + đơn vị — `markKeywords`), tiếng đang nói chỉ nảy nhẹ; luật key-pop: tô trọn cụm (*CÂY XANH*, *ĐỌC SÁCH*). (5) **SFX to hơn**: 3 file chuẩn đỉnh −2 dB
  (trước −12/−24/−19 dB), `SFX_VOL`. (6) **chỉnh màu tự động** `DEFAULT_GRADE` bão hoà 1,15 · sáng 1,10 · tương phản 1,05 = CSS `filter` trên mọi
  `video.clip` (kể cả lớp người tách nền; kiểu vào zoom/blur ghép chung filter) — xuất không chậm hơn (55 s vs 62 s / 8 s); nét +10 % = `unsharp=5:5:0.35`
  lúc đổi file (cache `VER` v4); chat `{"op":"grade"}` / localCommand “bớt sáng”, “màu rực hơn”, “tắt chỉnh màu”. (7) nút **↻ Dựng lại** (POST start lại,
  dùng file đã tải + bộ nhớ phân tích). Bài kiểm tra mới `lang-dai-hoc-tieng-dong`.
- 2026-11-04: sửa bằng `re.sub(count=1)` trúng NHẦM lệnh start của nút “AI dựng video” (`${id}` → `${job.id}`) → ui.cjs bắt được (kẹt ở bước mở trình dựng). Luôn chạy ui.cjs sau khi sửa trang.
- 2026-11-04 16:48: chú thích `// …` chèn giữa dòng object trong server.mjs NUỐT MẤT `autoDrops` của `live` (trang không vẽ câu ekip tự bỏ) → dùng `/* … */`.
- 2026-11-04 19:41 (Giang, job zRRzNeeYHDJmfzld — “SFX ồn quá, thay giống skill batdongsan editor; cảnh phụ giật lag, ra quá nhanh, không slow motion;
  thẻ AI hiểu video / bảng điểm mở không tắt được; chữ điểm nhấn để lâu thêm; cắt lặng, lỗi được hết rồi”):
  (1) **SFX** = bộ mẫu 1 (`SFX_VOL`/`SFX_DUR` trong pipeline): mỗi cụm chữ 1 tiếng lúc chữ chạm (đổi lk_a ↔ lk_b), phụ đề gõ phím CHỈ đầu dòng cách ≥ 3,5 s
  (hi 2,5 · lo 5 · min không gõ) nhường 0,6 s quanh tiếng khác, cảnh phụ vào = vút êm / hơi thở 0,3, icon / nhãn / giật zoom / nút kết không tiếng, bỏ ding/pop
  (đo: ding/pop cũ âm TB −6 dB = tiếng chói đặc; tiếng Giang −17…−27 dB). Dữ liệu thật: 42 tiếng chói → 89 tiếng nhẹ (27/phút, 46 là gõ phím 0,05 s; mẫu 1 duyệt 26/phút).
  QC tính gõ phím nửa tiếng. (2) **Cảnh phụ giật** = cảnh DJI quay **50 khung/s** bị ép về 30 khung bỏ 2/5 khung không đều (đo dao động bước khung 35 %)
  → **quay chậm** `slowOf(fps)`: ≥ 47 khung → `setpts=PTS*fps/30,fps=30` (50 → 0,6×, 60 → 0,5×: mỗi khung gốc = 1 khung ra, dao động 6 %, bản xuất 9 %);
  24–30 khung → 0,8× + `framerate` hoà khung. File cảnh phụ dài k lần, `m.slow`/`m.dur` = giờ file đã chậm; nhãn AI nhìn nhớ theo giờ gốc (× k khi đọc);
  bộ nhớ đổi tên `broll-s1.mp4`/`broll-amb-s1.mp4` (video chính không phải đổi lại); tiếng môi trường `atempo`; bỏ luồng dữ liệu DJI (`-dn -sn`).
  Đổi file chậm không tốn thêm thời gian (giải mã HEVC 3K chiếm hết). `XUONG_SLOW=0` tắt. (3) **Chuyển cảnh mượt**: vào 0,5–0,55 s sine/power2
  (mờ / đẩy nhẹ 1,22 / hoà), ra = hoà 0,4 s; BĐS, doanh nghiệp, giáo dục, làm đẹp, cinematic, phỏng vấn bỏ whip/radial/push/slide. Cảnh phụ dài theo
  `bLen` của phong cách (BĐS 3,4–4,5 s, trước 2,3–2,9 s), dừng trước cảnh kế 0,3 s để không mất cảnh nào. (4) Chữ điểm nhấn `tMin` ≥ 3 s, giữ thêm ~1 s,
  tới sát chữ sau (dữ liệu thật 2,0–2,6 → 2,7–4,0 s, 0 chồng nhau, `overlap.cjs` 0 đè); hook 3 s. (5) Thẻ “AI hiểu video”: nút ✕, chạm ra ngoài thu gọn,
  mở tối đa 55 % màn hình (cuộn trong thẻ) — trước mở ra che hết video. Kiểm job thật không cần video: `node test/sim-job.mjs <job> <ra> 1.6667`.
- HyperFrames có gói trả phí "HyperFrames Pro" (templates, style-sampling) và bật telemetry mặc định → `npx hyperframes telemetry disable`.
