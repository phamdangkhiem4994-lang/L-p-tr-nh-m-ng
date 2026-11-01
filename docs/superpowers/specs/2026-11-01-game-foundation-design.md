# Khung game truyền tin bằng hình vẽ — nhóm 3 người

Trạng thái: thiết kế đã cập nhật theo yêu cầu truyền hình vẽ của Khiêm; chưa viết code game mới.
Tên làm việc: Game truyền tin. Tên sản phẩm chưa chốt; dùng biến cấu hình để đổi sau.

## Kết quả kiểm tra repo

- Nguồn: https://github.com/phamdangkhiem4994-lang/L-p-tr-nh-m-ng
- Commit lúc kiểm tra: `19d67f133147d4829aa4d440f9652686b8191619`.
- Bản clone: `E:\PPT\LapTrinhMang_Game`.
- Repo có `index.html`, `whiteboard_mqtt_enhanced.html`, README ngắn và ZIP.
- Bản cũ trong `index.html` có game ba pha viết → vẽ → đoán → công bố, chạy bằng MQTT over WebSocket qua HiveMQ công cộng. Đây là hiện trạng mã cũ, không phải luật cho game mới. Chưa có server game riêng hay cấu trúc module/test cho nhóm.
- Mọi máy nhận thông điệp `game_answer` và dữ liệu câu ban đầu được đưa vào các thông điệp pha: giao diện có thể giấu nhưng người chơi vẫn xem được qua DevTools. Mã sender/host do client tự khai nên không phải xác thực quyền.
- Chủ phòng điều khiển chuyển pha trong trình duyệt; đồng hồ và trạng thái cần chuyển sang server để thống nhất.
- Git credential manager có sẵn. `git push --dry-run ... HEAD:refs/heads/game-foundation` thành công; chưa đẩy commit và chưa tạo nhánh từ xa.

## Phạm vi khung đầu tiên

Làm một game độc lập trong `game/`, giữ nguyên các file lab cũ. Khung phải chạy được một ván hoàn chỉnh với ít nhất ba trình duyệt/người chơi; không chỉ là màn hình tĩnh.

1. Nhập biệt danh; tạo phòng hoặc vào bằng mã.
2. Sảnh hiển thị người chơi và chủ phòng. Hỗ trợ 3–8 người, chỉ chủ phòng được bắt đầu.
3. Mỗi ván chỉ có một chuỗi truyền hình vẽ cho cả phòng. Server chốt thứ tự người chơi và chọn một từ khóa từ bộ từ khóa phía server. Chỉ người đầu tiên nhận từ khóa đó để vẽ.
4. Người ở vị trí thứ hai chỉ nhận tranh người đầu tiên đã nộp và vẽ lại trên canvas trống. Người tiếp theo chỉ nhận tranh đã nộp của người ngay trước, rồi vẽ lại. Không có lượt viết mô tả hay đoán xen giữa chuỗi tranh.
5. Người cuối cùng chỉ nhận tranh của người ngay trước và nhập một đáp án đoán từ khóa, tối đa 160 ký tự. Người cuối không phải vẽ thêm.
6. Các lượt diễn ra tuần tự: chỉ một người được thao tác/nộp ở mỗi lượt, những người còn lại chờ và thấy trạng thái tiến độ. Người đang vẽ lại được xem tranh tham chiếu suốt lượt; bản đầu không áp dụng chế độ ghi nhớ rồi giấu tranh.
7. Sau khi người cuối nộp hoặc hết giờ đoán, công bố từ khóa gốc, toàn bộ tranh theo thứ tự kèm người vẽ và đáp án cuối. Chủ phòng có thể mở ván mới.

Với N người, một ván gồm N−1 lượt vẽ và đúng một lượt đoán ở cuối. Số thành viên nhóm phát triển là 3; số người chơi hỗ trợ vẫn là 3–8. Bản đầu không tạo nhiều chuỗi song song và không chấm điểm tự động.

## Thứ tự lượt và đổi vai

Server lưu thứ tự ghế theo lúc vào phòng. Trước khi bắt đầu, tất cả người trong danh sách chơi phải đang kết nối. Danh sách được cố định trong ván, không nhận người chơi mới giữa ván.

