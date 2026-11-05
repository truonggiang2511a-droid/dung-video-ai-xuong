#!/usr/bin/env bash
# CÀI MÁY DỰNG LÊN VPS (Ubuntu 24.04, tài khoản root) — dán 1 lệnh này vào cửa sổ đen (PowerShell đã ssh vào VPS):
#   curl -fsSL https://raw.githubusercontent.com/truonggiang2511a-droid/dung-video-ai-xuong/main/deploy/cai-vps.sh | bash
# Chạy lại lần 2 cũng được (bỏ qua bước đã xong). Không cần tên miền: dùng đường hầm nhanh Cloudflare (địa chỉ …trycloudflare.com,
# đổi mỗi lần đường hầm mở lại — máy dựng tự báo địa chỉ mới cho app chính trong ~30 giây).
set -euo pipefail
DIR=/opt/xuong
REPO=${REPO:-https://github.com/truonggiang2511a-droid/dung-video-ai-xuong.git}
say() { printf '\n\033[1;32m== %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m⚠ %s\033[0m\n' "$*"; }

[ "$(id -u)" = 0 ] || { echo "Cần chạy bằng root (đăng nhập ssh root@IP)"; exit 1; }
. /etc/os-release
[ "${ID:-}" = ubuntu ] || warn "Script viết cho Ubuntu (máy này: ${PRETTY_NAME:-?}) — vẫn thử cài"
ARCH=$(dpkg --print-architecture)
# VPS DÙNG CHUNG (đang chạy MT5 / Wine / máy tính từ xa…): máy dựng nhường CPU, không bật tường lửa đè lên cấu hình sẵn có
SHARED=${SHARED:-}
if pgrep -fi 'terminal64|metatrader|wine|xrdp|vnc|nxserver' >/dev/null 2>&1; then SHARED=1; fi
[ -n "$SHARED" ] && warn "VPS này đang chạy chương trình khác (MT5 / máy tính từ xa) → cài kiểu DÙNG CHUNG: máy dựng ưu tiên thấp, không đụng tường lửa / giờ hệ thống"
if ss -tln 2>/dev/null | grep -q ':8790 '; then warn "Cổng 8790 đang có chương trình khác dùng — dừng lại, báo Claude"; exit 1; fi

say "1/6 Gói hệ thống: ffmpeg, git, phông chữ, thư viện cho Chrome (HyperFrames), tường lửa"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
# Ubuntu 24.04 đổi tên vài thư viện (đuôi t64); 22.04 dùng tên cũ
if dpkg --compare-versions "${VERSION_ID:-24.04}" ge 24.04; then T=t64; else T=; fi
apt-get install -y sudo ffmpeg git curl ca-certificates openssl ufw fail2ban fonts-noto-core fonts-noto-color-emoji \
  libnss3 libatk1.0-0$T libatk-bridge2.0-0$T libcups2$T libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
  libxrandr2 libgbm1 libasound2$T libpango-1.0-0 libcairo2 libxshmfence1
ffmpeg -hide_banner -filters 2>/dev/null | grep -q zscale && echo "ffmpeg có zscale ✓ (video iPhone HDR đổi màu đúng)" || warn "ffmpeg thiếu zscale"
# tường lửa: máy dựng chỉ nghe 127.0.0.1, khách vào qua đường hầm Cloudflare → không cần mở cổng nào.
# CHỈ bật tường lửa khi VPS không có cổng nào khác đang mở ra ngoài (máy tính từ xa, MT5…) — bật nhầm là mất đường vào VPS
other=$(ss -Htln 2>/dev/null | awk '{print $4}' | grep -vE '^(127\.|\[::1\]|::1)' | grep -vE ':22$' || true)
if ufw status 2>/dev/null | grep -q 'Status: active'; then ufw allow OpenSSH >/dev/null; echo "Tường lửa đã bật sẵn — giữ nguyên, chỉ thêm ssh ✓"
elif [ -n "$SHARED" ] || [ -n "$other" ]; then warn "Không bật tường lửa vì VPS đang mở cổng khác: $(echo $other | tr '\n' ' ') — giữ nguyên như cũ"
else ufw allow OpenSSH >/dev/null && ufw --force enable >/dev/null && echo "Tường lửa bật, chỉ mở ssh ✓"; fi
systemctl enable --now fail2ban >/dev/null 2>&1 && echo "Chặn dò mật khẩu ssh (fail2ban) ✓" || true

say "2/6 Node.js 22"
if ! node -v 2>/dev/null | grep -qE '^v(2[2-9]|[3-9][0-9])'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node -v

say "3/6 Người dùng riêng 'xuong' + mã nguồn + thư viện (lần đầu ~3–6 phút)"
id xuong >/dev/null 2>&1 || useradd -m -s /bin/bash xuong
if [ ! -d "$DIR/.git" ]; then git clone --depth 50 "$REPO" "$DIR"; else sudo -u xuong git -C "$DIR" pull --ff-only || warn "Không lấy được code mới — dùng bản đang có"; fi
chown -R xuong:xuong "$DIR"
sudo -u xuong -H bash -lc "cd $DIR && npm ci --no-audit --no-fund --loglevel=error"
sudo -u xuong -H bash -lc "cd $DIR && npx hyperframes telemetry disable >/dev/null 2>&1 || true"
# tải sẵn Chrome dùng để xuất video (không thì lần xuất đầu tiên phải chờ tải)
sudo -u xuong -H bash -lc "cd $DIR && npx hyperframes browser ensure" || warn "Chưa tải được Chrome — lần xuất đầu sẽ tự tải"

say "4/6 Đường hầm Cloudflare (cloudflared)"
if ! command -v cloudflared >/dev/null; then
  curl -fsSL -o /tmp/cloudflared.deb "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb"
  dpkg -i /tmp/cloudflared.deb && rm -f /tmp/cloudflared.deb
fi
cloudflared --version

say "5/6 Chạy nền (tự mở lại khi lỗi / khi VPS khởi động lại)"
cp "$DIR/deploy/xuong.service" /etc/systemd/system/xuong.service
cp "$DIR/deploy/xuong-tunnel.service" /etc/systemd/system/xuong-tunnel.service
if [ -n "$SHARED" ]; then # VPS dùng chung: máy dựng dùng tối đa 1/2 số nhân + 40 % RAM, chương trình khác (MT5) luôn được ưu tiên
  mkdir -p /etc/systemd/system/xuong.service.d
  printf '[Service]\nCPUQuota=%s%%\nMemoryMax=40%%\n' "$(( $(nproc) * 50 ))" > /etc/systemd/system/xuong.service.d/dung-chung.conf
  touch "$DIR/.dung-chung"; chown xuong:xuong "$DIR/.dung-chung"
  echo "Giới hạn máy dựng: tối đa $(( $(nproc) / 2 )) nhân, 40 % RAM ✓"
fi
install -m 755 "$DIR/deploy/xuong-lenh.sh" /usr/local/bin/xuong
systemctl daemon-reload
systemctl enable xuong xuong-tunnel >/dev/null 2>&1

say "6/6 Cấu hình (khoá Claude, chuỗi bí mật nối app)"
if [ -e /dev/tty ] && { : </dev/tty; } 2>/dev/null; then
  bash "$DIR/deploy/cau-hinh.sh" </dev/tty
else
  warn "Không hỏi được (không có bàn phím) — chạy tiếp lệnh:  xuong cau-hinh"
fi
