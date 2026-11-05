#!/usr/bin/env bash
# CẬP NHẬT MÁY DỰNG TRÊN VPS:  xuong cap-nhat   (lấy code mới từ GitHub rồi chạy lại)
# Video đang dựng / đang xuất dở sẽ bị dừng → chọn lúc vắng khách. Đường hầm KHÔNG mở lại (địa chỉ giữ nguyên).
set -euo pipefail
DIR=/opt/xuong
[ "$(id -u)" = 0 ] || { echo "Cần quyền root"; exit 1; }
before=$(sudo -u xuong git -C "$DIR" rev-parse --short HEAD)
sudo -u xuong git -C "$DIR" pull --ff-only
after=$(sudo -u xuong git -C "$DIR" rev-parse --short HEAD)
echo "Code: $before → $after"
sudo -u xuong -H bash -lc "cd $DIR && npm ci --no-audit --no-fund --loglevel=error"
cp "$DIR/deploy/xuong.service" /etc/systemd/system/xuong.service
if ! cmp -s "$DIR/deploy/xuong-tunnel.service" /etc/systemd/system/xuong-tunnel.service; then
  cp "$DIR/deploy/xuong-tunnel.service" /etc/systemd/system/xuong-tunnel.service; TUN=1
fi
install -m 755 "$DIR/deploy/xuong-lenh.sh" /usr/local/bin/xuong
systemctl daemon-reload
systemctl restart xuong
[ -n "${TUN:-}" ] && systemctl restart xuong-tunnel
sleep 4
exec /usr/local/bin/xuong
