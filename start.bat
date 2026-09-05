@echo off
setlocal
title MOP Platform - Launcher

REM Navigate to repository root directory
cd /d "%~dp0"

REM Check if Node is available; if not, check standard Windows install path
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    if exist "C:\Program Files\nodejs\node.exe" (
        set "PATH=C:\Program Files\nodejs;%PATH%"
    ) else (
        echo.
        echo ===============================================================================
        echo [ERROR] Node.js was not found in PATH or at "C:\Program Files\nodejs".
        echo Please install Node.js version 24 to run MOP Platform.
        echo ===============================================================================
        echo.
        pause
        exit /b 1
    )
)

REM Run the unified start orchestrator
node tools\start.mjs %*
set "EXIT_CODE=%ERRORLEVEL%"

if %EXIT_CODE% neq 0 (
    echo.
    echo ===============================================================================
    echo [NOTICE] Launcher stopped or exited with code %EXIT_CODE%.
    echo ===============================================================================
    echo.
    pause
    exit /b %EXIT_CODE%
)
