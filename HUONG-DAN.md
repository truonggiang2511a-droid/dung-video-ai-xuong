# Máy dựng (HyperFrames) trên laptop — hướng dẫn cho Giang

Bản thử nội bộ, chỉ admin dùng. Khách đang dùng app Dựng Video AI vẫn chạy bộ canvas như cũ, không bị ảnh hưởng.

## Luồng chạy
1. Mở link `https://….trycloudflare.com` (trên điện thoại hoặc máy tính) → chọn ngành → chọn video chính + cảnh phụ → **Gửi sang xưởng dựng**.
2. Laptop nhận video → đổi sang H.264 → chép lời (dùng Whisper của app) → cắt lặng → **Claude Code** đọc `CLAUDE.md` (luật dựng)
   và lời nói, ghi kế hoạch → xưởng dựng thành video HyperFrames.
3. Trang hiện timeline, **con trỏ AI diễn lại từng thao tác** (ghép cảnh phụ, thêm chữ, icon, âm thanh, phụ đề) và nói vì sao.
   Trình phát bên trên là bản xem nhanh HyperFrames, giống bản xuất.
4. Bấm vào clip → gõ yêu cầu (vd “đổi giá sang màu xanh lá”) → Claude Code sửa → con trỏ diễn chỗ vừa sửa.
5. Bấm **Xuất** → laptop render MP4 → **Tải video MP4**.

## Cài lần đầu (1 lần)
1. Chép thư mục này vào `D:\Giang-Workspace\dung-video-ai-xuong`.
2. Bấm đúp **CAI-DAT.cmd**: kiểm Node, ffmpeg, Claude Code, cài cloudflared + HyperFrames 0.9.10, tắt gửi dữ liệu về HeyGen.
3. Claude Code phải đăng nhập 1 lần: mở PowerShell, gõ `claude`, làm theo hướng dẫn, rồi thoát.

## Mỗi lần chạy
Bấm đúp **CHAY-XUONG.cmd** → mở 2 cửa sổ:
- **Xưởng dựng**: in **mã xưởng** (dán vào trang khi được hỏi, chỉ hỏi 1 lần mỗi máy).
- **Đường hầm**: tìm dòng `https://….trycloudflare.com` → mở link đó.
Link đổi mỗi lần chạy lại. Laptop tắt, ngủ hoặc mất mạng thì trang báo lỗi.

## Bộ não AI — file `cau-hinh.txt` (làm 1 lần)
1. Mở `cau-hinh.txt` bằng Notepad.
2. Dán khoá API Claude vào dòng `ANTHROPIC_API_KEY=` (tạo khoá RIÊNG ở console.anthropic.com → API Keys, đặt hạn mức chi tiêu).
3. Giữ `XUONG_AI=api` → Claude Haiku: ~0,003 USD (≈ 80đ) / video 4 phút (ước tính), chữ AI chọn hiện ngay trên timeline.
   Chưa có khoá → máy dựng tự dùng Claude Code (chỉ thử nội bộ).
4. Tắt cửa sổ máy dựng, bấm lại CHAY-XUONG.cmd.

## Lưu ý
- **Claude Code dùng tài khoản Claude của Giang → CHỈ để thử nội bộ.** Phục vụ khách thật phải chuyển sang khoá API
  (Anthropic không cho bên thứ ba dùng gói thuê bao cá nhân, đã ghi trong CLAUDE.md của dung-video-ai mục 6).
- Muốn chạy không cần AI: trong `cau-hinh.txt` đặt `XUONG_AI=local` (bộ dựng dự phòng theo luật).
- Nhiều khách cùng lúc: tối đa `XUONG_CPU` việc đổi file + `XUONG_RENDER` việc xuất chạy song song (mặc định 2 + 2), khách sau xếp hàng, trang báo thứ tự.
- Laptop RAM ≤ 8 GB: HyperFrames tự hạ xuống 1 luồng. Xưởng đã bật `--no-low-memory-mode`; nếu render bị treo / hết RAM,
  đặt biến `XUONG_LOWMEM=1`.
- Mỗi dự án nằm trong `jobs\<mã>` (video gốc, bản H.264, `timeline.json`, `index.html`, `out.mp4`). Xoá thư mục cũ để dọn ổ.
- Video iPhone HDR có thể hơi nhạt màu (bản thử chưa chỉnh màu HDR → SDR).
