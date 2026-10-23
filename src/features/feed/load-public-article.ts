import { isContentTheme } from "../content/content.types";
import type { ContentTheme } from "../content/content.types";

export interface PublicArticle {
  id: string;
  category: string;
  title: string;
  description: string;
  theme: ContentTheme;
  body: string;
}

interface ArticleRow {
  id: string;
  category: string;
  title: string;
  description: string;
  theme: string;
  body_markdown: string | null;
}

/**
 * Một bài đã xuất bản. Không kéo bảng nội dung về Worker.
 */
export async function loadPublicArticle(
  db: D1Database,
  id: string
): Promise<PublicArticle | null> {
  const row = await db
    .prepare(
      `SELECT
         c.id,
         c.category,
         c.title,
         c.description,
         c.theme,
         d.body_markdown
       FROM contents c
       LEFT JOIN content_details d ON d.content_id = c.id
       WHERE c.id = ?1
         AND c.status = 'published'
       LIMIT 1`
    )
    .bind(id)
    .first<ArticleRow>();

  if (!row) return null;

  return {
    id: row.id,
    category: row.category,
    title: row.title,
    description: row.description,
    theme: isContentTheme(row.theme) ? row.theme : "peace",
    body: row.body_markdown ?? ""
  };
}