| Ván với ba người | Người đầu, thấy từ khóa | Người giữa, chỉ thấy tranh trước | Người cuối, chỉ thấy tranh trước |
|---|---|---|---|
| 1 | A vẽ | B vẽ lại tranh A | C đoán từ tranh B |
| 2 | B vẽ | C vẽ lại tranh B | A đoán từ tranh C |
| 3 | C vẽ | A vẽ lại tranh C | B đoán từ tranh A |

Mỗi ván mới xoay danh sách sang trái một ghế, kể cả sau ván bị gián đoạn. Với danh sách thành viên không đổi, sau N ván mỗi người trải qua mọi vị trí đúng một lần. Khi có người rời/vào giữa hai ván, danh sách mới giữ thứ tự ghế còn lại rồi thêm người mới ở cuối; xoay một vị trí trước ván kế tiếp. Vai trò chủ phòng độc lập với vị trí vẽ/đoán và không được tự xem từ khóa nếu không phải người đầu.

### Thời gian và lượt bị thiếu

- Mỗi lượt vẽ/vẽ lại có 60 giây, lượt đoán có 30 giây. Nộp hợp lệ sớm thì server chuyển ngay sang người kế tiếp; đồng hồ của lượt mới bắt đầu lúc server giao nhiệm vụ.
- Chỉ chuyển tiếp tranh đã được server nhận và chấp nhận. Không gửi bản nháp cho người kế tiếp, không dùng tranh của một người xa hơn để thay thế.
- Nếu hết giờ vẽ mà chưa có tranh hợp lệ, kết thúc ván với trạng thái gián đoạn, công bố từ khóa và chuỗi tranh đã nộp, ghi rõ vị trí thiếu tranh; đáp án cuối là chưa có. Không tiếp tục đoán từ tranh sai người tiền nhiệm.
- Nếu hết giờ đoán, kết thúc bình thường và ghi “Không kịp đoán”. Không tự sinh đáp án hay điền từ khóa vào bài người chơi.
- Mất kết nối không bỏ qua ghế giữa ván: người đó có thể quay lại trong thời gian còn lại. Hết deadline áp dụng quy tắc tương ứng ở trên, vì vậy phòng không chờ vô hạn.

Các mốc thời gian trên là mặc định thiết kế của khung đầu, có thể cấu hình phía server sau này.

## Kiến trúc và hai giao thức

Đề xuất: Node.js LTS + module JavaScript ESM + thư viện `ws`; frontend HTML/CSS/JavaScript module, không cần bước build.

- HTTP phục vụ giao diện và tài nguyên, tạo phòng (`POST /api/rooms`), vào phòng (`POST /api/rooms/:code/join`), kiểm tra server (`GET /api/health`).
- HTTP trả phiên người chơi bằng token ngẫu nhiên; mật mã này không xuất hiện trong danh sách thành viên hay log. Không yêu cầu tài khoản/email cho bản đầu.
- WebSocket kết nối cùng server để xác nhận phiên, gửi lệnh và nhận trạng thái riêng cho từng người.
- Server giữ từ khóa bí mật, thứ tự cố định trong ván, vị trí đang chơi, deadline và chuỗi bài đã nộp. Bộ từ khóa không nằm trong thư mục frontend được phục vụ công khai.
- Trước kết quả, nhiệm vụ riêng chỉ gửi cho người đang chơi: người đầu nhận từ khóa; người vẽ lại/người đoán nhận đúng tranh người ngay trước. Người chờ không nhận tranh/từ khóa của người khác. Người đã vẽ có thể giữ bản mình đã biết, nhưng không nhận tranh các lượt sau.
- Bài nộp của mỗi lượt là bất biến sau khi được chấp nhận. Server xây chuỗi theo thứ tự lượt, không dựa vào vị trí/nguồn tranh do client tự khai. Chỉ công bố toàn bộ ở kết quả, kể cả ván gián đoạn.
- Giao diện vẽ gửi dữ liệu nét chuẩn hóa khi nộp; không phát từng nét cho cả phòng vì người khác không được xem trước.
- Đồng hồ frontend tính từ deadline server gửi; quyền chuyển pha luôn ở server.
- Dữ liệu giữ RAM, tự hết hạn phòng không hoạt động. Khởi động lại server làm mất phòng; ghi rõ trong README.
- Không thêm đăng nhập, cơ sở dữ liệu, xếp hạng hay AI trong khung đầu.

