# AGENTS.md — QUY TẮC BẮT BUỘC CHO AI CODING DỰ ÁN BÌNH YÊN

> Áp dụng cho Cursor Agent và các AI coding làm việc trong repository `D:\BinhYen`.
> Đây là **quy tắc thực thi lâu dài**, bổ sung cho `docs/MASTER_PLAN.md` (lộ trình). Khi có xung đột, **yêu cầu mới nhất của chủ dự án và mã nguồn thực tế** được ưu tiên; phải báo rõ xung đột trước khi sửa.
> Những thông tin về hiện trạng dưới đây được tổng hợp từ quá trình trao đổi; **không khẳng định đã kiểm tra repository thực tế**.

## 1. Sứ mệnh và thứ tự ưu tiên

**Bình Yên** là website/webapp vuốt dọc để khám phá châm ngôn, chuyện ngắn, khoa học, thiên nhiên, tâm lý phổ thông, góc nhìn sống và những điều dễ thương. Người dùng mở là đọc được ngay, không bắt buộc đăng nhập. Cảm giác chủ đạo: **bình yên, tự nhiên, mượt mà, thông minh nhưng không phức tạp**.

Khi phải đánh đổi, ưu tiên theo thứ tự:
1. **Đúng dữ liệu, đúng chức năng, không lỗi** (bao gồm an toàn dữ liệu và quyền riêng tư).
2. **Vuốt mượt, phản hồi tức thời, không giật/nháy/chặn thao tác**.
3. **Nhanh, nhẹ, ít tài nguyên và ít request** trên điện thoại phổ thông.
4. **Nội dung phù hợp, đa dạng, hữu ích; không gây nhàm chán**.
5. **Code đơn giản, dễ bảo trì, mở rộng có kiểm soát**.
6. Thẩm mỹ tinh tế, nhất quán, phù hợp không khí Bình Yên.

Không đánh đổi độ chính xác hoặc trải nghiệm thật để có điểm benchmark đẹp.

## 2. Stack và các quyết định đã chốt

- **Astro + Svelte 5 + TypeScript**; component tương tác dùng Svelte, phần tĩnh ưu tiên Astro.
- **Vanilla CSS**, dùng design tokens/CSS variables chung. **Không tự thêm UI framework**, animation framework hoặc state-management library.
- **Cloudflare Workers + D1**, có thể sử dụng R2 khi thật sự cần lưu media.
- **Wrangler migrations** quản lý schema; `--local` khi thử nghiệm; **không chạy `--remote`, không deploy production, không xóa dữ liệu thật nếu chưa được yêu cầu/phê duyệt rõ ràng**.
- **Vitest** cho unit tests. Ưu tiên công cụ đã có; chỉ thêm dependency khi có nhu cầu được chứng minh và giải thích lợi ích/chi phí.
- Không tự thay đổi framework, chuyển repository, cấu trúc thư mục lớn hoặc nâng phiên bản major chỉ vì “mới hơn”.
- Máy phát triển **Windows / PowerShell**, dự án dự kiến ở `D:\BinhYen`. Ví dụ lệnh phải chạy được trên PowerShell (không đưa Bash một cách mặc định).

## 3. Đọc và hiểu trước khi viết

**Bắt buộc mỗi khi nhận task:**
1. Đọc yêu cầu hiện tại, `AGENTS.md` và phần liên quan của `docs/MASTER_PLAN.md` (nếu có).
2. Khảo sát các file liên quan, kiểu dữ liệu, import, tests, scripts, cấu hình Astro/Cloudflare/D1; xác nhận chức năng thực tế thay vì đoán từ tài liệu.
3. Tóm tắt ngắn: **mục tiêu — nguyên nhân/vị trí — file dự định sửa — rủi ro — cách kiểm thử**. Nếu task nhỏ có thể gói trong 2–4 dòng.
4. Chỉ sửa đúng phạm vi cần thiết; **tái sử dụng code sẵn có**, không tạo service/helper/abstraction chỉ để “đẹp kiến trúc”.
5. Sau khi sửa, kiểm tra kết quả thật; báo chính xác những gì đã chạy và chưa chạy.

