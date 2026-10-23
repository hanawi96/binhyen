# BÌNH YÊN — MASTER PLAN CHUYỂN GIAO CHO CURSOR

> Phiên bản: 1.0 · Ngày lập: 22/10/2026  
> Mục đích: Tài liệu định hướng phát triển và quy trình giao việc cho Cursor AI.  
> Dự án cục bộ: `D:\BinhYen`  
> **Căn cứ:** lịch sử triển khai do người dùng cung cấp; **chưa trực tiếp kiểm tra source hiện tại**. Cursor bắt buộc rà soát repository trước khi sửa và ghi nhận mọi sai khác.

---

## 0. HƯỚNG DẪN SỬ DỤNG

1. Đặt file này tại `D:\BinhYen\docs\MASTER_PLAN.md` (tạo thư mục `docs` nếu chưa có).
2. Mở thư mục `D:\BinhYen` trong Cursor.
3. Dán **Prompt khởi động** ở mục 14 vào Cursor Agent và yêu cầu đọc file này.
4. Chỉ giao **một nhiệm vụ** mỗi lần; khi xong phải kiểm thử, báo cáo rồi mới nhận nhiệm vụ kế tiếp.
5. Trong các mục dưới đây, trạng thái **ĐÃ BÁO HOÀN THÀNH** chỉ phản ánh kết quả người dùng đã xác nhận, không thay thế kiểm tra thực tế của Cursor.

## 1. TẦM NHÌN SẢN PHẨM

**Bình Yên** là webapp trải nghiệm nội dung nhẹ nhàng theo kiểu vuốt dọc: châm ngôn, góc nhìn tích cực, truyện ngắn, kiến thức khoa học, thiên nhiên, tâm lý phổ thông và những điều dễ thương.

### Giá trị cốt lõi

- Người dùng mở lên là có nội dung để đọc, **không bắt đăng nhập**.
- Giao diện tinh tế, êm dịu, ít thao tác, ít yếu tố gây xao nhãng.
- Vuốt mượt và ổn định là yêu cầu cao nhất của màn hình chính.
- Đề xuất dựa trên **chủ đề, tâm trạng, nội dung đã xem**, thêm mức độ khám phá đa dạng để không nhàm chán.
- Nội dung dài có thể mở đọc đầy đủ; nội dung ngắn đọc ngay trên thẻ.
- Khi phát triển đến hàng chục nghìn bài, hệ thống vẫn tải nhanh, phân trang chính xác và không bị lặp liên tục.
- Thông tin khoa học/tâm lý cần được kiểm chứng, phân biệt kiến thức và lời động viên; không thổi phồng hiệu quả tâm lý hay y tế.

### Không làm sớm

Mạng xã hội, bình luận, theo dõi người dùng, chat, bảng xếp hạng, AI gợi ý phức tạp, nhiều animation trang trí, microservices, công cụ quản trị cồng kềnh. Chỉ thêm khi có nhu cầu sử dụng thực sự.

## 2. CÔNG NGHỆ VÀ QUY ƯỚC ĐÃ CHỌN

| Thành phần | Quyết định | Lưu ý |
|---|---|---|
| Frontend/SSR/API | Astro + TypeScript | Dùng Astro endpoints cho API |
| Tương tác | Svelte 5 | Giữ phong cách code hiện có, không chuyển framework |
| CSS | Vanilla CSS + CSS variables | Không tự ý thêm Tailwind/UI framework |
| Hosting/runtime | Cloudflare Workers qua `@astrojs/cloudflare` | Kiểm tra phiên bản thực tế |
| Database | Cloudflare D1 (SQLite) | Local trước; remote chỉ theo lệnh riêng |
| Media tương lai | Cloudflare R2 | Chưa triển khai nếu chưa cần |
| Kiểm thử | Vitest | Các test hiện có phải tiếp tục đạt |
| CLI | Windows PowerShell | Ví dụ lệnh phải chạy hợp lệ trên PowerShell |

**CSS:** màu chung đặt trong `src/styles/tokens.css` / `src/styles/global.css` và dùng biến, không hardcode màu tùy ý trong từng component. Thiết kế mobile-first, hỗ trợ desktop, tôn trọng `prefers-reduced-motion`.

## 3. HIỆN TRẠNG ĐÃ TRIỂN KHAI (PHẢI XÁC MINH)

### A. Giao diện và vuốt — đã xây trong các bước 1–12

