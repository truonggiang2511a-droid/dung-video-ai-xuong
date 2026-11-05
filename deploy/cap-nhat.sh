#!/usr/bin/env bash
# CẬP NHẬT MÁY DỰNG TRÊN VPS: lấy code mới từ GitHub rồi chạy lại (dự án đang dựng dở sẽ bị dừng — chọn lúc vắng khách)
set -euo pipefail
DIR=/opt/xuong
sudo -u xuong git -C "$DIR" pull --ff-only
sudo -u xuong bash -lc "cd $DIR && npm ci --no-audit --no-fund"
systemctl restart xuong
sleep 3; curl -s http://127.0.0.1:8790/api/health && echo