**Cấm:** sửa đoán mò; search/replace quá rộng; tạo file trùng chức năng; xóa/sửa tính năng đang tốt mà không có bằng chứng; báo “thành công” khi chưa kiểm tra; âm thầm thay đổi hành vi sản phẩm; cố sửa lỗi bằng cách tắt TypeScript, bỏ test hoặc nuốt lỗi.

## 4. Nguyên tắc code thực chiến và tiết kiệm token

- Mỗi lần **một vấn đề/một task**, thay đổi nhỏ nhất đủ giải quyết nguyên nhân gốc; không refactor ngoài phạm vi.
- Tên file, hàm, biến rõ nghĩa; một nơi chịu trách nhiệm một việc. Không nhân bản logic giữa API, feed source và component.
- Ưu tiên hàm thuần cho lọc/xếp hạng/cursor để kiểm thử dễ. **Không dùng `any`, `@ts-ignore`, non-null assertion** khi chưa có lý do được nêu rõ.
- Kiểm tra dữ liệu **ở biên hệ thống**: query parameters, request body, phản hồi API, dữ liệu DB và nguồn ngoài.
- Code dễ đọc hơn code “khéo”; tránh generic phức tạp, tầng abstraction quá sớm, comments giải thích điều hiển nhiên.
- Không viết lại nguyên file nếu chỉ cần vài dòng. Không tạo bản `.bak` tràn lan trong `src`; tận dụng Git và bản sao lưu phù hợp khi có thao tác nguy hiểm.
- Trong hội thoại: trả lời **tiếng Việt, ngắn gọn, có căn cứ**; chỉ hiển thị diff/đoạn cần thiết và lệnh test. Không lặp lại cả roadmap hay dài dòng giải thích cơ bản nếu không được hỏi.
- Khi thông tin chưa đủ, **đọc mã nguồn trước**, chỉ hỏi khi thực sự không thể tiếp tục an toàn.

## 5. Hiệu năng vuốt — yêu cầu ưu tiên số 1 của UI

- **Giữ nguyên cơ chế vuốt đang chạy tốt** cho tới khi đo được lỗi cụ thể. Không viết lại gesture/animation chỉ vì thích thư viện khác.
- Tối ưu cho điện thoại cảm ứng và máy cấu hình trung bình; chuột/bàn phím là phương thức bổ sung.
- Pointer/touch move **không ghi state gây rerender toàn bộ component mỗi frame**; ưu tiên cập nhật transform qua `requestAnimationFrame`/CSS custom properties như triển khai hiện tại.
- Animation chỉ dùng thuộc tính thân thiện compositor (`transform`, khi hợp lý là `opacity`); hạn chế thay đổi `top/left/height`, layout thrashing và đọc `getBoundingClientRect()` lặp trong mỗi frame.
- Không tạo nhiều listener hoặc timer trên mỗi card; gỡ `pointer`/`keydown`/`resize` listener, RAF, timeout và pending fetch khi component unmount hoặc luồng bị thay thế.
- Giữ **tối đa khoảng 2–3 card gần vị trí hiện tại trong DOM**, không render danh sách hàng nghìn bài.
- Card phải có chiều cao/bố cục ổn định khi tải, không giật giữa chừng; nội dung dài mở chế độ đọc riêng; tôn trọng `prefers-reduced-motion`.
- Vuốt không bị kẹt ở cuối buffer. Tải trước dựa trên **ngưỡng số bài còn lại**, tránh request lặp; có loading, retry, empty, end-of-feed rõ ràng.
- Tương tác không phụ thuộc mạng: fetch là bất đồng bộ, không chặn animation hoặc thao tác đang diễn ra.
- Tránh kéo nhầm khi đọc bài dài, click nút lưu hay dùng dropdown; hỗ trợ touch-action hợp lý và khả năng truy cập bằng bàn phím.
- Mọi thay đổi animation phải được thử vuốt nhanh nhiều lần, đổi hướng giữa chừng, vuốt qua chữ/dấu cách (nếu liên quan), mở/đóng bài dài và chạy trên viewport điện thoại.

