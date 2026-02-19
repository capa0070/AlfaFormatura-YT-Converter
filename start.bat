@echo off

echo === Installing Python Dependencies... ===
pip install -r requirements.txt

echo.
echo === Starting Python Backend (Port 5000)... ===
start /B python api/index.py

echo.
echo === Starting Vite Frontend (Port 5173)... ===
echo Access: http://localhost:5173
npm run dev
