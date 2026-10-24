import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { currentUser } from "../../../features/account/account";
import { createD1AccountStore } from "../../../features/account/d1-account-store";
import {
  AdminContentError,
  createAdminContent
} from "../../../features/admin/d1-admin-content";
import {
  checkWriteLimit,
  interactionJson,
  readJsonBody
} from "../../../features/interactions/interaction-http";
import {
  decodeMyCursor,
  parseMyLimit
} from "../../../features/interactions/my-reactions";
import { createD1MyPostStore } from "../../../features/posts/d1-my-posts";
import type { MyPostItem } from "../../../features/posts/my-posts";
import {
  MAX_OPEN_DRAFTS,
  parsePostDraft
} from "../../../features/posts/post-draft";

export const prerender = false;

const MAX_POST_BODY = 20000;

function now(): number {
  return Math.floor(Date.now() / 1000);
}

function signedInUser(request: Request) {
  return currentUser(
    createD1AccountStore(env.DB),
    request.headers.get("cookie"),
    now()
  );
}

const unauthorized = () =>
  interactionJson({ success: false, error: "Not signed in" }, 401);

/**
 * GET /api/me/posts?cursor=&limit=
 * Bai nguoi dang dang nhap da viet, moi nhat truoc. Trang dau kem tong so
 * va danh dau da xem ket qua duyet.
 */
export const GET: APIRoute = async ({ request, url }) => {
  const rawCursor = url.searchParams.get("cursor");
  const cursor = rawCursor ? decodeMyCursor(rawCursor) : null;

  if (rawCursor && !cursor) {
    return interactionJson({ success: false, error: "Invalid request" }, 400);
  }

  try {
    const user = await signedInUser(request);
    if (!user) return unauthorized();

    const store = createD1MyPostStore(env.DB);
    const limit = parseMyLimit(url.searchParams.get("limit"));
    const [page, total] = await Promise.all([
      store.page(user.id, cursor, limit),
      cursor ? Promise.resolve(null) : store.count(user.id)
    ]);
    // Mo "Da viet" la da xem ket qua duyet; trang sau khong doi moc.
    if (!cursor) await store.markSeen(user.id, now());

    return interactionJson({
      success: true,
      ...page,
      ...(total === null ? {} : { total })
    });
  } catch (error) {
    console.error("My posts error:", error);
    return interactionJson(
      { success: false, error: "Unable to load list" },
      500
    );
  }
};

/**
 * POST /api/me/posts  { title, description?, body?, topics: string[] }
 * Luu thanh ban nhap cua nguoi dang dang nhap; chua tu dang.
 */
export const POST: APIRoute = async ({ request }) => {
  const limited = await checkWriteLimit(env.INTERACTION_LIMITER, request);
  if (limited) return limited;

  const draft = parsePostDraft(await readJsonBody(request, MAX_POST_BODY));
  if (!draft.ok) {
    return interactionJson({ success: false, error: draft.error }, 400);
  }

  try {
    const user = await signedInUser(request);
    if (!user) return unauthorized();

    const store = createD1MyPostStore(env.DB);
    if ((await store.openDrafts(user.id)) >= MAX_OPEN_DRAFTS) {
      return interactionJson(
        {
          success: false,
          error: `Bạn đang có ${MAX_OPEN_DRAFTS} bản nháp. Hãy chờ duyệt bớt rồi viết tiếp.`
        },
        429
      );
    }

    const createdAt = now();
    const content = await createAdminContent(
      env.DB,
      draft.value,
      createdAt,
      user.id
    );
    const post: MyPostItem = {
      id: content.id,
      title: content.title,
      category: content.category,
      description: content.description,
      theme: content.theme,
      status: content.status,
      createdAt,
      fresh: false,
      note: null
    };

    return interactionJson({ success: true, post }, 201);
  } catch (error) {
    if (error instanceof AdminContentError && error.statusCode < 500) {
      return interactionJson(
        { success: false, error: error.message },
        error.statusCode
      );
    }

    console.error("Create post error:", error);
    return interactionJson(
      { success: false, error: "Không lưu được bài." },
      500
    );
  }
};
