@echo off
chcp 65001 >nul
title NEBS 模拟考试平台

echo.
echo ========================================
echo   NEBS 模拟考试平台 启动中...
echo ========================================
echo.

:: 检查 Node.js 是否安装
node -v >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 Node.js！
    echo 请先去 https://nodejs.org 下载安装 Node.js LTS 版本
    echo.
    pause
    exit /b 1
)

:: 检查依赖是否安装
if not exist "node_modules" (
    echo 首次运行，正在安装依赖（需要联网，约1分钟）...
    npm install
    if errorlevel 1 (
        echo [错误] 依赖安装失败，请检查网络连接
        pause
        exit /b 1
    )
)

echo 正在启动服务器...
echo.
node server.js

pause
