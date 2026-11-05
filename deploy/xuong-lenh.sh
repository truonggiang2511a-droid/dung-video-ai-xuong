#!/usr/bin/env bash
# Lệnh tắt cho Giang trên VPS (cài thành /usr/local/bin/xuong):
#   xuong              trạng thái: máy dựng, đường hầm, app đã thấy máy dựng chưa
#   xuong nhat-ky      xem nhật ký trực tiếp (Ctrl+C để thoát)
#   xuong cau-hinh     đổi khoá Claude / xem lại chuỗi bí mật
#   xuong ma-moi       xem 3 dòng dán Cloudflare + mã mời
#   xuong them-ma TEN  thêm 1 mã mời cho khách tên TEN (rồi dán dòng PRO_CODES mới vào Cloudflare)
#   xuong cap-nhat     lấy code mới từ GitHub rồi chạy lại
#   xuong khoi-dong-lai  mở lại máy dựng + đường hầm (địa chỉ đường hầm sẽ đổi, app tự biết sau ~30 giây)
set -uo pipefail
DIR=/opt/xuong
APP=$(grep -E '^APP_URL=' "$DIR/cau-hinh.txt" 2>/dev/null | cut -d= -f2-); APP=${APP:-https://dung-video-ai.truonggiang2511a.workers.dev}
ok() { printf '  \033[1;32m✓\033[0m %s\n' "$*"; }
no() { printf '  \033[1;31m✗\033[0m %s\n' "$*"; }
need_root() { [ "$(id -u)" = 0 ] || { echo "Cần quyền root (đăng nhập ssh root@IP)"; exit 1; }; }

case "${1:-}" in
  nhat-ky) exec journalctl -u xuong -u xuong-tunnel -f -n 60 ;;
  cau-hinh) need_root; exec bash "$DIR/deploy/cau-hinh.sh" ;;
  cap-nhat) need_root; exec bash "$DIR/deploy/cap-nhat.sh" ;;
  khoi-dong-lai) need_root; systemctl restart xuong xuong-tunnel; sleep 8; exec "$0" ;;
  ma-moi) need_root; cat "$DIR/ma-moi.txt"; c=$(grep -E '^PRO_CODES=' "$DIR/ma-moi.txt" | cut -d= -f2-)
    echo; echo "Link mời từng khách:"; IFS=, read -ra L <<< "$c"; for it in "${L[@]}"; do echo "  ${it%%:*}: $APP/pro?c=${it#*:}"; done; exit 0 ;;
  them-ma) need_root; t=$(printf '%s' "${2:-}" | tr -cd 'a-zA-Z0-9_-'); [ -n "$t" ] || { echo "Dùng: xuong them-ma ten-khach"; exit 1; }
    c=$(grep -E '^PRO_CODES=' "$DIR/ma-moi.txt" | cut -d= -f2-); m=$(openssl rand -hex 4)
    sed -i "s|^PRO_CODES=.*|PRO_CODES=${c:+$c,}$t:$m|" "$DIR/ma-moi.txt"
    echo "Mã mới cho $t: $m   · link: $APP/pro?c=$m"
    echo "Dán dòng này vào Cloudflare (sửa biến PRO_CODES → Deploy):"; grep -E '^PRO_CODES=' "$DIR/ma-moi.txt" | cut -d= -f2-; exit 0 ;;
  ""|trang-thai|dia-chi) ;;
  *) sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
esac

echo "Máy dựng Dựng Video AI — $(date '+%H:%M %d/%m')"
systemctl is-active --quiet xuong && ok "Máy dựng đang chạy" || no "Máy dựng KHÔNG chạy → xuong nhat-ky"
systemctl is-active --quiet xuong-tunnel && ok "Đường hầm đang chạy" || no "Đường hầm KHÔNG chạy → xuong khoi-dong-lai"
h=$(curl -s --max-time 3 http://127.0.0.1:8790/api/health); [ -n "$h" ] && ok "Trả lời: $h" || no "Máy dựng không trả lời ở cổng 8790"
u=$(curl -s --max-time 3 http://127.0.0.1:20241/quicktunnel | sed -n 's/.*"hostname":"\([^"]*\)".*/\1/p')
[ -n "$u" ] && ok "Địa chỉ đường hầm: https://$u" || no "Đường hầm chưa có địa chỉ"
i=$(curl -s --max-time 8 "$APP/api/pro/info")
case "$i" in
  *'"on":true'*) case "$i" in *"$u"*) ok "App chính đã thấy máy dựng → khách vào: $APP/pro" ;; *) no "App đang giữ địa chỉ CŨ — đợi 30 giây rồi chạy lại: xuong" ;; esac ;;
  *'chưa bật'*|*'chua bat'*) no "App chính chưa bật dựng chuyên nghiệp → dán PRO_SECRET / PRO_ADMIN / PRO_CODES vào Cloudflare (xuong ma-moi)" ;;
  *) no "App chưa thấy máy dựng ($i)"; journalctl -u xuong -n 200 --no-pager 2>/dev/null | grep -E 'báo (được )?địa chỉ' | tail -n 2 | sed 's/^/    /' ;;
esac
df -h / | awk 'NR==2{print "  · Ổ đĩa: còn " $4 " / " $2}'
free -h | awk '/Mem/{print "  · RAM: dùng " $3 " / " $2}'
