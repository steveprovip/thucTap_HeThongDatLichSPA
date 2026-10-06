# Rà soát 5 bất biến nghiệp vụ — đối chiếu tệp yêu cầu đề tài

Nguồn đối chiếu: `docs/requirements/3. Hệ thống đặt lịch Salon Spa.xlsx` (39 User Story · 165 SP) — các tiêu chí chấp nhận
S1-05, S2-02, S2-05, S2-07, S2-08, S2-09, S3-04, S3-09, S4-01. Ngày rà soát: 06/10/2026 (sau v1.4.0).
Kiểm thử hồi quy mới: `backend/test/invariants.e2e-spec.ts` (10 ca, đã kiểm chứng ngược: gỡ bản vá thì 6–8 ca đỏ).

| # | Bất biến (theo tệp yêu cầu) | Trước rà soát | Lỗ hổng tìm thấy → đã vá |
|---|---|---|---|
| 1 | Thời lượng dịch vụ bội số 15, 15–240 phút; giá nguyên dương ≤ 20.000.000 đ (S1-05); dịch vụ đã có lịch/phiếu không xoá cứng; đổi thời lượng không đổi lịch đã đặt | Đạt ở 3 lớp: DTO, `services.service.ts validateRules`, CHECK trong CSDL; xoá có khoá `FOR UPDATE` | Gợi ý **chuyển lịch hàng loạt** tính lại thời lượng theo dịch vụ HIỆN HÀNH → dùng thời lượng đã chốt trên lịch hẹn (`totalDurationOverride`). Lưu ý: tệp yêu cầu ghi "giá là số nguyên **dương**" nên giá 0 đ bị từ chối (chặt hơn "giá ≥ 0") |
| 2 | Lưới 15 phút; trong ca + giờ mở cửa, không đè giờ nghỉ; loại lịch đã có, ngày nghỉ tiệm/thợ; chặn quá khứ và < 60 phút (S2-05) | Đạt cho luồng đặt online / tại quầy | (a) **Giữ chỗ bỏ qua kiểm tra kỹ năng**: giữ dịch vụ A với thợ X rồi chốt dịch vụ B (X không làm được) bằng cùng `holdToken` → lịch vẫn được tạo cho X. Nay luôn kiểm tra kỹ năng + khung giờ cho thợ của chỗ giữ, không đạt thì tự phân thợ khác. (b) **Giữ chỗ nhận giờ lệch lưới** (09:07) và không kiểm tra kỹ năng khi chọn đích danh thợ → đã chặn |
| 3 | Chống đặt trùng: `SERIALIZABLE` + `FOR UPDATE` dòng thợ + `EXCLUDE appointments_no_overlap` (S2-08) | Đạt cho tạo lịch | (a) **Dời lịch / chuyển hàng loạt** ghi thẳng, không khoá, không kiểm tra chỗ đang giữ → nay ghi trong giao dịch khoá dòng thợ đích + dòng lịch hẹn, kiểm tra lại chồng lịch và chỗ giữ trong khoá. (b) **Đổi trạng thái theo kiểu đọc → kiểm tra → ghi**: khách huỷ bằng mã đúng lúc lễ tân bấm Xác nhận thì lịch đã huỷ "sống lại" → `saveAppointmentGuarded` khoá dòng và đối chiếu trạng thái (409 nếu đã đổi), áp dụng cho xác nhận, từ chối, check-in, không đến, hoàn tác, huỷ (nhân viên và khách), bắt đầu, hoàn tất. (c) Chuyển hàng loạt **không có thợ thay thế** bị đếm là "thành công" → nay vào danh sách cần gọi khách (S3-09) |
| 4 | 5 lượt đặt / IP / giờ (429); 3 lịch chưa hoàn tất / SĐT; khoá tra cứu 30 phút sau 10 lần sai (S2-07, S2-09); khoá đăng nhập 15 phút sau 5 lần sai (S1-01) | Đạt; bộ đếm lưu CSDL (dùng chung nhiều tiến trình), đếm SĐT lại trong giao dịch SERIALIZABLE | Khách **thua cuộc tranh khung giờ** (409) vẫn bị trừ lượt → chọn lại 2–3 lần là bị chặn 1 giờ. Nay trả lại lượt cho 409 do thua cuộc tranh (`SlotRaceLostException`); lỗi dữ liệu (400) và giờ không còn thợ nào vẫn bị tính. Sửa chú thích "cửa sổ trượt" → cửa sổ cố định (đúng với mã) |
| 5 | Ngày nghỉ tiệm/thợ xoá khung giờ, cảnh báo số lịch bị ảnh hưởng trước khi lưu (S2-02); không xoá cứng lịch sử tài chính; phiếu đã đóng chỉ điều chỉnh (S4-01) | Đạt phần lớn; nhật ký chỉ đọc bằng trigger | (a) **Ngày nghỉ theo giờ** chỉ đếm lịch BẮT ĐẦU trong khoảng nghỉ: lịch 09:00–11:00 bị nghỉ 10:00–12:00 cắt ngang mà không cảnh báo → đổi sang điều kiện chồng lấn. (b) Sửa ca thêm **giờ nghỉ đè lên lịch đã đặt** được chấp nhận → chặn kèm mã lịch. (c) **Đua dữ liệu phiếu**: "Sửa phiếu"/"Thu tiền" song song với "Đóng phiếu" có thể kéo phiếu đã đóng về nháp; hai lượt "Lập phiếu điều chỉnh" tạo hai phiếu → khoá dòng phiếu, cập nhật có điều kiện. (d) **Chốt chặn tầng CSDL** (migration `ProtectFinancialHistory1791417600000`, chỉ thêm trigger): phiếu đã đóng không sửa số tiền / không xoá, dòng dịch vụ của phiếu đã đóng không sửa/xoá, chặn `TRUNCATE` nhật ký và phiếu |

Phát hiện phụ: `migrate.ts` sắp xếp danh sách migration theo **bảng chữ cái** để báo cáo "chờ chạy" và đặt tên bản sao lưu,
trong khi TypeORM chạy theo **mốc thời gian** → nay sắp theo mốc thời gian.

## Kết quả kiểm thử sau rà soát

| Bộ | Kết quả |
|---|---|
| Backend unit | 168 / 168 |
| Backend e2e (PostgreSQL thật) | 105 / 105 (14 bộ; thêm `invariants.e2e-spec.ts` 10 ca) |
| Lint / typecheck | 0 lỗi, 0 cảnh báo |
