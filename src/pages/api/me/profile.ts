import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { currentUser } from "../../../features/account/account";
import { createD1AccountStore } from "../../../features/account/d1-account-store";
import { createD1ProfileStore } from "../../../features/account/d1-profile-store";
import { parseProfileUpdate } from "../../../features/account/profile";
import {
  checkWriteLimit,
  interactionJson,
  readJsonBody
} from "../../../features/interactions/interaction-http";

export const prerender = false;

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

/** GET /api/me/profile — ten hien thi va danh sach chu de da chon. */
export const GET: APIRoute = async ({ request }) => {
  try {
    const user = await signedInUser(request);
    if (!user) return unauthorized();

    const profile = await createD1ProfileStore(env.DB).read(user.id);
    if (!profile) return unauthorized();

    return interactionJson({ success: true, profile });
  } catch (error) {
    console.error("Profile read error:", error);
    return interactionJson(
      { success: false, error: "Unable to load profile" },
      500
    );
  }
};

/** PUT /api/me/profile  { displayName, topics: string[] } */
export const PUT: APIRoute = async ({ request }) => {
  const limited = await checkWriteLimit(env.INTERACTION_LIMITER, request);
  if (limited) return limited;

  const update = parseProfileUpdate(await readJsonBody(request));
  if (!update) {
    return interactionJson({ success: false, error: "Invalid request" }, 400);
  }

  try {
    const user = await signedInUser(request);
    if (!user) return unauthorized();

    const store = createD1ProfileStore(env.DB);
    await store.save(user.id, update, now());
    const profile = await store.read(user.id);

    return interactionJson({
      success: true,
      user: { ...user, displayName: update.displayName },
      profile
    });
  } catch (error) {
    console.error("Profile save error:", error);
    return interactionJson(
      { success: false, error: "Unable to save profile" },
      500
    );
  }
};
