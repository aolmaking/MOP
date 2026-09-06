@echo off
setlocal
title MOP Platform - Stopping Services

cd /d "%~dp0"

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    if exist "C:\Program Files\nodejs\node.exe" (
        set "PATH=C:\Program Files\nodejs;%PATH%"
    )
)

node tools\stop.mjs %*