- Trang `src/pages/index.astro`; layout `src/layouts/BaseLayout.astro`.
- `src/features/feed/ContentCard.svelte`: thẻ nội dung, mở bài dài, nút lưu, theme.
- `src/features/feed/ExploreFeed.svelte`: bố cục hiển thị feed.
- `src/features/feed/SwipeDeck.svelte`: vuốt dọc, kéo bằng pointer, phím điều hướng, animation dùng `requestAnimationFrame`, CSS `--drag-offset`, `transitionend` và fallback.
- Chỉ render khoảng 2–3 thẻ gần vị trí hiện tại; không đưa toàn bộ feed vào DOM.
- Bộ lọc chủ đề/tâm trạng; đánh dấu đã xem sau khoảng 900 ms; hạn chế lặp trong phiên.
- Cơ chế tải 3 bài/lần và prefetch khi gần hết.

### B. Domain model — đã xây bước 8–12

- `src/features/content/content.types.ts` có các union type `ContentKind`, `ContentTopic`, `ContentMood`, `ContentTheme`, `ContentStatus` và `ContentItem`.
- `demo-contents.ts`: sáu bài dữ liệu mẫu.
- `filter-contents.ts`: lọc bài theo trạng thái/chủ đề/tâm trạng.
- `recommend-contents.ts`: gợi ý deterministic, nhóm ưu tiên/liên quan/khám phá, phạt trùng loại và theme.
- `feed-source.ts`: nguồn dữ liệu mẫu dùng cursor và phân trang.

### C. Cloudflare/D1 — đã làm bước 14–18

- `src/pages/api/health.ts`, `src/pages/api/db-check.ts`.
- File cấu hình Wrangler (có thể là `wrangler.jsonc`); binding D1 tên `DB`, database `binhyen-db`.
- Migration `migrations/0001_init_content_schema.sql`.
- Sáu bảng dự kiến: `contents`, `content_details`, `topics`, `moods`, `content_topics`, `content_moods`.
- `scripts/sql/seed-demo.sql`: sáu bài mẫu và liên kết chủ đề/tâm trạng.
- `src/pages/api/feed.ts`: API GET `/api/feed` trả `{success,items,nextCursor,hasMore}`.
- `src/features/feed/api-feed-source.ts`: nguồn API cho giao diện; cần xác minh đã được tích hợp chính xác vào `SwipeDeck.svelte`.

### D. Kiểm thử — đã có kết quả từ người dùng

- `filter-contents.test.ts`: 5 bài test.
- `recommend-contents.test.ts`: 6 bài test.
- `feed-source.test.ts`: 6 bài test.
- Kết quả trước đây: **17/17 passed**, Astro check 0 errors, production build thành công.
- Trạng thái sau các thay đổi bước 17–19 **phải đo lại**.

### E. Vị trí đang chuyển giao

- **Bước 19.1:** Đã cung cấp phương án cursor `v1:<created_at>:<id>` và sắp xếp `created_at DESC, id DESC`.
- **Chưa có bằng chứng xác nhận** người dùng đã chạy xong thay đổi 19.1 và kiểm thử phân trang.
- **Bước 19.2–19.4 chưa triển khai/kiểm chứng:** index; backend ranking theo chủ đề/tâm trạng; chống request trùng, test API thực.

**Cursor không được coi các mục này là đã hoàn thành chỉ vì tài liệu có nhắc đến.**

## 4. BẢN ĐỒ THƯ MỤC DỰ KIẾN

```text
D:\BinhYen\
├─ astro.config.mjs
├─ wrangler.jsonc               # xác minh tên thực tế
├─ package.json
├─ migrations/
│  └─ 0001_init_content_schema.sql
├─ scripts/
│  └─ sql/seed-demo.sql
├─ docs/
│  └─ MASTER_PLAN.md            # tài liệu này
└─ src/
   ├─ layouts/BaseLayout.astro
   ├─ pages/
   │  ├─ index.astro
   │  └─ api/
   │     ├─ health.ts
   │     ├─ db-check.ts
   │     └─ feed.ts
   ├─ styles/
   │  ├─ tokens.css
   │  └─ global.css
   └─ features/
      ├─ content/
      │  ├─ content.types.ts
      │  ├─ demo-contents.ts
      │  ├─ filter-contents.ts
      │  ├─ recommend-contents.ts
      │  ├─ filter-contents.test.ts
      │  └─ recommend-contents.test.ts
      └─ feed/
         ├─ ContentCard.svelte
         ├─ ExploreFeed.svelte
         ├─ SwipeDeck.svelte
         ├─ feed-source.ts
         ├─ feed-source.test.ts
         └─ api-feed-source.ts
```

Không tạo file trùng chức năng chỉ vì tên khác. Có thể điều chỉnh cấu trúc khi đã chứng minh lý do và bảo toàn imports.

## 5. NGUYÊN TẮC BẮT BUỘC CHO CURSOR AGENT

