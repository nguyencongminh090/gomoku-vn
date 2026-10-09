# Phần A #8. Chưa có cách quan sát heap/GC của server đang chạy

**Status:** ✅ CLOSED 2026-10-09 — the concrete question (GC vs p95/p99 tail) was answered in #20 via --trace-gc. Reopen from #174 profiling if deeper heap observation is needed.

**Nguồn:** stress test khả năng chịu tải (2026-08-02, xem `docs/stress-test-report.md`)


#### 8. Chưa có cách quan sát heap/GC của server đang chạy

- Đợt đo chỉ lấy được RSS qua `ps` từ ngoài. Không thấy heap used/limit, không
  thấy GC pause — mà đúng lúc p95/p99 vọt lên (94–143ms ở 2000 người) thì GC là
  một nghi phạm hợp lý không kiểm chứng được bằng RSS.
- Cần quyết định cách lấy: chạy server với `--inspect` rồi lấy profile, hoặc thêm
  endpoint debug **chỉ bật ngoài production** trả `process.memoryUsage()`, hoặc
  gắn APM. Là quyết định vận hành nên xếp Phần A; phần code của nó (nếu chọn
  hướng endpoint) thì nhỏ.
