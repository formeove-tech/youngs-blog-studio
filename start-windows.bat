@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 24 LTS를 먼저 설치해주세요: https://nodejs.org
  pause
  exit /b 1
)
echo 브라우저에서 http://127.0.0.1:3030 을 열어주세요.
call npm start
pause