1. **Đọc trước khi sửa.** Xem `package.json`, `astro.config.mjs`, Wrangler, migrations, API, types, tests, `SwipeDeck.svelte` và các phụ thuộc liên quan.
2. **Tìm nguyên nhân gốc.** Không áp dụng sửa lỗi theo suy đoán, không thay toàn bộ component chỉ vì lỗi một chỗ.
3. **Một thay đổi nhỏ mỗi lượt.** Ưu tiên diff nhỏ nhất giải quyết đúng vấn đề.
4. **Không phá trải nghiệm vuốt.** Không thay thuật toán animation, gesture, DOM virtualization nếu nhiệm vụ không yêu cầu.
5. **Giữ đúng API contract.** Thay đổi response/cursor phải cập nhật cả frontend, kiểm thử và tài liệu.
6. **An toàn dữ liệu.** Không chạy `--remote`, không reset/drop database, không chạy migration production, không xóa bảng/dữ liệu nếu chưa được chủ dự án phê duyệt rõ ràng.
7. **Không ghi bí mật vào repo.** Không xuất token, API key, `.env` hoặc thông tin đăng nhập ra log/tài liệu/commit.
8. **Không thêm dependency tùy tiện.** Chỉ thêm nếu có lý do kỹ thuật rõ ràng; ưu tiên API sẵn có và stack đã chốt.
9. **Không tối ưu sớm bằng hạ tầng phức tạp.** Đo lường/kiểm thử trước rồi mới thêm cache, queue, worker riêng.
10. **Đủ test nhưng không hình thức.** Test luồng sai, boundary, dữ liệu trống, cursor lỗi, nhiều bản ghi cùng timestamp, tải lại, race condition.
11. **Kiểm tra môi trường.** Những lệnh xây dựng phải tương thích PowerShell và version hiện tại; không sao chép cú pháp Bash vô điều kiện.
12. **Không suy diễn trạng thái.** Nếu chưa kiểm tra trực tiếp, báo “chưa xác minh”; không nói “đã hoàn thành”.
13. **Giao diện dùng token thiết kế**, thống nhất typo/spacing/theme và khả năng tiếp cận.
14. **Báo cáo ngắn, thực chất:** file sửa, nguyên nhân, kiểm thử và việc chưa hoàn tất. Tiết kiệm token: không in lại cả file khi chỉ sửa vài dòng, không giải thích kiến thức phổ thông dài dòng.

## 6. QUY TRÌNH CHUẨN CHO MỖI TASK

### Trước khi code

- Tóm tắt nhiệm vụ và tiêu chí hoàn thành (tối đa 5 câu).
- Tìm đúng file và luồng dữ liệu liên quan; kiểm tra có test sẵn.
- Nếu có nhiều phương án, chọn phương án ít thay đổi nhất, giải thích tối đa 3 ý.
- Khi có nguy cơ thao tác remote/mất dữ liệu, dừng hỏi chủ dự án.

### Trong khi code

- Chỉ thay phần cần thay.
- Giữ code có kiểu rõ ràng, dễ đọc; tránh `any` không cần thiết.
- Validation đặt ở ranh giới dữ liệu đầu vào; không tin tưởng JSON từ network.
- Server chịu trách nhiệm phân trang, tính nhất quán và giới hạn truy vấn; client chịu trách nhiệm trình bày, prefetch, animation.

### Sau khi code

- Chạy `npm test`, `npx astro check`, `npm run build`.
- Với thay đổi D1, kiểm tra query trên **local** và trường hợp cạnh dữ liệu.
- Với thay đổi API, test cả response thành công, 400, 500, cursor và trang cuối.
- Với thay đổi SwipeDeck, kiểm tra thủ công: vuốt nhanh/chậm, kéo ngang không mong muốn, mở modal, quay lại, filter, loading, hết bài, mạng lỗi.
- Báo cáo `PASS/FAIL/CHƯA CHẠY` cho từng mục, không bỏ qua lỗi runtime dù build thành công.

## 7. ROADMAP ƯU TIÊN — CÁC PHASE SAU CHUYỂN GIAO

Trạng thái mặc định của tất cả task dưới đây là **CHƯA KIỂM CHỨNG** cho đến khi Cursor đọc source và chạy test.

### PHASE 0 — Audit & chốt baseline (PHẢI LÀM ĐẦU TIÊN)

**Mục tiêu:** Cursor hiểu chính xác hệ thống hiện tại trước khi bắt tay thay đổi.

