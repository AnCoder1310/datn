#!/bin/bash
# ==============================================================================
# Script khởi chạy toàn bộ hệ thống VinFast AI Sales Enablement (Backend + Frontend)
# ==============================================================================

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "=========================================================="
echo "  🚗 VINFAST AI SALES ENABLEMENT — SYSTEM STARTUP"
echo "=========================================================="

# 1. Tìm Python Virtual Environment chuẩn
PYTHON_BIN=""
if [ -x "$DIR/.venv/bin/python" ]; then
    PYTHON_BIN="$DIR/.venv/bin/python"
elif [ -x "/Users/truongan/P-043-deployment/.venv/bin/python" ]; then
    PYTHON_BIN="/Users/truongan/P-043-deployment/.venv/bin/python"
elif [ -x "/opt/homebrew/bin/python3.11" ]; then
    PYTHON_BIN="/opt/homebrew/bin/python3.11"
else
    PYTHON_BIN="python3"
fi

if [ -f "$DIR/.venv/bin/activate" ]; then
    source "$DIR/.venv/bin/activate"
elif [ -f "/Users/truongan/P-043-deployment/.venv/bin/activate" ]; then
    source "/Users/truongan/P-043-deployment/.venv/bin/activate"
fi

echo "[✓] Sử dụng Python: $($PYTHON_BIN --version 2>&1) tại $PYTHON_BIN"

# 2. Dọn dẹp tiến trình cũ trên cổng 8000 và 3000 nếu có để tránh xung đột cổng
echo "[i] Kiểm tra và giải phóng cổng 8000 & 3000..."
OLD_8000=$(lsof -ti :8000 2>/dev/null || true)
if [ -n "$OLD_8000" ]; then
    echo "[i] Dọn tiến trình cũ cổng 8000 (PID: $OLD_8000)..."
    kill -9 $OLD_8000 2>/dev/null || true
    sleep 1
fi

OLD_3000=$(lsof -ti :3000 2>/dev/null || true)
if [ -n "$OLD_3000" ]; then
    echo "[i] Dọn tiến trình cũ cổng 3000 (PID: $OLD_3000)..."
    kill -9 $OLD_3000 2>/dev/null || true
    sleep 1
fi

# 3. Đồng bộ & Nạp sẵn dữ liệu demo (Users, Practice, Dashboard)
echo "[i] Nạp sẵn dữ liệu hệ thống (Users, Khách hàng, Công việc, Kịch bản)..."
$PYTHON_BIN scripts/seed_demo_users.py
$PYTHON_BIN scripts/seed_practice_showcase.py --apply
$PYTHON_BIN scripts/seed_dashboard_demo.py --owner advisor-demo --apply

# 4. Khởi chạy Backend FastAPI trên port 8000
echo "[i] Đang khởi chạy Backend FastAPI trên http://127.0.0.1:8000..."
$PYTHON_BIN -m uvicorn src.main:app --reload --host 127.0.0.1 --port 8000 &
BACKEND_PID=$!
echo "[✓] Backend PID: $BACKEND_PID"

cleanup() {
    echo ""
    echo "[i] Đang dừng hệ thống..."
    kill -9 $BACKEND_PID 2>/dev/null || true
    exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# Đợi Backend sẵn sàng
sleep 2

# 5. Khởi chạy Frontend Vite trên port 3000
echo "[i] Đang khởi chạy Frontend Vite..."
cd frontend
if [ ! -d "node_modules" ]; then
    echo "[i] Cài đặt dependencies frontend..."
    npm install
fi

echo "=========================================================="
echo "  ✅ HỆ THỐNG ĐÃ SẴN SÀNG!"
echo "  🌐 Ứng dụng:  http://localhost:3000"
echo "  ⚙️  Backend:   http://127.0.0.1:8000"
echo "  Tài khoản đăng nhập tự động:"
echo "    - Tư vấn viên: advisor.demo / DemoAdvisor123!"
echo "    - Quản lý:     manager.demo / DemoManager123!"
echo "=========================================================="

(sleep 2 && which open >/dev/null && open http://localhost:3000 2>/dev/null) &

npm run dev -- --port 3000