## 6. Feed, phân trang và dữ liệu lớn

- Mọi feed trả về **đúng một hợp đồng dữ liệu** (`ContentItem`, `FeedPage`) và API có kiểm soát. Frontend không truy cập D1 trực tiếp.
- Không nạp hàng nghìn bài về trình duyệt rồi mới lọc; **lọc, truy xuất ứng viên và phân trang tại backend/DB** khi khối lượng dữ liệu tăng.
- Keyset pagination với **thứ tự ổn định và duy nhất**; cursor chứa đầy đủ khóa sắp xếp, được xác thực; không ghép SQL từ tham số người dùng.
- Kiểm thử cursor với: ID `1`, `2`, `10`; cùng timestamp; nội dung mới thêm; bài bị ẩn/xóa; cursor sai/hết hạn; trang cuối; giới hạn 1 và giới hạn lớn nhất.
- Không dùng offset pagination sâu cho feed lớn; không dùng ORDER BY RANDOM() trên toàn bảng lớn.
- Tạo index **dựa trên truy vấn thực tế**, xác nhận bằng `EXPLAIN QUERY PLAN` khi tối ưu; tránh index không dùng gây tăng chi phí ghi.
- Chỉ lấy trường cần cho thẻ; `body_markdown` của bài dài tải riêng khi người dùng mở đọc đầy đủ.
- Batch query khi phù hợp để tránh N+1; giới hạn kích thước trang và số truy vấn; API lỗi phải có HTTP status, phản hồi an toàn, log có ngữ cảnh nhưng không lộ dữ liệu nhạy cảm.
- Chống dữ liệu lặp theo ID (và về sau fingerprint được chuẩn hóa); phân biệt `seen`, `saved`, `hidden` và nội dung đã đọc hết.
- Khi filters đổi hoặc người dùng làm mới: tạo luồng feed mới, **không để request cũ ghi đè request mới**; cân nhắc `AbortController` và request generation token.
- Quy tắc tiết kiệm D1/Workers: cache nội dung công khai ở nơi thích hợp, nhưng **không cache lẫn thông tin cá nhân**; đo rồi mới tối ưu.

## 7. Thuật toán đề xuất thông minh, không tạo vòng lặp nhàm chán

Mục tiêu không phải AI/ML phức tạp ngay. Khởi đầu bằng **ranking có thể giải thích, đo lường, kiểm thử và nâng cấp dần**:

**Đầu vào (khi được người dùng chọn/cho phép):** chủ đề quan tâm, tâm trạng hiện tại, lịch sử đã xem trong phiên, lưu/ẩn bài, chủ đề và loại nội dung gần đây, chất lượng nội dung; không suy đoán bệnh lý hoặc trạng thái tâm thần nhạy cảm từ tương tác.

**Quy trình đề xuất:**
1. Loại bỏ trước: bản nháp, nội dung bị ẩn, không đủ chất lượng, bài đã xem/lặp trong phạm vi khả dụng.
2. Lấy tập ứng viên từ D1 theo chủ đề/tâm trạng, có nguồn khám phá dự phòng nếu tập quá ít.
3. Tính điểm dựa trên mức phù hợp + chất lượng + yếu tố mới mẻ; áp dụng phạt lặp cùng `theme`/`kind`/tác giả hay mô-típ trong cửa sổ ngắn.
4. Trộn có kiểm soát giữa **phù hợp — liên quan — khám phá** (tỷ lệ 70/20/10 chỉ là mốc thử ban đầu, **không hardcode như quy luật tối ưu**); điều chỉnh sau khi có đo lường.
5. Có phương án khi người dùng mới, chưa chọn tâm trạng, lọc quá hẹp, kho nội dung nhỏ hoặc toàn bộ bài đã xem.
6. Phân trang nhất quán với ranking; tránh mỗi lần request lại xáo trộn khiến lặp/bỏ sót. Nếu dùng seed, phải có cơ chế ổn định trong một phiên/feed.