- [ ] Liệt kê cấu trúc thực tế và version Astro/Svelte/Cloudflare/Wrangler/Vitest.
- [ ] Tìm entrypoint feed và cách API source được khởi tạo; xác minh `firstPage()` rỗng có kích hoạt `loadPage()` khi mount hay không.
- [ ] Xác minh `onMount`, reset filter, `feedVersion`, `seenIds`, loading/error/empty, nguồn dữ liệu.
- [ ] Chạy `npm test`, `npx astro check`, `npm run build`; ghi log tóm tắt.
- [ ] Kiểm tra migration đã apply local, `SELECT COUNT(*) FROM contents`, và `/api/feed?limit=3` khi dev server chạy.
- [ ] Đánh giá code của Bước 19.1 thực sự đang dùng cursor mới hay cũ; lưu ý cursor cũ có thể hết hiệu lực sau nâng cấp.
- [ ] Liệt kê phát hiện theo mức: blocker / nguy cơ / cải thiện sau; không tự sửa hàng loạt.

**Nghiệm thu:** Có báo cáo hiện trạng ngắn, danh sách lỗi tái hiện được, và thứ tự xử lý thống nhất. Nếu các test cũ đang fail thì ưu tiên sửa baseline trước tính năng mới.

### PHASE 1 — Hoàn thiện API Feed (ưu tiên P0)

#### Task 1.1. Kiểm tra và sửa keyset cursor

- [ ] Thứ tự ổn định, rõ ràng: `created_at DESC, id DESC` (hoặc khóa phát hành thích hợp nếu sản phẩm yêu cầu thứ tự đăng hơn là tạo).
- [ ] Cursor chứa đủ khóa thứ tự, có version và validation; không trust giá trị do client sửa.
- [ ] Không trùng/không bỏ sót khi nhiều bài cùng `created_at`, kể cả ID `1,2,10,11` và ID không phải số.
- [ ] Limit trong phạm vi 1–20; đầu vào không hợp lệ trả HTTP 400.
- [ ] Chỉ trả `status='published'`; không lộ draft/archive.
- [ ] Có kiểm thử trang đầu, trang giữa, trang cuối, cursor sai, DB trống.

**Nghiệm thu:** 100+ nội dung giả lập trả hết các ID đúng một lần trong luồng duyệt ổn định; JSON không thay đổi ngoài thay đổi đã thông báo.

#### Task 1.2. Index đúng query (Migration 0002)

- [ ] Đọc `CREATE INDEX` thực tế trong migration 0001 và truy vấn thực tế trong `feed.ts`.
- [ ] Tạo migration mới, **không sửa lịch sử migration 0001 đã áp dụng**.
- [ ] Dự kiến index `contents(status, created_at DESC, id DESC)`; chỉ giữ thêm index khi có truy vấn dùng.
- [ ] Dùng `EXPLAIN QUERY PLAN` trên D1 Local; đo với dữ liệu mẫu đại diện thay vì chỉ 6 bài.
- [ ] Áp dụng local, kiểm tra query và `PRAGMA foreign_key_check`.

**Nghiệm thu:** Query dùng index phù hợp và trả kết quả như trước; không cần chỉnh database remote.

#### Task 1.3. Lọc chủ đề và tâm trạng tại backend

- [ ] API nhận `topic`, `mood` (giá trị từ union type hoặc `all`).
- [ ] Lọc SQL bằng `EXISTS` trên `content_topics` / `content_moods`, tránh JOIN làm nhân bản bản ghi.
- [ ] Index quan hệ đủ phục vụ lọc; giới hạn query và validate input.
- [ ] Cursor phải gắn với cùng bộ lọc; khi đổi bộ lọc phải bắt đầu trang đầu (không dùng cursor cũ).
- [ ] Đảm bảo bộ lọc không chỉ chạy trên 3 bài vừa tải rồi trả trạng thái “không có bài” sai.

**Nghiệm thu:** Bộ lọc hoạt động trên **toàn bộ kho**; thử với bài phù hợp nằm ngoài trang đầu; không duplicate.

#### Task 1.4. Thuật toán đề xuất backend phiên bản 1

- [ ] Chốt hành vi: ưu tiên hợp chủ đề/tâm trạng, đa dạng `kind`/`theme`, có khám phá có kiểm soát.
- [ ] Tách bước chọn ứng viên SQL và xếp hạng ở service, không nhồi mọi logic trong `feed.ts`.
- [ ] Thuật toán deterministic theo seed/phiên khi cần, để phân trang không lặp và ổn định.
- [ ] Không lấy toàn bộ hàng chục nghìn bài từ D1 về Worker để xếp hạng bằng JS.
- [ ] Chứng minh còn nội dung phù hợp thì không báo hết feed quá sớm; kế hoạch fallback khi bộ lọc quá hẹp.
- [ ] Xác định “seen” trong phiên và cách lưu về lâu dài sau này; không thu thập dữ liệu vượt nhu cầu.

**Nghiệm thu:** Các bộ lọc và feed có kết quả hợp lý, đa dạng, có test tính ổn định và trường hợp biên; hiệu năng có số liệu.

