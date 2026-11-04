# CAI DAT XUONG DUNG (chay 1 lan) - Dung Video AI
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Set-Location $PSScriptRoot
function Co($c) { return [bool](Get-Command $c -ErrorAction SilentlyContinue) }
function NapLaiPath { $env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User") }
if (-not (Co "ffmpeg") -or -not (Co "ffprobe")) {
  Write-Host "== Cài ffmpeg (winget, khoảng 1-2 phút) ==" -ForegroundColor Cyan
  winget install --id Gyan.FFmpeg -e --accept-source-agreements --accept-package-agreements
  NapLaiPath
  if (-not (Co "ffmpeg")) {
    $f = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter ffmpeg.exe -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($f) { $env:Path += ";" + $f.DirectoryName; [Environment]::SetEnvironmentVariable("Path", [Environment]::GetEnvironmentVariable("Path","User") + ";" + $f.DirectoryName, "User") }
  }
}
Write-Host "== Kiểm tra chương trình cần có ==" -ForegroundColor Cyan
foreach ($c in @("node","npm","ffmpeg","ffprobe","claude")) {
  if (Co $c) { Write-Host "  OK  $c" -ForegroundColor Green } else { Write-Host "  THIẾU  $c" -ForegroundColor Red; $thieu = $true }
}
if ($thieu) { Write-Host "Cài phần còn thiếu rồi chạy lại file này. (Node 22: nodejs.org · ffmpeg: winget install Gyan.FFmpeg · Claude Code: npm i -g @anthropic-ai/claude-code)" -ForegroundColor Yellow; Read-Host "Enter để đóng"; exit 1 }
if (-not (Co "cloudflared")) {
  Write-Host "== Cài cloudflared (đường hầm Cloudflare) ==" -ForegroundColor Cyan
  winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements
  NapLaiPath
  if (-not (Co "cloudflared")) { Write-Host "Đã cài cloudflared nhưng cửa sổ này chưa nhận — chạy xong thì đóng và mở lại CHAY-XUONG.cmd." -ForegroundColor Yellow }
}
Write-Host "== Cài HyperFrames 0.9.10 ==" -ForegroundColor Cyan
npm install --no-audit --no-fund
npx hyperframes telemetry disable
npx hyperframes browser ensure
npx hyperframes doctor
Write-Host ""
Write-Host "Lưu ý: Claude Code phải đăng nhập 1 lần: mở cửa sổ mới gõ  claude  rồi làm theo hướng dẫn." -ForegroundColor Yellow
Write-Host "XONG. Từ giờ chỉ cần bấm đúp CHAY-XUONG.cmd" -ForegroundColor Green
Read-Host "Enter để đóng"