Phương án khác: tiếp tục MQTT tĩnh ít setup nhưng khó giữ bí mật bài và kiểm soát quyền; React + backend phù hợp mở rộng lớn hơn nhưng thêm công cụ/build không cần thiết cho khung nhóm đầu. Đề xuất Node + JavaScript module để cả ba dễ tiếp nhận.

## Giao diện

Màu giấy sáng, chữ đậm, điểm nhấn tím, hình minh họa nét vẽ tự tạo bằng SVG/canvas. Màn hình vào phòng đơn giản; sảnh rõ tên/mã phòng. Người đầu thấy từ khóa và canvas; người vẽ lại thấy đúng tranh tham chiếu ngay trước và canvas trắng riêng; người cuối thấy tranh cuối cùng và ô đoán. Người chờ chỉ thấy ai đang chơi, số lượt và thời gian, không có phần xem trước bài người khác. Mọi trạng thái có chữ rõ: đang kết nối, đã nộp, chờ người khác, mất kết nối.

Canvas dùng pointer events cho chuột/cảm ứng, bút màu và tẩy; xóa và hoàn tác theo nét. Có xác nhận trước khi xóa bản vẽ. Chuyển pha ngắn, phản hồi nút nộp và xuất hiện kết quả; tôn trọng prefers-reduced-motion. Không cần ảnh tải ngoài hay CDN.

Màn kết quả hiển thị từ khóa gốc → tranh từng người theo thứ tự → đáp án người cuối. Nếu ván gián đoạn, đánh dấu lượt thiếu và lý do. Hiển thị thứ tự vai ở ván tiếp theo để nhóm hiểu quy tắc xoay vai.

## Ranh giới module / phân công

| Người | Phần phụ trách sau bàn giao | Tệp chính |
|---|---|---|
| Khiêm | Kết nối HTTP/WebSocket, sảnh phòng, trạng thái kết nối | `game/server/http.js`, `game/server/realtime.js`, `game/client/network.js` |
| Thành viên 2 | Giao diện và bảng vẽ, hỗ trợ điện thoại, undo/tẩy | `game/public/style.css`, `game/client/canvas.js`, `game/client/views.js` |
| Thành viên 3 | Luật truyền tranh tuần tự, chọn từ khóa, xoay vai, thời gian và kết quả | `game/server/game.js`, `game/server/words.js`, `game/client/results.js`, `game/test/` |

Chưa có tên hai bạn còn lại, nên ghi theo vai trò. Hợp đồng sự kiện và cấu trúc dữ liệu nằm trong `game/docs/PROTOCOL.md`; đổi hợp đồng cần thông báo hai thành viên còn lại.

Các module không tự truy cập biến toàn cục của nhau. Module luật không phụ thuộc WebSocket/DOM, nhận thời gian từ bên ngoài để test. Module canvas chỉ xuất/nhập nét, không tự gửi mạng.

## Sự kiện dự kiến

- Client: `session.attach`, `game.start`, `answer.submit`, `game.restart`.
- Server: `session.ready`, `room.snapshot`, `request.error`.
- Pha phòng: `lobby`, `drawing`, `guessing`, `reveal`. Trong `drawing` có N−1 lượt tuần tự, không có pha nhập từ khóa/mô tả. `reveal` kèm trạng thái ván `completed` hoặc `interrupted`.
- `answer.submit` luôn kèm gameId + turnId + kind (`drawing` hoặc `guess`) + nội dung. Server đối chiếu phiên, người đang chơi và loại bài; từ chối lượt cũ, nộp trễ, nộp trùng và lệnh ngoài quyền. Chuyển lượt tạo turnId mới, kể cả khi vẫn ở pha `drawing`.
- Snapshot chung có roomCode, players, hostId, phase, gameId, orderedPlayerIds, activePlayerId, turnIndex, totalTurns, deadline, completedTurnCount. Snapshot không có từ khóa, album tranh hay đáp án trước công bố.
- Trường `task` riêng chỉ có cho người đang chơi: `first_draw` kèm keyword; `redraw` kèm referenceDrawing của lượt trước; hoặc `final_guess` kèm referenceDrawing của lượt trước. Tranh tham chiếu là dữ liệu nét được server kiểm tra. Người chờ nhận task null.
- Trường `result` chỉ có ở `reveal`: keyword, danh sách tranh với turnIndex/playerId, finalGuess (hoặc null), người đoán cuối và lý do nếu hết giờ/gián đoạn. Khi bắt đầu ván mới không đưa result cũ vào nhiệm vụ mới.