#### Task 1.5. Hoàn thiện API security/observability

- [ ] Validate đầy đủ query/response; giới hạn số request và payload ở mức hợp lý theo môi trường triển khai.
- [ ] Không trả stack trace, SQL, thông tin bí mật cho client.
- [ ] Log lỗi đủ chẩn đoán nhưng không thu thập dữ liệu cá nhân không cần thiết.
- [ ] Tách API health internal nếu không cần công khai; kiểm tra Cache-Control phù hợp.
- [ ] Thêm integration tests cho API dùng D1 local/emulator hoặc dependency injection để có thể chạy ổn định.

**Nghiệm thu:** Test đủ happy/error paths, không tiết lộ lỗi nội bộ ra HTTP response.

### PHASE 2 — Trải nghiệm feed mượt và tin cậy (P0)

#### Task 2.1. Đồng bộ nguồn dữ liệu và trạng thái

- [ ] Chỉ một nguồn sự thật cho `items`, `nextCursor`, `hasMore`, `loading`, `error`.
- [ ] Không thêm phần tử trùng ID vào feed; không đánh mất saved state khi filter.
- [ ] Khi đổi filter giữa lúc request chạy, hủy bằng `AbortController` hoặc loại bỏ response cũ bằng request generation token.
- [ ] Ngăn 2 request cùng cursor chạy trùng khi vuốt nhanh.
- [ ] Không dùng `window` ở code được chạy SSR không có guard.
- [ ] Retry có chủ đích, không vòng lặp request vô hạn.

**Nghiệm thu:** Đổi filter liên tục, mạng chậm, offline/online, vuốt cực nhanh không gây lỗi giao diện hoặc stale result.

#### Task 2.2. Loading / empty / failure / end-of-feed

- [ ] Lần đầu có skeleton hoặc trạng thái chờ mềm mại, không giật bố cục.
- [ ] Lỗi API có nút **Thử lại** hoạt động thật.
- [ ] Phân biệt: chưa có bài; không có bài theo bộ lọc; đang tải; tải thất bại; hết bài.
- [ ] Khi 1 request trả 0 bài nhưng còn cursor thì không treo vô hạn hoặc kết luận hết quá sớm.
- [ ] Trạng thái có accessibility: aria-live phù hợp; nút tab/focus rõ ràng.

**Nghiệm thu:** Mỗi trạng thái tái hiện được và hiển thị thông điệp chính xác.

#### Task 2.3. Đo/giữ hiệu năng vuốt

- [ ] Giữ 2–3 thẻ trong DOM, không render vô hạn.
- [ ] Hạn chế cập nhật layout/React-like reactivity trên mỗi frame; không thêm phép đọc layout tốn kém liên tục.
- [ ] Rà soát listener pointer/touch và cleanup.
- [ ] Duy trì hỗ trợ keyboard, touch, reduced motion, resize và safe areas trên mobile.
- [ ] Đo trải nghiệm trên máy yếu và mạng chậm; xác định bottleneck trước tối ưu.

**Nghiệm thu:** Vuốt liền mạch, không mắc kẹt hoặc tự chuyển nhầm thẻ, modal và lưu bài vẫn hoạt động.

### PHASE 3 — Hệ thống nội dung & CMS tối thiểu (P1)

#### Task 3.1. Thiết kế luồng dữ liệu và tác quyền

- [ ] Chốt quy trình draft → review → publish → archive.
- [ ] Quy chuẩn slug, tiêu đề, mô tả, `kind`, theme, topics/moods, source, article Markdown.
- [ ] Bổ sung metadata cần thiết bằng migration mới, tránh tạo trường vô ích.
- [ ] Thiết kế quy tắc chống nội dung trùng: normalized hash hỗ trợ trùng chính xác; kiểm tra tương đồng nội dung là tính năng riêng.

#### Task 3.2. API quản trị an toàn

- [ ] Chỉ quản trị viên xác thực mới được ghi, sửa, đăng, lưu trữ.
- [ ] Xác thực session/token server-side, bảo vệ CSRF nếu dùng cookie, authorization trên từng route.
- [ ] Validate đầu vào bằng schema, chống XSS khi render Markdown, chống SQL injection bằng query binding.
- [ ] Quyền mặc định tối thiểu, log hành động quan trọng.

#### Task 3.3. Giao diện CMS thiết yếu

- [ ] Danh sách bài + lọc/tìm kiếm/phân trang.
- [ ] Thêm/sửa bài, xem trước, lưu nháp, xuất bản/hủy xuất bản.
- [ ] Quản lý topic/mood cơ bản; URL nguồn và tín nhiệm nội dung.
- [ ] Upload media lên R2 **chỉ khi thật sự có nhu cầu ảnh**.

