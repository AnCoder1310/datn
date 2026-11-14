#!/bin/bash
# Script khởi chạy toàn bộ hệ thống VinFast AI Sales Enablement (Backend + Frontend)

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "=========================================================="
echo "  VINFAST AI SALES ENABLEMENT — SYSTEM STARTUP"
echo "=========================================================="

PYTHON_BIN="python3"
if [ -x "/opt/homebrew/bin/python3.11" ]; then
    PYTHON_BIN="/opt/homebrew/bin/python3.11"
elif [ -x "$DIR/.venv/bin/python" ]; then
    PYTHON_BIN="$DIR/.venv/bin/python"
elif [ -x "/Users/truongan/P-043-deployment/.venv/bin/python" ]; then
    PYTHON_BIN="/Users/truongan/P-043-deployment/.venv/bin/python"
fi

if [ -f "$DIR/.venv/bin/activate" ]; then
    source "$DIR/.venv/bin/activate"
elif [ -f "/Users/truongan/P-043-deployment/.venv/bin/activate" ]; then
    source "/Users/truongan/P-043-deployment/.venv/bin/activate"
fi

echo "[i] Sử dụng Python: $($PYTHON_BIN --version 2>&1)"

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

echo "=========================================================="
echo "  HỆ THỐNG ĐÃ SẴN SÀNG!"
echo "  🌐 Ứng dụng:  http://localhost:3000"
echo "  ⚙️  Backend:   http://127.0.0.1:8000"
echo "  Tài khoản demo:"
echo "    - Tư vấn viên: advisor.demo / DemoAdvisor123!"
echo "    - Quản lý:     manager.demo / DemoManager123!"
echo "=========================================================="

(sleep 2 && which open >/dev/null && open http://localhost:3000 2>/dev/null) &

npm run dev