**Chỉ số đánh giá:** tỉ lệ nội dung trùng, mức đa dạng trong 10–20 bài, thời gian đến thẻ đầu tiên, tỉ lệ load lỗi, thời gian chờ ở cuối buffer, hành vi lưu/bỏ qua (không tối ưu chỉ vì kéo dài thời gian dùng app).

**Tuyệt đối tránh:** đẩy nội dung gây nghiện/căng thẳng để tăng lượt vuốt; nhãn tâm lý chưa được xác minh; lạm dụng dữ liệu người dùng; tuyên bố thuật toán “thông minh nhất” khi chưa đo.

## 8. Database, migration, API và bảo mật

- Schema đã định hướng: `contents`, `content_details`, `topics`, `moods`, `content_topics`, `content_moods`; **kiểm tra schema thực tế** trước khi viết truy vấn/migration.
- Mọi đổi cấu trúc qua migration mới, **không tự sửa migration đã áp dụng**. Cần kế hoạch chuyển đổi/backfill dữ liệu nếu đổi khóa hay kiểu dữ liệu.
- Luôn thử migration `--local`; kiểm tra khóa ngoại, unique, dữ liệu rỗng và dữ liệu lớn giả lập. Remote chỉ theo yêu cầu rõ ràng.
- Truy vấn parameterized (`prepare().bind()`), validate/whitelist tham số, giới hạn `limit`, cursor; không ghép user input vào SQL.
- API công khai chỉ trả bài `published`; quyền admin xác thực ở server trước khi truy cập nháp/ghi dữ liệu. Không tin vai trò/ID do client gửi.
- Không hardcode token/secret, không đưa `.env` hoặc credential vào Git, không log thông tin nhạy cảm; dùng Cloudflare secrets/bindings phù hợp.
- Chống spam/rate abuse theo rủi ro thực; không thêm dịch vụ ngoài khi chưa cần.
- Quy tắc nội dung: với khoa học/tâm lý, có thể lưu nguồn, ngày kiểm chứng; tránh công bố thông tin sai, khẳng định điều trị bệnh, hứa chữa lành hoặc cá nhân hóa kiểu chẩn đoán.

## 9. UI/UX và design system

- Phong cách: **tối giản, ấm, dịu, nhiều khoảng thở, typography dễ đọc**, không màu chói, không quá nhiều bảng điều khiển/icon/trang trí.
- Mọi màu, font scale, spacing, radius, duration chung dùng tokens/CSS variables; không hardcode màu rải rác trong component nếu đã có token.
- Responsive mobile-first; tránh layout overflow, thanh cuộn lồng nhau không cần thiết, FOUC, dịch chuyển bố cục và pop-up che nội dung.
- Không thêm chức năng “xã hội” (like/comment/chat/leaderboard) hay gamification nếu chưa được yêu cầu.
- Ưu tiên thao tác ít: mở đọc ngay, vuốt tự nhiên, lưu dễ, đổi chủ đề/tâm trạng rõ ràng, hoàn nguyên được.
- Accessible: tương phản đủ, focus visible, nút có nhãn, dùng semantic HTML, giảm chuyển động khi người dùng yêu cầu.

## 10. Các mục tiêu đo lường — không được tự tuyên bố đã đạt

Các mục tiêu sau **chỉ là ngân sách định hướng để đo trên thiết bị phù hợp**, không phải cam kết khi chưa profiling:

