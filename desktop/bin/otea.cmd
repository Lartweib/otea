@echo off
rem The otea command of the Otea desktop app on Windows: runs the CLI the app carries on the
rem app own Electron, as Node, so the machine needs no Node. The installer puts this folder on PATH.
setlocal
set ELECTRON_RUN_AS_NODE=1
"%~dp0..\..\Otea.exe" "%~dp0..\otea\src\cli\main.ts" %*
if %ERRORLEVEL% neq 0 exit /b %ERRORLEVEL%
endlocal
