import { readdirSync } from "node:fs";
import { join } from "node:path";

if (process.argv.includes("--remote")) {
  console.error("Tu choi: chi ghi vao D1 local.");
  process.exit(1);
}

const { DatabaseSync } = await import("node:sqlite");
const db = openLiveDatabase();

/** Bai demo co than dai — de test vuot Doc them. */
const ARTICLES = [
  {
    id: "artdemo0001",
    slug: "khi-ban-can-mot-khoang-lang",
    topic: "peace",
    mood: "calm",
    theme: "peace",
    category: "Chữa lành & bình yên",
    title: "Khi bạn cần một khoảng lặng giữa ngày ồn ào",
    rankKey: 2_000_001,
    body: `Có những buổi chiều, bạn không cần thêm một việc nữa. Bạn chỉ cần một chỗ để ngồi xuống, thở chậm lại, và để mọi thứ trôi qua mà không phải nắm lấy.

## Một lời nhắc nhỏ

Bình yên không phải là cuộc sống không còn sóng gió. Bình yên là khi bạn biết mình vẫn có thể trở về với chính mình, dù bên ngoài đang vội.

> Bạn không phải giải quyết hết mọi thứ hôm nay. Một hơi thở đủ sâu đã là một khởi đầu.

Hãy thử đặt điện thoại xuống trong năm phút. Nhìn ra cửa sổ. Nghe tiếng gió, tiếng xe, tiếng ai đó cười ở xa. Những âm thanh ấy không cần bạn phải phản ứng — chúng chỉ đang xảy ra.

## Khi lòng hơi nặng

Nếu hôm nay bạn thấy mệt, đừng tự trách. Cơ thể và tâm trí cũng cần được nghỉ như một cánh đồng cần mưa. Bạn vẫn đang cố gắng theo cách của mình, dù chẳng ai nhìn thấy.

Khi sẵn sàng, hãy chọn một việc nhỏ nhất: uống nước, mở cửa sổ, hoặc viết một câu trong sổ tay. Không cần hoàn hảo. Chỉ cần dịu dàng với chính mình một chút.

Hết ngày rồi cũng được. Ngày mai vẫn còn đó — và bạn vẫn còn đây.`
  },
  {
    id: "artdemo0002",
    slug: "cau-chuyen-ve-chiec-la",
    topic: "stories",
    mood: "curious",
    theme: "story",
    category: "Câu chuyện ấm áp",
    title: "Chiếc lá không vội vàng khi rơi",
    rankKey: 2_000_002,
    body: `Người ta thường nghĩ chiếc lá rơi vì gió mạnh. Nhưng có những chiếc lá rời cành rất chậm, như thể chúng đang chọn một đường bay riêng.

## Buổi sáng trong công viên

Một người đàn ông ngồi trên ghế đá, cầm cuốn sách cũ. Ông không đọc nhiều. Thỉnh thoảng ông ngẩng lên nhìn tán cây, rồi lại cúi xuống trang giấy. Bên cạnh là một đứa trẻ đang nhặt lá vàng xếp thành một đường thẳng trên mặt đất.

Đứa trẻ hỏi:

> Bố ơi, lá có biết mình đang rơi không?

Người đàn ông nghĩ một lúc rồi cười. Ông nói rằng có lẽ lá không cần biết. Nó chỉ cần tin vào khoảng không phía dưới — rằng mặt đất sẽ đón nó, dù không êm ái như trên cành.

## Điều chúng ta quên

Chúng ta hay vội kết thúc mọi thứ: một cuộc nói chuyện, một dự định, một cảm xúc. Trong khi một chiếc lá có thể mất cả buổi chiều chỉ để chạm đất.

Có lẽ sống chậm không phải là lười biếng. Đó là cách để nhìn rõ hơn những gì đang đi ngang qua đời mình — trước khi chúng trở thành kỷ niệm.

Khi bạn về nhà hôm nay, thử để một việc chưa xong… chưa xong. Để nó nằm đó. Thế giới sẽ không sụp đổ. Và bạn có thể ngủ ngon hơn một chút.`
  },
  {
    id: "artdemo0003",
    slug: "anh-sang-mat-troi-va-chung-ta",
    topic: "science",
    mood: "curious",
    theme: "discovery",
    category: "Kiến thức kỳ thú",
    title: "Ánh sáng mặt trời đến muộn — và điều đó an ủi",
    rankKey: 2_000_003,
    body: `Ánh sáng từ Mặt Trời mất khoảng tám phút hai mươi giây để đến Trái Đất. Nghĩa là khi bạn nhìn lên bầu trời ban ngày, bạn đang nhìn thấy một phiên bản hơi quá khứ của ngôi sao ấy.

## Khoa học của sự chậm trễ

Ánh sáng đi rất nhanh — gần ba trăm nghìn kilomet mỗi giây — nhưng khoảng cách vẫn đủ lớn để tạo ra một khoảng trễ nhỏ. Khoảng trễ ấy không làm thế giới kém thật hơn. Nó chỉ nhắc ta rằng mọi thứ ta nhìn thấy đều đã đi một đoạn đường riêng.

> Ngay cả ánh sáng cũng cần thời gian để đến nơi. Bạn cũng vậy.

## Một ẩn dụ dịu dàng

Có những tin vui đến muộn. Có những hiểu biết chỉ hiện ra sau vài năm. Có những người chỉ trở thành “đúng người” khi bạn đã đủ chín để nhận ra.

Đừng vội kết luận rằng mình đang chậm. Có thể bạn đang đi đúng tốc độ của một hành trình dài hơn bạn nghĩ.

Lần tới khi nắng chiếu vào bàn tay, hãy nhớ: ánh sáng ấy đã khởi hành trước khi bạn kịp mở mắt. Và nó vẫn tìm được đường tới bạn.`
  },
  {
    id: "artdemo0004",
    slug: "di-dao-trong-mua",
    topic: "nature",
    mood: "calm",
    theme: "nature",
    category: "Thiên nhiên kỳ thú",
    title: "Đi dạo trong mưa — không cần chỗ đến",
    rankKey: 2_000_004,
    body: `Mưa không hỏi bạn đã sẵn sàng chưa. Nó chỉ đến, phủ lên đường phố một lớp bóng nước, và biến mọi âm thanh thành dịu hơn một nốt.

## Vì sao mưa làm lòng nhẹ

Khi trời mưa, nhịp phố chậm lại. Xe cộ dè dặt hơn. Người ta trú dưới mái hiên, chia sẻ một khoảng im lặng ngắn. Trong khoảnh khắc ấy, bạn không phải là trung tâm của mọi việc — bạn chỉ là một người đang đứng dưới trời.

Hãy thử bước chậm trên vỉa hè ướt. Nghe tiếng lốp xe lướt qua vũng nước. Ngửi mùi đất vừa được tưới. Thiên nhiên không cần bạn hiểu hết; nó chỉ cần bạn có mặt.

## Một nghi thức nhỏ

Nếu được, hãy để mưa rơi lên vai vài giây trước khi mở ô. Không phải để chịu khổ — mà để nhớ rằng cơ thể bạn vẫn thuộc về thế giới vật lý này: lạnh, ướt, sống động.

> Đôi khi chữa lành không đến từ lời khuyên. Nó đến từ việc được trời đất chạm vào.

Rồi bạn về nhà, thay quần áo khô, pha một tách trà. Thế là đủ cho một chiều mưa.`
  },
  {
    id: "artdemo0005",
    slug: "tam-ly-cua-su-du-thua",
    topic: "psychology",
    mood: "stressed",
    theme: "psychology",
    category: "Tâm lý nhẹ nhàng",
    title: "Bạn không phải hữu ích mọi lúc mới đáng được yêu",
    rankKey: 2_000_005,
    body: `Nhiều người mang trong mình một niềm tin thầm lặng: nếu mình không làm được việc, không giúp được ai, không “ổn” — thì mình sẽ trở nên thừa.

## Gốc rễ của cảm giác ấy

Tâm lý học nói nhiều về nhu cầu được thuộc về. Khi còn nhỏ, một số chúng ta học được rằng tình thương đi kèm với thành tích: điểm tốt, lời khen, sự ngoan ngoãn. Dần dà, giá trị bản thân bị buộc vào năng suất.

> Được yêu không phải phần thưởng sau khi bạn hoàn thành danh sách việc. Đó là điều kiện nền để bạn sống.

## Thực hành nhẹ

Hôm nay, hãy thử một câu với chính mình: “Mình vẫn ổn dù hôm nay chẳng làm được gì đặc biệt.” Nói to hoặc viết ra. Cảm giác khó chịu lúc đầu là bình thường — đó là thói quen cũ đang phản ứng.

Bạn có thể đóng laptop sớm hơn mười phút. Bạn có thể từ chối một lời nhờ vả nhỏ mà không cần giải thích dài. Ranh giới không làm bạn ích kỷ; nó giữ cho lòng còn chỗ cho chính mình.

Nếu bạn đang mệt vì phải “đáng” mọi lúc — hãy nhớ: sự hiện diện của bạn đã là một món quà, trước khi bạn kịp chứng minh bất cứ điều gì.`
  }
];