**Nghiệm thu PHASE 3:** Có thể nhập, sửa, xuất bản một bài trên local bằng giao diện admin và bài xuất hiện đúng trong feed; người không có quyền không thao tác được.

### PHASE 4 — Quy mô hàng chục nghìn nội dung (P1)

- [ ] Sinh bộ dữ liệu benchmark có 10k/50k bản ghi trên local/test, không đụng production.
- [ ] Đo latency API p50/p95, số D1 reads/query, tốc độ trả trang đầu, tỷ lệ cache hit nếu có.
- [ ] Xem `EXPLAIN QUERY PLAN`; tối ưu index theo lọc và sort thực tế.
- [ ] Nếu ranking yêu cầu nhiều ứng viên, xây chiến lược pool giới hạn và xoay vòng theo seed/segment; không quét toàn DB mỗi request.
- [ ] Cache an toàn theo truy vấn công khai; không cache lẫn dữ liệu theo người dùng nếu chưa có cache key đúng.
- [ ] Thiết kế tìm kiếm riêng khi thực sự cần (FTS5 hoặc giải pháp phù hợp sau đánh giá).
- [ ] Có kế hoạch backup/restore, rollback migrations, thao tác production theo checklist.

**Nghiệm thu:** Có số đo trước/sau, không tuyên bố “chịu tải tốt” nếu chưa benchmark.

### PHASE 5 — Cá nhân hóa và tính năng người dùng (P2, sau khi feed ổn định)

- [ ] Giai đoạn đầu vẫn dùng session/anonymous preference: chủ đề, mood, seenIds.
- [ ] Thiết kế dữ liệu đã xem/đã lưu tối thiểu; giải thích riêng tư rõ ràng.
- [ ] Khi thật sự cần đồng bộ đa thiết bị mới triển khai đăng nhập và tài khoản.
- [ ] Tránh suy luận trạng thái tâm lý nhạy cảm từ vài lần vuốt; ưu tiên quyền tự chọn/chỉnh sở thích.
- [ ] Kiểm thử đánh giá diversity, cold start, recency, không tạo vòng lặp một loại nội dung.

### PHASE 6 — Sẵn sàng triển khai production (P1 trước khi public)

- [ ] Tách rõ dev/local/staging/production; kiểm tra `wrangler` env binding.
- [ ] Kiểm thử build Cloudflare thật, API runtime, D1 binding và các route ở staging.
- [ ] Quy trình migrate remote riêng, đã kiểm tra backup/rollback và được phê duyệt.
- [ ] Đặt domain, HTTPS, robots/sitemap/canonical/OG nếu cần SEO; bảo vệ admin.
- [ ] Error monitoring, tối ưu web vitals, accessibility, chính sách nội dung và quyền riêng tư.
- [ ] Smoke test sau deploy, hướng dẫn rollback.

## 8. THỨ TỰ TASK CỤ THỂ SAU KHI MỞ CURSOR

| STT | Mã | Nhiệm vụ | Ưu tiên | Chỉ bắt đầu khi |
|---:|---|---|---|---|
| 01 | P0-AUDIT | Audit source và baseline | P0 | Ngay khi mở Cursor |
| 02 | P0-FEED | Xác nhận/sửa tích hợp API và trạng thái tải | P0 | Audit xong |
| 03 | P0-CURSOR | Kiểm tra cursor 19.1 và test phân trang | P0 | API chạy đúng |
| 04 | P0-INDEX | Migration index 0002 + EXPLAIN | P0 | Cursor đã chốt |
| 05 | P0-FILTER | Bộ lọc topic/mood trong D1 | P0 | Index/contract ổn định |
| 06 | P0-RANK | Gợi ý backend v1, có tính đa dạng | P0 | Filter có integration test |
| 07 | P0-RACE | Request dedupe, cancel, retry, error states | P0 | API đáp ứng contract |
| 08 | P0-TEST | Integration test/API + kiểm thử trải nghiệm | P0 | Các task ở trên ổn |
| 09 | P1-CMS | CMS tối thiểu + quyền admin | P1 | Feed baseline ổn định |
| 10 | P1-PERF | Benchmark 10k–50k + chỉ số | P1 | Query thực tế ổn định |
| 11 | P1-DEPLOY | Staging, backup, deploy production | P1 | Test và bảo mật đạt |
| 12 | P2-PROFILE | Lưu bài, cá nhân hóa dài hạn, tài khoản | P2 | Có nhu cầu và consent |

**Không chạy đồng loạt danh sách 12 mục.** Làm mục 01 và gửi kết quả, rồi mới bắt đầu 02.

## 9. TIÊU CHÍ CHẤT LƯỢNG / DEFINITION OF DONE

