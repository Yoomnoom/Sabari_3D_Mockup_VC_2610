@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"
echo ============================================
echo   사바리 목업 스튜디오 - 설치
echo ============================================
echo.

set "PYCMD="
py -3 -c "import sys;sys.exit(0 if sys.version_info>=(3,10) else 1)" >nul 2>nul && set "PYCMD=py -3"
if not defined PYCMD python -c "import sys;sys.exit(0 if sys.version_info>=(3,10) else 1)" >nul 2>nul && set "PYCMD=python"
if not defined PYCMD goto nopython

if not exist "frontend\dist\index.html" goto nodist

if exist ".venv\Scripts\python.exe" goto havevenv
echo [1/2] 가상환경을 만드는 중입니다...
%PYCMD% -m venv .venv
if errorlevel 1 goto fail
:havevenv

echo [2/2] 필요한 패키지를 설치하는 중입니다. (처음 한 번만 인터넷이 필요합니다)
".venv\Scripts\python.exe" -m pip install --disable-pip-version-check -r backend\requirements.txt
if errorlevel 1 goto pipfail

echo.
echo 설치가 끝났습니다. 이제 start.bat 을 실행하세요.
goto done

:nopython
echo [오류] Python 3.10 이상을 찾지 못했습니다.
echo.
echo  1) 브라우저에서 https://www.python.org/downloads/ 를 열어 Python 3.12 이상을 설치하세요.
echo     (설치 첫 화면에서 "Add python.exe to PATH" 를 꼭 체크하세요.)
echo  2) 또는 명령 프롬프트에서:  winget install Python.Python.3.12
echo  3) 설치 후 install.bat 을 다시 실행하세요.
if /i not "%~1"=="nopause" start "" "https://www.python.org/downloads/"
goto fail

:nodist
echo [오류] frontend\dist 폴더가 없습니다. 배포 ZIP이 온전한지 확인해 주세요.
goto fail

:pipfail
echo.
echo [오류] 패키지 설치에 실패했습니다. 인터넷 연결을 확인한 뒤 install.bat 을 다시 실행하세요.
goto fail

:fail
echo.
if /i not "%~1"=="nopause" pause
exit /b 1

:done
if /i not "%~1"=="nopause" pause
exit /b 0
