/**
 * Gan than bai dai cho hang loat contents da co (local D1).
 * Mac dinh: 2000 bai published chua co content_details.
 *
 *   node scripts/backfill-article-bodies.mjs
 *   node scripts/backfill-article-bodies.mjs --limit=5000
 *   node scripts/backfill-article-bodies.mjs --all
 *   node scripts/backfill-article-bodies.mjs --cleanup
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";

if (process.argv.includes("--remote")) {
  console.error("Tu choi: chi ghi vao D1 local.");
  process.exit(1);
}

const { DatabaseSync } = await import("node:sqlite");

const MARK = "<!-- by-article-backfill -->";
const args = process.argv.slice(2);
const all = args.includes("--all");
const cleanup = args.includes("--cleanup");
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = all
  ? Number.POSITIVE_INFINITY
  : Number(limitArg?.slice("--limit=".length) ?? 2000);

const BODIES = [
  (title) => `Có những ngày, câu chữ ngắn trên thẻ chỉ là cánh cửa. Phía sau là một khoảng dài hơn để bạn ngồi lại với chính mình.

## ${title}

Khi bạn vuốt sang để đọc thêm, bạn đang cho phép bản thân chậm lại một nhịp. Không phải mọi thứ đều cần kết luận ngay. Một đoạn văn cũng có thể chỉ là chỗ trú chân giữa ngày dài.

> Bình yên không phải là không còn việc. Bình yên là biết mình vẫn còn chỗ để thở.

Hãy thử đọc chậm. Nếu một câu chạm tới bạn, hãy dừng lại. Không cần đọc hết mới được “tính là đã đọc”. Cảm xúc đến đúng lúc cũng đủ quý.

### Một thực hành nhỏ

Đặt điện thoại úp xuống trong hai phút sau khi đọc xong. Nhìn ra ngoài cửa sổ. Hỏi lòng: hôm nay mình cần gì nhất — làm thêm, hay được nghỉ?

Thế giới vẫn chạy. Bạn không bắt buộc phải chạy theo cùng tốc độ mọi lúc.

Bạn vẫn đang ở đây. Và điều đó đã là một khởi đầu dịu dàng.`,

  (title) => `Người ta hay nghĩ nội dung ngắn thì nông. Nhưng đôi khi câu ngắn chỉ là phần nổi — phần chìm là câu chuyện bạn tự nối vào bằng ký ức của mình.

## Về: ${title}

Hãy tưởng tượng bạn đang ngồi đối diện một người bạn cũ. Họ không vội khuyên nhủ. Họ kể một câu chuyện dài hơn một chút, đủ để bạn nhận ra mình không cô đơn trong cảm giác ấy.

> Được lắng nghe đôi khi quan trọng hơn được giải đáp.

Có những vết mệt không hiện trên mặt. Có những niềm vui rất nhỏ nhưng đủ sưởi ấm cả buổi tối. Bài viết này không nhằm sửa bạn. Nó chỉ muốn ngồi cạnh bạn một lát.

### Nếu lòng đang rối

Viết ra ba dòng — không cần hay. Một dòng về việc đã xong. Một dòng về việc còn dang dở. Một dòng về điều bạn biết ơn dù nhỏ.

Rồi gấp trang đó lại. Ngày mai mở ra cũng được. Không mở cũng được.

Bạn không phải hoàn hảo để đáng được nhẹ nhõm.`,

  (title) => `Ánh sáng, gió, tiếng bước chân — thiên nhiên không bao giờ gửi thông báo. Nó chỉ hiện diện. Có lẽ chúng ta cũng học được điều gì đó từ sự hiện diện ấy.

## ${title}

Khi bạn đọc những dòng này, hãy để mắt nghỉ giữa các đoạn. Khoa học nói rằng nghỉ ngắn giúp trí nhớ giữ lại tốt hơn. Nhưng hơn thế: nghỉ ngắn giúp bạn cảm thấy mình vẫn là người, không phải máy.

> Ngay cả ánh sáng cũng mất vài phút để tới. Bạn cũng được phép đến chậm.

### Một góc nhìn

Không phải mọi tiến bộ đều ồn ào. Có những thay đổi chỉ là bạn phản ứng dịu hơn một chút với chính mình. Hôm qua bạn tự trách. Hôm nay bạn hỏi: “Mình đang cần gì?”

Đó đã là một bước.

Hãy mang theo câu hỏi ấy vào phần còn lại của ngày — nhẹ như mang theo một chiếc lá trong túi áo.`,

  (title) => `Mưa làm phố chậm lại. Chữ dài trên trang cũng vậy — nó kéo bạn ra khỏi dòng lướt vội, đưa bạn vào một nhịp khác.

## ${title}

Bạn không cần đồng ý với mọi câu. Hãy giữ những gì vừa khít với lòng hôm nay, và để phần còn lại ở lại trang — như để ô ở lại khi mưa tạnh.

> Đôi khi chữa lành không đến từ lời khuyên. Nó đến từ việc được ngồi yên với một đoạn văn.

### Nghi thức đọc

Đọc to một câu bạn thích. Nghe giọng mình. Cảm giác hơi lạ cũng được — đó là cách cơ thể nhớ rằng bạn đang có mặt.

Nếu mệt, gấp lại giữa chừng. Bài viết không giận. Nó sẽ chờ.

Cảm ơn bạn đã dành vài phút. Phút ấy thuộc về bạn.`
];

const db = openLiveDatabase();

try {
  db.exec("PRAGMA busy_timeout = 8000");
  db.exec("PRAGMA foreign_keys = ON");

  if (cleanup) {
    const info = db
      .prepare(
        `DELETE FROM content_details
         WHERE body_markdown LIKE ?1`
      )
      .run(`%${MARK}%`);
    console.log(
      JSON.stringify({
        removed: true,
        deleted: Number(info.changes ?? 0)
      })
    );
  } else {
    const result = backfill(db, limit);
    console.log(JSON.stringify({ backfilled: true, ...result }));
  }
} finally {
  db.close();
}

function backfill(db, maxRows) {
  const missing = db
    .prepare(
      `SELECT COUNT(*) AS n
       FROM contents c
       WHERE c.status = 'published'
         AND c.published_at IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM content_details d WHERE d.content_id = c.id
         )`
    )
    .get().n;

  const sql =
    maxRows === Number.POSITIVE_INFINITY
      ? `SELECT c.id, c.title
         FROM contents c
         WHERE c.status = 'published'
           AND c.published_at IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM content_details d WHERE d.content_id = c.id
           )
         ORDER BY c.rank_key DESC, c.id ASC`
      : `SELECT c.id, c.title
         FROM contents c
         WHERE c.status = 'published'
           AND c.published_at IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM content_details d WHERE d.content_id = c.id
           )
         ORDER BY c.rank_key DESC, c.id ASC
         LIMIT ?1`;

  const rows =
    maxRows === Number.POSITIVE_INFINITY
      ? db.prepare(sql).all()
      : db.prepare(sql).all(maxRows);

  const insert = db.prepare(
    `INSERT INTO content_details (content_id, body_markdown, reading_minutes)
     VALUES (?1, ?2, ?3)`
  );

  db.exec("BEGIN");
  try {
    let n = 0;
    for (const row of rows) {
      const template = BODIES[n % BODIES.length];
      const body = `${template(row.title).trim()}\n\n${MARK}`;
      const minutes = Math.max(1, Math.min(8, Math.ceil(body.length / 900)));
      insert.run(row.id, body, minutes);
      n += 1;
    }
    db.exec("COMMIT");
    return {
      updated: n,
      stillMissing: Math.max(0, missing - n),
      missingBefore: missing,
      limit: maxRows === Number.POSITIVE_INFINITY ? "all" : maxRows
    };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function openLiveDatabase() {
  const directory = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
  const files = readdirSync(directory).filter((name) =>
    name.endsWith(".sqlite")
  );
  let chosen = null;
  let chosenCount = -1;

  for (const file of files) {
    const candidate = new DatabaseSync(join(directory, file));
    const table = candidate
      .prepare(
        `SELECT COUNT(*) AS n FROM sqlite_master
         WHERE type = 'table' AND name = 'contents'`
      )
      .get();

    if (table.n !== 1) {
      candidate.close();
      continue;
    }

    const size = candidate
      .prepare(`SELECT COUNT(*) AS n FROM contents`)
      .get();

    if (size.n > chosenCount) {
      chosen?.close();
      chosen = candidate;
      chosenCount = size.n;
    } else {
      candidate.close();
    }
  }

  if (!chosen) throw new Error("Khong tim thay bang contents.");
  return chosen;
}
