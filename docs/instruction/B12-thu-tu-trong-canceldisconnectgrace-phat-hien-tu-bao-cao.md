# B12. Thứ tự trong `cancelDisconnectGrace` (phát hiện từ báo cáo kiểm chứng)

### B12. Thứ tự trong `cancelDisconnectGrace` (phát hiện từ báo cáo kiểm chứng)

- Sửa: dời `disconnectTimers.delete()` xuống **sau** khi kiểm tra membership
  (dòng 181), không phải xoá logic delete — chỉ đổi thứ tự 2 khối code đã có
  sẵn.
- Reviewer ghi rõ đây là **latent bug, chưa khai thác được** (kick đã bị chặn
  khi `interrupted` bởi fix #6) — không cần coi là khẩn cấp, nhưng nên sửa dứt
  điểm vì rẻ.
