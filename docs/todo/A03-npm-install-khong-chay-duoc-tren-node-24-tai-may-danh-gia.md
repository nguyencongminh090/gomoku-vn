# Phần A #3. `npm install` không chạy được trên Node 24 tại máy đánh giá

**Nguồn:** `gomoku-vn-review(1).md` (2026-08-01, commit `87006c5`)


#### 3. `npm install` không chạy được trên Node 24 tại máy đánh giá

- Lỗi: `better-sqlite3`/`bcrypt` không có prebuilt binary cho Node v24.18.0 và
  máy thiếu Python/MSVC toolchain để build native module.
- Không phải lỗi của repo (`package.json` khai `node >=18` hợp lệ), nhưng nên
  quyết định: pin Node version trong CI (`.nvmrc`/`engines`), hoặc cài
  Python/build-essential trên máy dev/CI mới, hoặc cân nhắc thay
  `better-sqlite3`/`bcrypt` bằng bản pure-JS/WASM nếu muốn tránh vấn đề build
  vĩnh viễn.