## Xử lý lỗi tối thiểu

- Chặn mã phòng sai, phòng đầy, tên rỗng/quá dài và vào phòng khi đang chơi.
- Kiểm tra kiểu, kích thước và giới hạn số nét/tọa độ; giới hạn frame WebSocket và tốc độ lệnh.
- Render tên/câu bằng textContent, không chèn HTML người dùng.
- Mất kết nối hiện cảnh báo; kết nối lại cùng token khôi phục nhiệm vụ/bài đã nộp nếu phòng còn tồn tại.
- Giữ ghế người chơi mất kết nối trong ván, không đảo thứ tự hoặc chuyển tranh cho người khác. Deadline dẫn tới gián đoạn ván nếu thiếu tranh, hoặc kết quả không có đáp án nếu người cuối không kịp đoán. Chủ phòng rời sảnh được chuyển quyền cho người online kế tiếp.
- Khi triển khai thực tế dùng HTTPS/WSS cùng origin; không nhúng khóa/token bí mật vào repository.

## Kiểm chứng và bàn giao

1. Unit test ba người: A nhận từ khóa và vẽ; B chỉ nhận tranh A và vẽ lại; C chỉ nhận tranh B và đoán. Sau đó công bố đúng từ khóa, hai tranh và đáp án, đúng tác giả/thứ tự.
2. Test 4–8 người: đúng N−1 lượt vẽ, người sau chỉ nhận tranh người ngay trước, đúng một lượt đoán cuối; không xuất hiện nhiệm vụ viết mô tả hoặc đoán giữa chuỗi.
3. Test xoay vai qua ba ván A/B/C → B/C/A → C/A/B; chủ phòng không tự có quyền xem từ khóa. Test thay đổi thành viên giữa ván và ván gián đoạn theo quy tắc đã nêu.
4. Test server chặn bắt đầu dưới ba người hoặc có ghế offline, khách bắt đầu, người chưa tới lượt nộp, nộp sai loại bài, turnId cũ, nộp trùng và nộp muộn. Kiểm tra payload từng client để bảo đảm từ khóa và tranh không được giao không bị lộ trước reveal.
5. Test nộp sớm chuyển đúng lượt; hết giờ vẽ kết thúc gián đoạn, không chuyền tranh thay thế; hết giờ đoán ghi không kịp đoán; kết nối lại khôi phục đúng lượt và deadline còn lại, không gia hạn tùy ý.
6. Integration test ba client WebSocket thật đi hết từ khóa bí mật → A vẽ → B vẽ lại → C đoán → công bố qua HTTP/server local; khởi động ván kế tiếp và xác minh đổi vai.
7. Kiểm tra giao diện ba cửa sổ và màn hình nhỏ; lưu ảnh khi cần.
8. README có cài đặt/chạy `npm install`, `npm start`, `npm test`, cách thử ba người, phân công và hạn chế bản đầu. Cung cấp sơ đồ HTTP/WebSocket và kịch bản demo theo luật truyền hình vẽ tuần tự.
9. Làm trên nhánh `game-foundation`; kiểm tra diff và test trước khi đẩy lên nhánh này, không thay main trực tiếp. Khiêm review nhánh rồi nhóm hợp nhất.

## Điều kiện xong khung

Máy mới clone repo, vào game/, cài dependency và khởi động được bằng lệnh README. Ba người vào cùng phòng, lần lượt A vẽ từ khóa bí mật → B xem tranh A và vẽ lại → C xem tranh B và đoán. Kết quả có từ khóa, tranh A, tranh B và đáp án C. Ván sau B vẽ → C vẽ lại → A đoán. Không có lượt viết mô tả/đoán xen kẽ. Module/tài liệu đủ rõ để ba thành viên nhận việc song song. Các chức năng mở rộng chưa làm phải được ghi trong BACKLOG thay vì hiển thị là đã hoạt động.
