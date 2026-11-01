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
- Chủ phòng chọn 3–8 lượt cho mỗi câu chuyện trong phòng chờ (mặc định 3). Với N người và T lượt, có N câu chuyện, mỗi câu chuyện có T bước. Nếu T > N, câu chuyện tiếp tục quay vòng.
- Chuyển vòng khi mọi người nộp hoặc hết giờ. Bài bỏ lỡ được đánh dấu, người tiếp theo có thể tự nghĩ câu/hình mới.
- Câu/hình đã nộp được giữ kín. Kết nối lại vẫn giữ bài đã nộp, chuỗi được giao và hạn giờ.
- Kết thúc: chủ phòng mở từng bước (câu hoặc hình cùng tác giả), đồng bộ cho cả phòng. Bước chưa công bố không được gửi tới client.
- Chủ phòng có thể đuổi người khác (cả online và offline) trong phòng chờ. Phiên của người bị đuổi bị thu hồi; họ cần vào lại bằng tên/mã phòng. Đây là đuổi khỏi phiên, không phải cấm vĩnh viễn.
- Sau khi công bố đủ kết quả, chủ phòng có thể về phòng chờ để đổi số lượt hoặc loại người đã mất kết nối, hoặc chơi lại với cài đặt hiện tại.
- Chỉ mở ván mới sau khi công bố đủ các chuỗi. Nếu chủ phòng mất kết nối, quyền được chuyển cho người đang trực tuyến.

Đặc tả nền tảng cũ trong `docs/superpowers/specs/2026-11-01-game-foundation-design.md` mô tả luật vẽ tiếp sức trước đây; luật ở trên thay thế phần đó.

Trạng thái phòng chỉ lưu trong bộ nhớ server, khởi động lại sẽ mất phòng.


## Triển khai Render

Repo có `render.yaml` ở gốc: Node.js 22, gói Free, Singapore, thư mục `game`, kiểm tra `/api/health`.
Build chạy `npm install --omit=dev && npm test`; start chạy `npm start`. Server đọc cổng từ `PORT` do Render cấp và lắng nghe `0.0.0.0`.

Nếu tạo Web Service bằng công cụ/API không có trường Root Directory, dùng build `npm --prefix game install --omit=dev && npm --prefix game test` và start `npm --prefix game start`.
Triển khai từ nhánh `main`; cập nhật nhánh sẽ tự triển khai lại. Client tự dùng `wss://` khi trang được mở bằng HTTPS.

Chạy một instance vì phòng đang lưu trong bộ nhớ. Server ngủ/khởi động lại/triển khai mới sẽ làm mất các phòng. Gói Free có cold start sau thời gian không dùng. Không mở rộng nhiều instance trước khi bổ sung kho trạng thái dùng chung.


## GitHub Pages

Trang gốc `index.html` là giao diện game được tạo từ `game/public/index.html` bằng `node game/scripts/build-pages.mjs`. CSS và JS dùng đường dẫn tương đối, chạy được dưới đường dẫn repo `/L-p-tr-nh-m-ng/`. Khi sửa HTML giao diện, chạy lại script trước khi commit.

GitHub Pages đọc nhánh `main`, thư mục gốc. Trang này kết nối HTTP/WSS tới `https://truyen-net.onrender.com` qua meta `game-api-origin`. Link mời vẫn trỏ về trang GitHub Pages đang mở. Server chỉ cho phép thêm origin chính xác `https://phamdangkhiem4994-lang.github.io` qua biến `ALLOWED_ORIGINS` (phân cách bằng dấu phẩy nếu cần nhiều origin).

Trang whiteboard trước đây được giữ tại `whiteboard_lab.html`.
