#!/usr/bin/env bash
# CÀI MÁY DỰNG LÊN VPS (Ubuntu 24.04) — chạy 1 lần bằng tài khoản root:
#   curl -fsSL https://raw.githubusercontent.com/truonggiang2511a-droid/dung-video-ai-xuong/main/deploy/cai-vps.sh | bash
# (repo riêng tư thì: git clone bằng mã GitHub rồi chạy  bash deploy/cai-vps.sh  trong thư mục đó)
# Xong: sửa /opt/xuong/cau-hinh.txt (khoá Claude, XUONG_SECRET, XUONG_PUBLIC_URL) → systemctl restart xuong
set -euo pipefail
DIR=/opt/xuong
REPO=${REPO:-https://github.com/truonggiang2511a-droid/dung-video-ai-xuong.git}

echo "== 1. Gói hệ thống: ffmpeg (có zscale chuyển màu HDR), git, thư viện cho Chrome của HyperFrames, phông chữ"
apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get install -y ffmpeg git curl ca-certificates fonts-noto-core fonts-noto-color-emoji \
  libnss3 libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
  libxrandr2 libgbm1 libasound2t64 libpango-1.0-0 libcairo2 libxshmfence1
ffmpeg -hide_banner -filters 2>/dev/null | grep -q zscale && echo "ffmpeg có zscale ✓" || echo "⚠ ffmpeg thiếu zscale (video iPhone HDR sẽ không chuyển màu)"

echo "== 2. Node.js 22"
if ! node -v 2>/dev/null | grep -q '^v2[2-9]'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node -v

echo "== 3. Người dùng riêng 'xuong' (không chạy bằng root) + mã nguồn"
id xuong >/dev/null 2>&1 || useradd -m -s /bin/bash xuong
if [ ! -d "$DIR/.git" ]; then git clone "$REPO" "$DIR"; else git -C "$DIR" pull --ff-only; fi
chown -R xuong:xuong "$DIR"
sudo -u xuong bash -lc "cd $DIR && npm ci --no-audit --no-fund && npx --yes hyperframes telemetry disable || true"

echo "== 4. File cấu hình (KHÔNG đưa lên GitHub)"
if [ ! -f "$DIR/cau-hinh.txt" ]; then
  sudo -u xuong cp "$DIR/deploy/cau-hinh-mau.txt" "$DIR/cau-hinh.txt"
  chmod 600 "$DIR/cau-hinh.txt"
  echo "→ Mở $DIR/cau-hinh.txt điền khoá (nano $DIR/cau-hinh.txt)"
fi

echo "== 5. Chạy nền như dịch vụ (tự mở lại khi lỗi / khởi động lại máy)"
cp "$DIR/deploy/xuong.service" /etc/systemd/system/xuong.service
systemctl daemon-reload
systemctl enable --now xuong
sleep 3
systemctl --no-pager status xuong | head -n 12 || true
curl -s http://127.0.0.1:8790/api/health && echo
echo "== Xong. Xem nhật ký: journalctl -u xuong -f   · Cập nhật code: bash $DIR/deploy/cap-nhat.sh"
