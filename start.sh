#!/bin/bash

# start.sh - Script khởi động nhanh server Gomoku-VN (Play3CR)
# Chạy lệnh này bằng: bash start.sh (hoặc ./start.sh)

set -e

cd "$(dirname "$0")"

ENV_FILE=".env"

# JWT_SECRET là bắt buộc: server từ chối khởi động nếu thiếu (xem
# server/config.js — chặn hẳn secret mặc định cũ, vì ai đọc repo cũng có thể
# tự ký token giả). Lần chạy đầu tiên sẽ tự sinh một secret ngẫu nhiên và lưu
# vào .env (.env đã nằm trong .gitignore, không bao giờ được commit).
if ! grep -qs '^JWT_SECRET=' "$ENV_FILE"; then
  echo "🔑 Chưa có JWT_SECRET — đang tạo mới cho môi trường dev..."
  SECRET="$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")"
  printf 'JWT_SECRET=%s\n' "$SECRET" >> "$ENV_FILE"
  echo "   Đã lưu vào $ENV_FILE (file này không được commit)."
fi

echo "🔄 Đang dọn dẹp port 3000..."
# Tìm và tắt tiến trình đang chiếm port 3000 để tránh lỗi "Address already in use"
fuser -k 3000/tcp 2>/dev/null || true

echo "🚀 Bắt đầu khởi động Node.js Server..."
# Chạy server ở chế độ ổn định (không tự khởi động lại khi có thay đổi file).
# server/config.js tự đọc .env nên không cần export gì ở đây.
npm run dev:stable
