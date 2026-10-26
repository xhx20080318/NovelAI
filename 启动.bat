@echo off
chcp 65001 >nul
title 小说创作应用 - 本地服务器

echo ========================================
echo    小说创作应用 - 本地服务器启动工具
echo ========================================
echo.

:: 设置端口
set PORT=8080

:: 检查端口是否被占用
netstat -ano | findstr ":%PORT%" >nul
if %errorlevel% equ 0 (
    echo [警告] 端口 %PORT% 已被占用，尝试关闭占用进程...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT%"') do (
        taskkill /F /PID %%a >nul 2>&1
    )
    timeout /t 2 /nobreak >nul
)

:: 获取当前目录路径
set "CURRENT_DIR=%~dp0"
cd /d "%CURRENT_DIR%"

echo [1/4] 正在检查 Python 环境...

:: 尝试多种方式找到 Python
set "PYTHON_CMD="

python --version >nul 2>&1
if %errorlevel% equ 0 (
    set "PYTHON_CMD=python"
    echo        找到 Python: python
    goto python_found
)

py --version >nul 2>&1
if %errorlevel% equ 0 (
    set "PYTHON_CMD=py"
    echo        找到 Python: py
    goto python_found
)

python3 --version >nul 2>&1
if %errorlevel% equ 0 (
    set "PYTHON_CMD=python3"
    echo        找到 Python: python3
    goto python_found
)

if exist "C:\Python39\python.exe" (
    set "PYTHON_CMD=C:\Python39\python.exe"
    goto python_found
)
if exist "C:\Python310\python.exe" (
    set "PYTHON_CMD=C:\Python310\python.exe"
    goto python_found
)
if exist "C:\Python311\python.exe" (
    set "PYTHON_CMD=C:\Python311\python.exe"
    goto python_found
)
if exist "C:\Python312\python.exe" (
    set "PYTHON_CMD=C:\Python312\python.exe"
    goto python_found
)
if exist "C:\Python313\python.exe" (
    set "PYTHON_CMD=C:\Python313\python.exe"
    goto python_found
)
if exist "C:\Python314\python.exe" (
    set "PYTHON_CMD=C:\Python314\python.exe"
    goto python_found
)

if exist "%LOCALAPPDATA%\Microsoft\WindowsApps\python.exe" (
    set "PYTHON_CMD=%LOCALAPPDATA%\Microsoft\WindowsApps\python.exe"
    echo        找到 Python: Microsoft Store Python
    goto python_found
)

echo [错误] 未找到 Python，请确保 Python 已正确安装
pause
exit /b 1

:python_found
echo.
echo [2/4] 正在启动本地服务器...
echo        访问地址: http://localhost:%PORT%
echo.

:: 使用 /b 参数在当前窗口后台启动服务器
start /b "小说创作服务器" %PYTHON_CMD% -m http.server %PORT% >nul 2>&1

:: 等待服务器启动
echo [3/4] 等待服务器启动...
set /a attempts=0

:check_server
timeout /t 1 /nobreak >nul
set /a attempts+=1

curl -s -o nul -w "%%{http_code}" http://localhost:%PORT% >nul 2>&1
if %errorlevel% equ 0 (
    goto server_ready
)

powershell -Command "try { Invoke-WebRequest -Uri 'http://localhost:%PORT%' -TimeoutSec 2 -UseBasicParsing | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if %errorlevel% equ 0 (
    goto server_ready
)

if %attempts% lss 15 (
    echo        尝试 %attempts%/15...
    goto check_server
) else (
    echo [警告] 服务器可能已启动但检测失败，继续打开浏览器...
)

:server_ready
echo        服务器已就绪！
echo.

echo [4/4] 正在打开浏览器...
start http://localhost:%PORT%

echo.
echo ========================================
echo    服务器已启动，浏览器已打开
echo    按任意键关闭服务器并退出
echo ========================================
echo.

pause >nul

:: 关闭服务器
echo.
echo 正在关闭服务器...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT%"') do (
    taskkill /F /PID %%a >nul 2>&1
)
echo 服务器已关闭，再见！
timeout /t 1 /nobreak >nul