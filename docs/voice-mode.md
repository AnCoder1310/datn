# Gọi thoại trong Phòng luyện tập

Chọn kịch bản, chọn **Gọi thoại** rồi bấm **Bắt đầu cuộc gọi** và cho phép dùng mic. Sau khi kết nối, tư vấn viên mở lời. Có thể nói tự nhiên, ngắt lời khách bằng giọng nói hoặc nút **Ngắt lời khách**, tắt mic, tắt tiếng khách và chọn mic nếu trình duyệt cung cấp nhiều thiết bị. Tab **Ghi chép hội thoại** hiển thị lời khách và lời tư vấn viên. **Kết thúc cuộc gọi** lưu bản chép và giữ phòng mở. **Kết thúc & chấm điểm** hoàn tất bản chép rồi chạy bộ chấm điểm hiện có.

## Cấu hình backend

Đặt `OPENAI_API_KEY` của dự án OpenAI có quyền Realtime trong môi trường backend. Mic cần HTTPS hoặc localhost. Reverse proxy phục vụ `/api` phải chuyển tiếp SSE mà không đệm và giữ kết nối theo thời lượng cuộc gọi. Cấu hình chạy một worker của Dockerfile giữ SDP, SSE và các thao tác cuộc gọi ở cùng một tiến trình. Triển khai nhiều worker hoặc nhiều instance cần phân luồng theo cuộc gọi và cơ chế khóa phân tán trước khi mở rộng.

Khi chạy local, thêm khóa vào `.env` ở gốc `AI-Sale` và khởi động lại backend. Phòng luyện tập kiểm tra cấu hình trước khi xin quyền mic. Sau khi cập nhật khóa, chọn **Kiểm tra lại cấu hình** để thử tiếp.

```dotenv
OPENAI_API_KEY=
REALTIME_MODEL=gpt-realtime-2.1
REALTIME_FALLBACK_MODEL=gpt-realtime-2.1-mini
REALTIME_VOICE=marin
REALTIME_TRANSCRIPTION_MODEL=gpt-live-transcribe
REALTIME_VAD_THRESHOLD=0.55
REALTIME_VAD_SILENCE_MS=850
REALTIME_CALL_LIMIT_SECONDS=1200
```

`REALTIME_VOICE` cũng nhận `cedar`. Fallback chỉ chạy khi OpenAI báo model chính không khả dụng hoặc thiếu quyền riêng cho model đó. Backend ghi tên model đã mở, lưu tên này trong checkpoint và trả về cùng SDP. Các lỗi xác thực chung, giới hạn tài khoản và lỗi mạng được trả về để tư vấn viên xử lý. Một tư vấn viên có một cuộc gọi đang mở. Mở trang hoặc chọn chế độ chưa tạo cuộc gọi.

## Kết nối, bản chép lời và chấm điểm

- Browser gửi SDP đến `POST /api/v1/practice/{session_id}/realtime`. Backend kiểm tra phiên thuộc tài khoản tư vấn viên, dựng chỉ dẫn nhân vật từ kịch bản đã lưu rồi gửi SDP và cấu hình đến OpenAI `/v1/realtime/calls`. Media truyền giữa trình duyệt và OpenAI qua WebRTC. Backend giữ khóa OpenAI và đọc sự kiện qua WebSocket sideband.
- Browser nhận trạng thái và bản chép qua `GET /api/v1/practice/{session_id}/realtime/{call_id}/events`. Chỉ dùng dữ liệu lời thoại phát sinh từ sự kiện OpenAI. Cập nhật tạm và bản chép cuối dùng chung ID của lượt nói. Tin gốc được lưu theo checkpoint của phiên với người nói, ID, thời gian và trạng thái bị ngắt. Audio thô không được ghi vào database.
- VAD tách lượt, tạo phản hồi và hỗ trợ ngắt bằng giọng nói. Thao tác tay gọi `POST .../interrupt` để hủy phản hồi và dọn vùng phát âm. Bản chép của phản hồi đã nghe hết được chốt khi OpenAI báo đã phát hết. Khi bị ngắt, lịch sử giữ dấu **Bị ngắt** vì API chưa cung cấp văn bản khớp chính xác phần đã nghe.
- `POST .../stop` dừng phát, chờ bản chép lời tư vấn viên đã phát sinh và đóng cuộc gọi. Các đoạn đã lưu được giữ khi kết nối lại. Nếu một lượt tư vấn bị mất hoặc chưa chép hết, checkpoint đánh dấu phiên thiếu bản chép và chặn chấm điểm. Phiên kết nối lại dùng kịch bản gốc cùng các lượt đã lưu gần nhất.
- `POST /api/v1/practice/{session_id}/finish` kiểm tra checkpoint, phân tích các phát biểu của tư vấn viên qua bộ phân tích hiện có, rồi dùng AI Evaluator, rubric và luồng kết quả hiện có. Dấu ngắt được giữ trong lịch sử và bỏ khỏi đầu vào chấm điểm. Các trường mới nằm trong JSON của `practice_checkpoints`, không cần migration SQL. Backend ghi model và tổng token khi nhà cung cấp trả usage.

API Groq chuyển tệp âm thanh và Google WaveNet phát lại vẫn dành cho chức năng cũ và phát lại tin nhắn chữ. Báo cáo chi phí STT/TTS cũ chỉ tính các yêu cầu đó.

Tài liệu OpenAI: [WebRTC](https://developers.openai.com/api/docs/guides/realtime-webrtc), [điều khiển server](https://developers.openai.com/api/docs/guides/realtime-server-controls), [sự kiện hội thoại và ngắt lời](https://developers.openai.com/api/docs/guides/realtime-conversations).
