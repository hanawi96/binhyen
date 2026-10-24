export interface AccountUser {
  id: string;
  email: string;
  displayName: string;
}

export type AuthOutcome =
  | { ok: true; user: AccountUser }
  | { ok: false; message: string };

const MESSAGES: Record<number, string> = {
  400: "Hãy kiểm tra lại email và mật khẩu (ít nhất 8 ký tự).",
  401: "Email hoặc mật khẩu chưa đúng.",
  409: "Email này đã có tài khoản. Hãy đăng nhập.",
  429: "Bạn thử hơi nhiều lần. Đợi một phút rồi thử lại nhé."
};
const FALLBACK = "Chưa kết nối được. Hãy thử lại.";

export function readUser(value: unknown): AccountUser | null {
  if (!value || typeof value !== "object") return null;

  const { id, email, displayName } = value as Record<string, unknown>;

  return typeof id === "string" &&
    typeof email === "string" &&
    typeof displayName === "string"
    ? { id, email, displayName }
    : null;
}

function readBodyUser(body: unknown): AccountUser | null {
  return body && typeof body === "object" && "user" in body
    ? readUser(body.user)
    : null;
}

async function post(path: string, body: Record<string, string>) {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

export interface Me {
  user: AccountUser | null;
  /** So bai vua co ket qua duyet ma chua xem. */
  postNews: number;
}

export function readMe(body: unknown): Me {
  const user = readBodyUser(body);
  const news =
    user && body && typeof body === "object" && "postNews" in body
      ? body.postNews
      : 0;

  return {
    user,
    postNews:
      typeof news === "number" && Number.isInteger(news) && news > 0 ? news : 0
  };
}

export async function fetchMe(): Promise<Me> {
  const response = await fetch("/api/auth/me", { cache: "no-store" });
  if (!response.ok) throw new Error("me failed");
  return readMe(await response.json());
}

export async function submitAuth(
  mode: "login" | "register",
  fields: Record<string, string>
): Promise<AuthOutcome> {
  try {
    const response = await post(`/api/auth/${mode}`, fields);
    const user = response.ok ? readBodyUser(await response.json()) : null;

    if (user) return { ok: true, user };
    return { ok: false, message: MESSAGES[response.status] ?? FALLBACK };
  } catch {
    return { ok: false, message: FALLBACK };
  }
}

export interface TopicChoice {
  slug: string;
  label: string;
  chosen: boolean;
}

export interface Profile {
  displayName: string;
  topics: TopicChoice[];
}

function readTopic(value: unknown): TopicChoice | null {
  if (!value || typeof value !== "object") return null;

  const { slug, label, chosen } = value as Record<string, unknown>;

  return typeof slug === "string" &&
    typeof label === "string" &&
    typeof chosen === "boolean"
    ? { slug, label, chosen }
    : null;
}

export function readProfile(value: unknown): Profile | null {
  if (!value || typeof value !== "object") return null;

  const { displayName, topics } = value as Record<string, unknown>;
  if (typeof displayName !== "string" || !Array.isArray(topics)) return null;

  return {
    displayName,
    topics: topics
      .map(readTopic)
      .filter((topic): topic is TopicChoice => topic !== null)
  };
}

function bodyProfile(body: unknown): Profile | null {
  return body && typeof body === "object" && "profile" in body
    ? readProfile(body.profile)
    : null;
}

export async function loadProfile(): Promise<Profile | null> {
  try {
    const response = await fetch("/api/me/profile", { cache: "no-store" });
    return response.ok ? bodyProfile(await response.json()) : null;
  } catch {
    return null;
  }
}

const PROFILE_MESSAGES: Record<number, string> = {
  400: "Tên cần từ 1 đến 60 ký tự.",
  401: "Phiên đăng nhập đã hết. Hãy đăng nhập lại.",
  429: "Bạn lưu hơi nhanh. Đợi vài giây rồi thử lại nhé."
};

export type ProfileOutcome =
  | { ok: true; user: AccountUser; profile: Profile }
  | { ok: false; message: string };

export async function saveProfile(
  displayName: string,
  topics: string[]
): Promise<ProfileOutcome> {
  try {
    const response = await fetch("/api/me/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName, topics })
    });
    const body: unknown = response.ok ? await response.json() : null;
    const user = readBodyUser(body);
    const profile = bodyProfile(body);

    if (user && profile) return { ok: true, user, profile };
    return {
      ok: false,
      message: PROFILE_MESSAGES[response.status] ?? FALLBACK
    };
  } catch {
    return { ok: false, message: FALLBACK };
  }
}

export async function signOut(): Promise<boolean> {
  try {
    return (await post("/api/auth/logout", {})).ok;
  } catch {
    return false;
  }
}