| Hạng mục | Mục tiêu định hướng |
|---|---|
| Thao tác vuốt | Hướng tới 60 FPS trên thiết bị phổ thông; không giật thấy rõ |
| Thời gian phản hồi thao tác | Chuyển động bám ngón tay, không chờ mạng |
| Số card trong DOM | Thường 2–3 card quanh thẻ hiện tại |
| API feed | Tải theo đợt nhỏ, giới hạn 20 bản ghi/yêu cầu ở phiên bản hiện tại |
| Bundle JS | Giữ nhỏ; theo dõi thay đổi sau mỗi dependency/tính năng |
| Database | Query dùng index phù hợp; thử 10.000–100.000 bài giả lập trước khi kết luận khả năng mở rộng |

Dùng Chrome Performance/Lighthouse, Network, Cloudflare logs/analytics và `EXPLAIN QUERY PLAN` khi phù hợp. Ghi lại **thiết bị, mạng, dataset, số đo trước/sau**. Không tối ưu theo cảm giác hoặc ngụy tạo số liệu.

## 11. Quy trình kiểm thử và Definition of Done

**Mỗi task hoàn thành khi:**
- Chức năng đúng với yêu cầu và trường hợp biên đã định nghĩa.
- Không phá luồng vuốt, chọn bộ lọc, lưu bài, đọc đầy đủ, tải thêm, retry, empty state.
- Không phát sinh lỗi TypeScript/Svelte, warning mới không được giải thích, lỗi runtime/console.
- Chạy được các lệnh phù hợp:
  ```powershell
  npm test
  npx astro check
  npm run build
  ```
- **API có thay đổi phải thử HTTP thật** (local) và kiểm tra response/status; build xanh **không chứng minh runtime Workers/D1 hoạt động**.
- **Thay đổi SQL** phải test migration local, truy vấn & phân trang, `PRAGMA foreign_key_check` khi có quan hệ mới.
- **Thay đổi UI** phải xác minh kích thước điện thoại + desktop và cả trạng thái loading/error/empty.
- Với logic quan trọng, bổ sung test regression/edge case trước hoặc cùng lúc sửa lỗi.
- Khi test không chạy được do môi trường, báo rõ **chưa xác minh**, không ghi “đã thành công”.

## 12. Giới hạn quyền tự động của AI

**Có thể tự làm trong phạm vi task:** đọc source, chỉnh file liên quan, chạy formatter/lint/test/build, viết unit test, migration local không phá dữ liệu.

**Phải hỏi chủ dự án trước:** tạo/sửa/xóa dữ liệu remote, thay đổi production/secrets/domain, thêm dịch vụ trả phí, thay thư viện/framework quan trọng, refactor quy mô lớn, xóa bảng/file/dữ liệu, đổi hành vi sản phẩm gây ảnh hưởng rõ rệt, tích hợp thu thập dữ liệu cá nhân.

Không tự kích hoạt cron, background job, telemetry, quảng cáo, thông báo đẩy hoặc lưu lịch sử riêng tư nếu chưa được yêu cầu.

## 13. Cách báo cáo sau mỗi task (cực ngắn)

1. **Đã xử lý:** lỗi/nguyên nhân và thay đổi thực tế (1–3 dòng).
2. **File đã sửa/tạo:** danh sách ngắn.
3. **Kiểm tra:** lệnh + kết quả; nếu API/UI cần kiểm tra thủ công, nêu đường dẫn/bước.
4. **Còn lại/rủi ro:** nói rõ nếu chưa xác minh.
5. **Bước kế tiếp:** đề xuất duy nhất một việc, **không tự triển khai nếu chưa được giao**.

## 14. Prompt giao task mẫu cho Cursor

> Đọc `AGENTS.md` và phần liên quan của `docs/MASTER_PLAN.md`; kiểm tra source thực tế. Chỉ làm **[MÔ TẢ NHIỆM VỤ]**. Trước khi sửa, xác định nguyên nhân, file liên quan và cách kiểm thử. Ưu tiên thay đổi nhỏ nhất, không phá luồng vuốt/animation, không thêm dependency không cần thiết, không chạm D1 remote. Chạy test/check/build và test runtime đúng phạm vi; báo cáo ngắn những gì đã làm, kết quả và rủi ro. Không tự chuyển sang nhiệm vụ khác.
