import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { currentUser } from "../../../../features/account/account";
import { createD1AccountStore } from "../../../../features/account/d1-account-store";
import {
  AdminContentError,
  getAdminContent,
  updateAdminContent
} from "../../../../features/admin/d1-admin-content";
import {
  checkWriteLimit,
  interactionJson,
  readJsonBody,
  validContentId
} from "../../../../features/interactions/interaction-http";
import { createD1MyPostStore } from "../../../../features/posts/d1-my-posts";
import { parsePostDraft } from "../../../../features/posts/post-draft";

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
const notFound = () =>
  interactionJson({ success: false, error: "Không tìm thấy bài." }, 404);
const locked = () =>
  interactionJson(
    { success: false, error: "Bài đã được duyệt nên không đổi được nữa." },
    409
  );

/** GET /api/me/posts/:id — ban nhap cua chinh minh, du de sua. */
export const GET: APIRoute = async ({ request, params }) => {
  if (!validContentId(params.id)) return notFound();

  try {
    const user = await signedInUser(request);
    if (!user) return unauthorized();

    const status = await createD1MyPostStore(env.DB).statusOf(
      user.id,
      params.id
    );
    if (!status) return notFound();
    if (status !== "draft") return locked();

    const content = await getAdminContent(env.DB, params.id);
    if (!content) return notFound();

    return interactionJson({
      success: true,
      post: {
        id: content.id,
        title: content.title,
        description: content.description,
        body: content.body,
        topics: content.topics
      }
    });
  } catch (error) {
    console.error("My post error:", error);
    return interactionJson({ success: false, error: "Không tải được bài." }, 500);
  }
};

/** PUT /api/me/posts/:id  { title, description?, body?, topics } */
export const PUT: APIRoute = async ({ request, params }) => {
  const limited = await checkWriteLimit(env.INTERACTION_LIMITER, request);
  if (limited) return limited;
  if (!validContentId(params.id)) return notFound();

  const draft = parsePostDraft(await readJsonBody(request, MAX_POST_BODY));
  if (!draft.ok) {
    return interactionJson({ success: false, error: draft.error }, 400);
  }

  try {
    const user = await signedInUser(request);
    if (!user) return unauthorized();

    const status = await createD1MyPostStore(env.DB).statusOf(
      user.id,
      params.id
    );
    if (!status) return notFound();
    if (status !== "draft") return locked();

    const content = await updateAdminContent(
      env.DB,
      params.id,
      draft.value,
      now(),
      user.id
    );
    return interactionJson({
      success: true,
      id: content.id,
      title: content.title
    });
  } catch (error) {
    if (error instanceof AdminContentError && error.statusCode < 500) {
      return interactionJson(
        { success: false, error: error.message },
        error.statusCode
      );
    }

    console.error("Update post error:", error);
    return interactionJson({ success: false, error: "Không lưu được bài." }, 500);
  }
};

/** DELETE /api/me/posts/:id — rut ban nhap chua duyet. */
export const DELETE: APIRoute = async ({ request, params }) => {
  const limited = await checkWriteLimit(env.INTERACTION_LIMITER, request);
  if (limited) return limited;
  if (!validContentId(params.id)) return notFound();

  try {
    const user = await signedInUser(request);
    if (!user) return unauthorized();

    const store = createD1MyPostStore(env.DB);
    if (await store.withdraw(user.id, params.id)) {
      return interactionJson({ success: true });
    }

    return (await store.statusOf(user.id, params.id)) ? locked() : notFound();
  } catch (error) {
    console.error("Withdraw post error:", error);
    return interactionJson({ success: false, error: "Không rút được bài." }, 500);
  }
};
