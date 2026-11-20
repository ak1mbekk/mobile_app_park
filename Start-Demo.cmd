@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
set "DEMO_NODE=node"
where node >nul 2>nul
if errorlevel 1 set "DEMO_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
"%DEMO_NODE%" -e "process.exit(Number(process.versions.node.split('.')[0]) >= 24 ? 0 : 1)" >nul 2>nul
if errorlevel 1 (
  echo Для запуска установите Node.js 24 или новее.
  pause
  exit /b 1
)
set "DEMO_URL=http://127.0.0.1:8168/demo/index.html"
"%DEMO_NODE%" -e "fetch(process.env.DEMO_URL,{signal:AbortSignal.timeout(1500)}).then(r=>r.text()).then(t=>process.exit(t.includes('id=\"scene3d\"') ? 0 : 1)).catch(()=>process.exit(1))"
if not errorlevel 1 (
  start "" "%DEMO_URL%"
  exit /b 0
)
if not exist "node_modules\vite\bin\vite.js" (
  echo Для первой установки выполните npm ci в папке проекта, затем откройте этот файл снова.
  pause
  exit /b 1
)
echo Держите это окно открытым во время показа. Адрес %DEMO_URL%
"%DEMO_NODE%" node_modules\vite\bin\vite.js --host 127.0.0.1 --port 8168 --strictPort --open /demo/index.html
if errorlevel 1 pause
