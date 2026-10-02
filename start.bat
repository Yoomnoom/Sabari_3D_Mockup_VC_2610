@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"

if exist ".venv\Scripts\python.exe" goto run
echo 처음 실행이라 설치를 먼저 진행합니다...
call "%~dp0install.bat" nopause
if not exist ".venv\Scripts\python.exe" goto fail

:run
if not exist "frontend\dist\index.html" goto nodist
echo 사바리 목업 스튜디오를 시작합니다. 브라우저가 자동으로 열립니다.
echo (주소: http://127.0.0.1:8765  /  종료하려면 이 창을 닫으세요)
cd backend
"..\.venv\Scripts\python.exe" -m app.main
if errorlevel 1 goto fail
exit /b 0

:nodist
echo [오류] frontend\dist 폴더가 없습니다. 배포 ZIP이 온전한지 확인해 주세요.

:fail
echo.
echo [오류] 실행하지 못했습니다. 위 메시지를 확인해 주세요.
pause
exit /b 1
