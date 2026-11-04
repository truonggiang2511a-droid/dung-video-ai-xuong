# CHAY XUONG DUNG + DUONG HAM - Dung Video AI
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Set-Location $PSScriptRoot
# Bo nao AI + so viec chay cung luc: sua trong file cau-hinh.txt
Write-Host "Mở máy dựng (cửa sổ riêng, đừng tắt)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit","-Command","[Console]::OutputEncoding=[Text.Encoding]::UTF8; Set-Location '$PSScriptRoot'; node server.mjs"
Start-Sleep -Seconds 3
Write-Host ""
Write-Host "Mở đường hầm Cloudflare. Tìm dòng có  https://....trycloudflare.com  bên dưới," -ForegroundColor Cyan
Write-Host "mở link đó trên điện thoại / máy tính, nhập mã truy cập hiện ở cửa sổ máy dựng." -ForegroundColor Cyan
Write-Host "Link đổi mỗi lần chạy lại. Tắt cửa sổ này = tắt đường hầm." -ForegroundColor Yellow
Write-Host ""
cloudflared tunnel --no-autoupdate --url http://localhost:8790
