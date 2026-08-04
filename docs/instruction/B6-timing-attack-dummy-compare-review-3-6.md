# B6. Timing attack — dummy compare (review 3.6)

### B6. Timing attack — dummy compare (review 3.6)

- Sửa: "luôn `compare` với một hash dummy **cố định**" — chú ý chữ "cố định":
  không tính dummy hash động (vd. hash rỗng runtime), phải là 1 hằng số
  hardcode, nếu không phép so sánh dummy có thể có timing khác biệt tuỳ theo
  cách sinh ra.
- Xem A4 — phải đo lại sau khi sửa.