Task chỉ được đánh dấu DONE khi:

- [ ] Đạt đúng hành vi/tính năng mục tiêu, tái hiện được bằng bước kiểm tra cụ thể.
- [ ] Chỉ sửa các file cần thiết, không thêm thư viện/thư mục không có lý do.
- [ ] `npm test` đạt và test mới đủ cho logic mới.
- [ ] `npx astro check` không có error; không bỏ qua runtime module error bị lọt qua type check.
- [ ] `npm run build` đạt.
- [ ] API (nếu có thay đổi) được kiểm tra trực tiếp bằng HTTP với D1 Local.
- [ ] Chức năng vuốt, modal, lưu, lọc, tải tiếp không bị regression.
- [ ] Không thay đổi remote DB/deploy nếu chưa được yêu cầu.
- [ ] Có mô tả files changed, test results, known limitations, next task.

## 10. KIỂM THỬ CỤ THỂ CHO FEED/D1

Tối thiểu cần các trường hợp:

1. Database rỗng: `items=[]`, `nextCursor=null`.
2. Ít hơn limit / bằng limit / lớn hơn limit.
3. Nhiều bản ghi có cùng `created_at`.
4. ID chuỗi `1,2,10,11`, UUID; thứ tự cố định theo tie-breaker.
5. Nội dung `draft`, `archived` không xuất hiện.
6. Có nhiều topic/mood không nhân bản một bài.
7. Filter all, topic có bài, mood có bài, cặp filter không có bài.
8. Limit 0, âm, 21, chữ, NaN, số thực.
9. Cursor sai version, URL encoding lỗi, quá dài, không tương ứng filter.
10. 100+ bản ghi duyệt nhiều trang, không thiếu hoặc trùng ID khi dữ liệu không đổi.
11. Đang tải thì đổi chủ đề 3 lần; response cũ về sau không ghi đè trạng thái mới.
12. Request timeout, HTTP 500, offline, retry, end-of-feed.
13. Người dùng vuốt liên tục trong khi prefetch, không phát sinh hai request cùng cursor.
14. Đọc bài dài, đóng modal, lưu bài rồi đổi filter vẫn đúng.

## 11. HƯỚNG DẪN CHẠY LỆNH TRÊN WINDOWS

Chạy trong PowerShell tại thư mục dự án:

```powershell
Set-Location D:\BinhYen
npm test
npx astro check
npm run build
```

Kiểm tra cấu hình/version:

```powershell
npm ls astro @astrojs/cloudflare svelte vitest --depth=0
npx wrangler --version
Get-ChildItem -Name wrangler.jsonc,wrangler.json,wrangler.toml -ErrorAction SilentlyContinue
```

Kiểm tra D1 **chỉ local**:

```powershell
npx wrangler d1 migrations list binhyen-db --local
npx wrangler d1 execute binhyen-db --local --command "SELECT COUNT(*) AS total FROM contents;"
```

**Không tự chạy** `wrangler d1 migrations apply ... --remote`, `DELETE`, `DROP TABLE`, hoặc thay đổi production.

## 12. MẪU BÁO CÁO SAU MỖI TASK

```text
TASK: [mã + tên]
TRẠNG THÁI: DONE / BLOCKED / PARTIAL
VẤN ĐỀ GỐC: ...
ĐÃ SỬA: [đường dẫn file + mô tả ngắn]
KIỂM THỬ:
- npm test: PASS/FAIL/CHƯA CHẠY
- astro check: PASS/FAIL/CHƯA CHẠY
- build: PASS/FAIL/CHƯA CHẠY
- HTTP/D1 local: PASS/FAIL/KHÔNG ÁP DỤNG
- regression UI: PASS/FAIL/CHƯA CHẠY
RỦI RO/CÒN LẠI: ...
BƯỚC TIẾP THEO ĐỀ XUẤT: ...
```

## 13. PROMPT GIAO VIỆC DÙNG LẠI

```text
Hãy đọc docs/MASTER_PLAN.md và source hiện tại trước khi làm.
Nhiệm vụ duy nhất lần này: [MÃ TASK / MÔ TẢ].

Yêu cầu:
- Xác định nguyên nhân gốc, không đoán và không sửa lan sang tính năng khác.
- Giữ nguyên cơ chế vuốt mượt, trạng thái lưu, frontend hiện có và API contract trừ khi task yêu cầu.
- Không tạo file/thư viện thừa; dùng stack Astro + Svelte 5 + TypeScript + Vanilla CSS + Cloudflare D1.
- Chỉ thao tác D1 Local; không deploy hoặc đụng database remote.
- Trước khi sửa: nêu ngắn file dự kiến và cách kiểm chứng.
- Sau khi sửa: chạy test, astro check, build; kiểm tra HTTP/D1 hoặc UI nếu liên quan.
- Nếu vướng thông tin thiếu hoặc thao tác có nguy cơ mất dữ liệu, dừng và hỏi.
- Báo cáo theo mẫu ở mục 12. Giữ câu trả lời ngắn, tập trung kết quả.
```

