#!/bin/bash
# Script khởi chạy toàn bộ hệ thống VinFast AI Sales Enablement (Backend + Frontend)

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "=========================================================="
echo "  VINFAST AI SALES ENABLEMENT — SYSTEM STARTUP"
echo "=========================================================="

PYTHON_BIN="python3"
if [ -f ".venv/bin/python" ]; then
    PYTHON_BIN=".venv/bin/python"
    source .venv/bin/activate
fi

# 0. Đồng bộ & Nạp sẵn dữ liệu demo (Users, Practice, Dashboard)
echo "[i] Nạp dữ liệu mẫu (12 khách hàng, 29 công việc, kịch bản, lịch)..."
$PYTHON_BIN scripts/seed_demo_users.py
$PYTHON_BIN scripts/seed_practice_showcase.py --apply
$PYTHON_BIN scripts/seed_dashboard_demo.py --owner advisor-demo --apply

# 1. Kiểm tra & Khởi chạy Backend (Port 8000)
if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null ; then
    echo "[✓] Backend đang chạy tại http://127.0.0.1:8000"
else
    echo "[i] Đang khởi chạy Backend FastAPI trên port 8000..."
    $PYTHON_BIN -m uvicorn src.main:app --reload --host 127.0.0.1 --port 8000 &
    BACKEND_PID=$!
    echo "[✓] Backend PID: $BACKEND_PID"
    trap "kill $BACKEND_PID 2>/dev/null" EXIT
    sleep 2
fi

# 2. Khởi chạy Frontend Vite (Port 3000)
echo "[i] Đang khởi chạy Frontend Vite..."
cd frontend
if [ ! -d "node_modules" ]; then
    echo "[i] Cài đặt dependencies frontend..."
    npm install
fi

echo "[✓] Frontend sẵn sàng tại http://localhost:3000"
npm run dev
