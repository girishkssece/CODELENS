@echo off
cd /d "%~dp0"

start "Flask" cmd /k "cd /d %~dp0server && python app.py"

timeout /t 3 /nobreak

start "React" cmd /k "cd /d %~dp0client && npm run dev"

timeout /t 5 /nobreak

start http://localhost:5173

pause