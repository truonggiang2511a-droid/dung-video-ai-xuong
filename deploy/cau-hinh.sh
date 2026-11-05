#!/usr/bin/env bash
# CẤU HÌNH MÁY DỰNG TRÊN VPS — hỏi từng câu, tự sinh chuỗi bí mật + mã mời, ghi /opt/xuong/cau-hinh.txt rồi mở lại máy dựng.
# Chạy lại lúc nào cũng được:  xuong cau-hinh   (Enter = giữ giá trị cũ). KHÔNG dán khoá / chuỗi bí mật vào chat.
set -euo pipefail
DIR=${XUONG_DIR:-/opt/xuong}
CFG="$DIR/cau-hinh.txt"
MA="$DIR/ma-moi.txt"
APP=${APP_URL:-https://dung-video-ai.truonggiang2511a.workers.dev}
NOSYS=${NOSYS:-}   # (kiểm thử trong máy ảo không có systemd)
g() { printf '\033[1;32m%s\033[0m\n' "$*"; }
y() { printf '\033[1;33m%s\033[0m\n' "$*"; }

[ -f "$CFG" ] || cp "$DIR/deploy/cau-hinh-mau.txt" "$CFG"
getv() { grep -E "^$1=" "$CFG" 2>/dev/null | tail -n 1 | cut -d= -f2- || true; }
setv() { K="$1" V="$2" awk 'BEGIN{k=ENVIRON["K"]; v=ENVIRON["V"]; d=0} index($0, k"=")==1 {if(!d) print k"="v; d=1; next} {print} END{if(!d) print k"="v}' "$CFG" > "$CFG.tmp" && cat "$CFG.tmp" > "$CFG" && rm -f "$CFG.tmp"; }
mask() { local s="$1"; [ ${#s} -gt 16 ] && printf '%s…%s (%s ký tự)' "${s:0:12}" "${s: -4}" "${#s}" || printf '(%s ký tự)' "${#s}"; }

echo
g "── 1. Khoá Claude (console.anthropic.com → API Keys) ──"
old=$(getv ANTHROPIC_API_KEY)
[ -n "$old" ] && echo "Đang có khoá: $(mask "$old") — bấm Enter để giữ."
for i in 1 2 3; do
  printf 'Dán khoá (bắt đầu sk-ant-, dán xong chữ KHÔNG hiện là bình thường) rồi Enter: '
  read -rs k || k=''; echo
  k=$(printf '%s' "$k" | tr -d '[:space:]')
  [ -z "$k" ] && k="$old"
  if [ -z "$k" ]; then y "Chưa có khoá — máy dựng cần khoá Claude để lập kế hoạch dựng."; continue; fi
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 https://api.anthropic.com/v1/models -H "x-api-key: $k" -H 'anthropic-version: 2023-06-01' || echo 000)
  if [ "$code" = 200 ]; then echo "Khoá dùng được ✓ $(mask "$k")"; break; fi
  if [ "$code" = 401 ] || [ "$code" = 403 ]; then y "Anthropic báo khoá SAI hoặc đã thu hồi (mã $code) — dán lại."; k=''; continue; fi
  y "Chưa kiểm được khoá (mạng trả $code) — vẫn lưu, xem lại sau bằng: xuong dia-chi"; break
done
[ -n "${k:-}" ] || { y "Dừng: chưa có khoá Claude. Chạy lại: xuong cau-hinh"; exit 1; }
setv ANTHROPIC_API_KEY "$k"
setv XUONG_AI api

g "── 2. Chuỗi bí mật nối app + mã mời (tự sinh, giữ nguyên nếu đã có) ──"
sec=$(getv XUONG_SECRET); [ -n "$sec" ] || sec=$(openssl rand -hex 32)
setv XUONG_SECRET "$sec"
adm=''; codes=''
if [ -f "$MA" ]; then adm=$(grep -E '^PRO_ADMIN=' "$MA" | cut -d= -f2- || true); codes=$(grep -E '^PRO_CODES=' "$MA" | cut -d= -f2- || true); fi
[ -n "$adm" ] || adm=$(openssl rand -hex 6)
[ -n "$codes" ] || codes="khach1:$(openssl rand -hex 4),khach2:$(openssl rand -hex 4),khach3:$(openssl rand -hex 4)"
umask 077
printf 'PRO_SECRET=%s\nPRO_ADMIN=%s\nPRO_CODES=%s\n' "$sec" "$adm" "$codes" > "$MA"
key=$(getv XUONG_KEY); [ -n "$key" ] || key=$(openssl rand -hex 6)
setv XUONG_KEY "$key"

# VPS: chỉ nghe trong máy (đường hầm vào được), địa chỉ công khai lấy từ đường hầm nhanh
setv XUONG_HOST 127.0.0.1
setv XUONG_PUBLIC_URL ''
setv APP_URL "$APP"
n=$(nproc 2>/dev/null || echo 4)
if [ "$n" -ge 8 ]; then cpu=3; ren=2; elif [ "$n" -ge 6 ]; then cpu=2; ren=2; else cpu=1; ren=1; fi
[ -f "$DIR/.dung-chung" ] && { cpu=1; ren=1; }   # VPS dùng chung với MT5: 1 việc mỗi loại
setv XUONG_CPU "$cpu"; setv XUONG_RENDER "$ren"
[ -n "$(getv XUONG_KEEP_DAYS)" ] || setv XUONG_KEEP_DAYS 7
[ -n "$(getv XUONG_CRF)" ] || setv XUONG_CRF 20
[ -n "$(getv XUONG_MAXRATE)" ] || setv XUONG_MAXRATE 10M
chmod 600 "$CFG" "$MA"
id xuong >/dev/null 2>&1 && chown xuong:xuong "$CFG" "$MA" || true
echo "Đã ghi $CFG ✓ ($n nhân: đổi file $cpu, xuất $ren video cùng lúc)"

g "── 3. Mở lại máy dựng + đường hầm ──"
url=''
if [ -z "$NOSYS" ]; then
  systemctl restart xuong xuong-tunnel
  for i in $(seq 1 40); do
    url=$(curl -s --max-time 2 http://127.0.0.1:20241/quicktunnel | sed -n 's/.*"hostname":"\([^"]*\)".*/\1/p' || true)
    h=$(curl -s --max-time 2 http://127.0.0.1:8790/api/health || true)
    [ -n "$url" ] && [ -n "$h" ] && break
    sleep 2
  done
  [ -n "$h" ] && echo "Máy dựng chạy ✓" || y "Máy dựng chưa lên — xem lỗi: xuong nhat-ky"
  [ -n "$url" ] && echo "Đường hầm ✓ https://$url" || y "Đường hầm chưa có địa chỉ — thử: xuong khoi-dong-lai"
fi

c1=${codes#*:}; c1=${c1%%,*}
cat <<EOF

$(g '════════ VIỆC CÒN LẠI: DÁN 3 DÒNG NÀY VÀO CLOUDFLARE ════════')
Cloudflare → Workers & Pages → dung-video-ai → Settings → Variables and Secrets → + Add

  Tên (Variable name)   Loại (Type)   Giá trị (Value)
  PRO_SECRET            Secret        $sec
  PRO_ADMIN             Secret        $adm
  PRO_CODES             Text          $codes

Bấm Deploy. Khoảng 30 giây sau máy dựng tự báo địa chỉ cho app.
Kiểm:  xuong dia-chi        (xem lại 3 dòng trên:  xuong ma-moi)

Mã của Giang (vào trang Dựng chuyên nghiệp, thấy mọi video):  $adm
Trang cho khách:  $APP/pro
Link mời khách 1:  $APP/pro?c=$c1
(mỗi mã mời là 1 người: chỉ thấy video của mã đó — thêm mã: xuong them-ma <tên>)
EOF
