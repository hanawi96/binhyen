
-- Binh Yen - Local demo data
-- Chi su dung cho moi truong phat trien.

INSERT OR IGNORE INTO contents
(id, slug, kind, status, category, title, description, tag, theme, published_at)
VALUES
(
  '1',
  'ban-khong-can-ruc-ro-moi-ngay',
  'quote',
  'published',
  'Chữa lành & bình yên',
  'Bạn không cần phải rực rỡ mỗi ngày. Có những hôm, bình yên chỉ là được sống chậm lại một chút.',
  'Một lời nhắc nhỏ: bạn cũng xứng đáng được nghỉ ngơi.',
  'Một chút dịu dàng',
  'peace',
  unixepoch()
),
(
  '2',
  'anh-sang-mat-troi-den-trai-dat',
  'fact',
  'published',
  'Kiến thức kỳ thú',
  'Ánh sáng từ Mặt Trời mất khoảng 8 phút 20 giây để đến Trái Đất.',
  'Ngay cả khi nhìn lên bầu trời, chúng ta cũng đang nhìn thấy một khoảnh khắc trong quá khứ.',
  'Khám phá vũ trụ',
  'discovery',
  unixepoch()
),
(
  '3',
  'khong-phai-ngay-nao-cung-can-thanh-tuu',
  'insight',
  'published',
  'Góc nhìn cuộc sống',
  'Không phải ngày nào cũng cần có thành tựu. Có những ngày chỉ cần sống thật trọn vẹn.',
  'Giá trị của một ngày không chỉ nằm ở số việc bạn hoàn thành.',
  'Một góc nhìn khác',
  'story',
  unixepoch()
),
(
  '4',
  'bach-tuoc-co-ba-trai-tim',
  'fact',
  'published',
  'Thiên nhiên kỳ thú',
  'Bạch tuộc có ba trái tim, và máu của chúng có màu xanh lam.',
  'Thiên nhiên luôn có những điều bất ngờ mà chúng ta chưa khám phá hết.',
  'Thế giới tự nhiên',
  'nature',
  unixepoch()
),
(
  '5',
  'hoc-cach-nhan-dien-cam-xuc',
  'psychology',
  'published',
  'Tâm lý học dễ hiểu',
  'Một cảm xúc khó chịu không nhất thiết là điều bạn cần phải loại bỏ ngay lập tức.',
  'Đôi khi, dành chút thời gian nhận diện cảm xúc cũng là một cách chăm sóc bản thân.',
  'Hiểu mình hơn',
  'psychology',
  unixepoch()
),
(
  '6',
  'mot-loi-cam-on-nho',
  'cute',
  'published',
  'Những điều dễ thương',
  'Đôi khi một lời cảm ơn, một nụ cười nhỏ cũng đủ khiến ngày của ai đó trở nên dễ chịu hơn.',
  'Những điều tử tế thường bắt đầu từ những hành động rất giản dị.',
  'Niềm vui nhỏ',
  'cute',
  unixepoch()
);

-- Noi dung bai viet dai
INSERT OR IGNORE INTO content_details
(content_id, body_markdown, reading_minutes)
VALUES
(
  '5',
  '## Hiểu cảm xúc của mình

Đôi khi chúng ta muốn cảm giác khó chịu biến mất thật nhanh. Nhưng cảm xúc không phải lúc nào cũng cần được giải quyết ngay.

Bạn có thể thử gọi tên cảm xúc mình đang trải qua, quan sát nó và dành cho bản thân một khoảng nghỉ ngắn.',
  1
);

-- Gan chu de
INSERT OR IGNORE INTO content_topics
(content_id, topic_slug)
VALUES
('1', 'peace'),
('2', 'science'),
('3', 'perspective'),
('3', 'peace'),
('4', 'nature'),
('4', 'science'),
('5', 'psychology'),
('5', 'peace'),
('6', 'cute'),
('6', 'stories');

-- Gan tam trang
INSERT OR IGNORE INTO content_moods
(content_id, mood_slug)
VALUES
('1', 'tired'),
('1', 'stressed'),
('1', 'sad'),
('2', 'curious'),
('2', 'happy'),
('2', 'calm'),
('3', 'stressed'),
('3', 'tired'),
('3', 'calm'),
('4', 'curious'),
('4', 'happy'),
('5', 'sad'),
('5', 'stressed'),
('5', 'tired'),
('6', 'happy'),
('6', 'sad'),
('6', 'calm');