try {
  db.exec("PRAGMA busy_timeout = 8000");
  db.exec("PRAGMA foreign_keys = ON");

  if (process.argv.includes("--cleanup")) {
    cleanup(db);
    console.log(JSON.stringify({ removed: true, ids: ARTICLES.map((a) => a.id) }));
  } else {
    seed(db);
    console.log(
      JSON.stringify({
        seeded: true,
        count: ARTICLES.length,
        ids: ARTICLES.map((a) => a.id),
        hint: "Vuot trai tren the co nut Doc them de test bai dai."
      })
    );
  }
} finally {
  db.close();
}

function seed(db) {
  const now = Math.floor(Date.now() / 1000);
  db.exec("BEGIN");

  try {
    cleanup(db);

    const insertContent = db.prepare(
      `INSERT INTO contents (
         id, slug, format, kind, status, category, title, description, tag,
         theme, source_label, created_at, updated_at, published_at, rank_key
       ) VALUES (
         ?1, ?2, 'text', 'story', 'published',
         ?3, ?4, '', '',
         ?5, 'Bình Yên',
         ?6, ?6, ?6, ?7
       )`
    );

    const insertTopic = db.prepare(
      `INSERT INTO content_topics (content_id, topic_slug) VALUES (?1, ?2)`
    );
    const insertMood = db.prepare(
      `INSERT INTO content_moods (content_id, mood_slug) VALUES (?1, ?2)`
    );
    const insertDetail = db.prepare(
      `INSERT INTO content_details (content_id, body_markdown, reading_minutes)
       VALUES (?1, ?2, ?3)`
    );

    for (const article of ARTICLES) {
      insertContent.run(
        article.id,
        article.slug,
        article.category,
        article.title,
        article.theme,
        now,
        article.rankKey
      );
      insertTopic.run(article.id, article.topic);
      insertMood.run(article.id, article.mood);
      insertDetail.run(
        article.id,
        article.body.trim(),
        Math.max(1, Math.ceil(article.body.trim().length / 900))
      );
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function cleanup(db) {
  for (const article of ARTICLES) {
    db.prepare(`DELETE FROM content_details WHERE content_id = ?1`).run(
      article.id
    );
    db.prepare(`DELETE FROM content_topics WHERE content_id = ?1`).run(
      article.id
    );
    db.prepare(`DELETE FROM content_moods WHERE content_id = ?1`).run(
      article.id
    );
    db.prepare(
      `DELETE FROM collection_contents WHERE content_id = ?1`
    ).run(article.id);
    db.prepare(`DELETE FROM contents WHERE id = ?1`).run(article.id);
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
