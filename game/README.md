# Truyền Nét

Game nhiều người chơi qua HTTP + WebSocket, 3–8 người mỗi phòng.

## Chạy

Cần Node.js 22 trở lên. Trong thư mục `game`:

```sh
npm install
npm start
npm test
```

Mở http://localhost:3000. Server dùng `PORT` (mặc định 3000) và `HOST` (mặc định 0.0.0.0).
Link mời/QR dùng địa chỉ đang mở; để chơi từ điện thoại, mở server bằng địa chỉ LAN hoặc triển khai website có WebSocket.

## Luật hiện tại

- Mỗi người nhập một câu mở đầu, tạo một chuỗi riêng. Thời gian nhập câu: 30 giây.
- Tất cả làm bài cùng lúc. Mỗi vòng, chuỗi chuyển sang người kế tiếp trong thứ tự phòng.
- Vòng lẻ sau câu mở đầu: chỉ thấy câu ngay trước và vẽ trong 60 giây.
- Vòng tiếp theo: chỉ thấy tranh ngay trước và viết câu đoán trong 30 giây. Cứ thế luân phiên.
- Với N người, có N vòng và N chuỗi, mỗi chuỗi có N bước; mỗi người ghé mỗi chuỗi đúng một lần.
- Chuyển vòng khi mọi người nộp hoặc hết giờ. Bài bỏ lỡ được đánh dấu, người tiếp theo có thể tự nghĩ câu/hình mới.
- Câu/hình đã nộp được giữ kín. Kết nối lại vẫn giữ bài đã nộp, chuỗi được giao và hạn giờ.
- Kết thúc: chủ phòng mở từng bước (câu hoặc hình cùng tác giả), đồng bộ cho cả phòng. Bước chưa công bố không được gửi tới client.
- Chỉ mở ván mới sau khi công bố đủ các chuỗi. Nếu chủ phòng mất kết nối, quyền được chuyển cho người đang trực tuyến.

Đặc tả nền tảng cũ trong `docs/superpowers/specs/2026-11-01-game-foundation-design.md` mô tả luật vẽ tiếp sức trước đây; luật ở trên thay thế phần đó.

Trạng thái phòng chỉ lưu trong bộ nhớ server, khởi động lại sẽ mất phòng.