## 14. PROMPT KHỞI ĐỘNG CURSOR (DÁN NGUYÊN VĂN)

```text
Tôi đang chuyển giao dự án Bình Yên cho Cursor AI.
Hãy đọc toàn bộ file docs/MASTER_PLAN.md trước, sau đó khảo sát code thực tế trong repository.

LƯU Ý: Tài liệu ghi lại những gì đã làm trong cuộc trao đổi trước, chưa phải trạng thái source được xác minh. Bạn phải xác nhận trên file thực tế, đặc biệt Step 18/19.1.

NHIỆM VỤ DUY NHẤT LÚC NÀY: Thực hiện PHASE 0 — Audit & baseline; TUYỆT ĐỐI CHƯA SỬA CODE.

Hãy:
1. Xác minh cấu trúc thư mục, dependency versions, Astro/Cloudflare config, Wrangler/D1 binding.
2. Đọc luồng frontend SwipeDeck -> api-feed-source -> /api/feed -> D1; kiểm tra vấn đề loading ban đầu, đổi filter, prefetch và cursor.
3. Kiểm tra migration và seed local ở mức read-only.
4. Chạy npm test, npx astro check, npm run build.
5. Nếu có dev server đang chạy, kiểm tra API local mà không tự chạy server trùng cổng.
6. Xuất báo cáo ngắn: ĐÃ CÓ / CHƯA CÓ / CÓ LỖI / RỦI RO, kèm đường dẫn file liên quan.
7. Đề xuất DUY NHẤT 1 task tiếp theo theo mức độ ưu tiên cao nhất. Chờ tôi đồng ý rồi mới chỉnh sửa.

Quy tắc: không tự cài package; không chạy migration remote; không xóa/ghi đè dữ liệu; không thay cấu trúc UI; không tạo thư mục mới khi chưa cần; làm đúng ít bước, code có kiểm thử, tiết kiệm token.
```

## 15. GHI CHÚ KỸ THUẬT QUAN TRỌNG CẦN KIỂM TRA NGAY

- **Bước 18:** Nếu `createApiFeedSource().firstPage()` trả `{items:[], nextCursor:'__first__'}`, cần xác minh `SwipeDeck` có thật sự gọi `loadPage()` lúc mount và khi reset filter. Không nên dựa vào một đoạn PowerShell replace chưa chắc khớp source.
- **Bước 18:** `recommendContents()` trên từng trang 3 bài không phải cá nhân hóa trên toàn bộ kho; nên chuyển lọc/chọn ứng viên lên backend.
- **Bước 18:** `AbortSignal.timeout()` có tương thích browser mục tiêu và code chạy client-only hay không; có xử lý fallback khi cần.
- **Bước 18:** API ở Bước 17 có thể chưa trả `article` và `source` dù `ContentItem` hỗ trợ; phải kiểm tra trải nghiệm “Đọc đầy đủ” khi chuyển từ demo sang API.
- **Bước 19.1:** `created_at` được sinh bằng `unixepoch()` nên nhiều bài có thể cùng một giây; cần tie-breaker theo ID và integration test.
- **Bước 19.1:** API sử dụng index cũ `(status,published_at,id)` trong khi sort mới theo `created_at`; phải tạo migration index mới, không sửa migration cũ.
- **Bước 19.1:** `created_at` không nhất thiết là `published_at`: Cursor cần hỏi/đề xuất rõ thứ tự feed mong muốn (mới tạo hay mới xuất bản) trước khi tối ưu sâu.
- **PowerShell:** Kiểm thử API với string `"$base?limit=3"` có thể khiến PowerShell hiểu `$base?limit` thành tên biến khác. Dùng `"${base}?limit=3"` hoặc `"$($base)?limit=3"` để chắc chắn. Cần kiểm tra thật lệnh test, không chỉ suy đoán.
- **Không nhầm thành công build với hoạt động runtime:** Trước đây từng có cảnh báo `Cannot find module 'cloudflare:workers'` trong quá trình chạy công cụ nhưng API D1 sau đó được người dùng xác nhận chạy; nếu lặp lại, kiểm tra runtime context trước khi sửa import.

---

**Đích đến:** Một nền tảng Bình Yên nhẹ, nhanh, mượt và đáng tin cậy. Tiến độ quan trọng nhưng **không đánh đổi tính đúng đắn dữ liệu, khả năng bảo trì và trải nghiệm người dùng**.
