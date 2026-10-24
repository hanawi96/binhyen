// Workers gioi han PBKDF2 toi da 100000 vong.
const ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;
const PREFIX = "pbkdf2-sha256";

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;

  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");

  try {
    const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

async function derive(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    HASH_BITS
  );

  return new Uint8Array(bits);
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  let difference = left.length === right.length ? 0 : 1;
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }

  return difference === 0;
}

/** Dang luu: pbkdf2-sha256$vong$salt$hash (base64url). */
export async function hashPassword(
  password: string,
  iterations = ITERATIONS
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, iterations);

  return [PREFIX, iterations, toBase64Url(salt), toBase64Url(hash)].join("$");
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const [prefix, rawIterations, rawSalt, rawHash] = stored.split("$");
  const iterations = Number(rawIterations);
  const salt = fromBase64Url(rawSalt ?? "");
  const expected = fromBase64Url(rawHash ?? "");

  if (
    prefix !== PREFIX ||
    !Number.isSafeInteger(iterations) ||
    iterations < 1 ||
    iterations > ITERATIONS ||
    !salt ||
    !expected
  ) {
    return false;
  }

  return sameBytes(await derive(password, salt, iterations), expected);
}

// Dung khi khong co email nao khop, de thoi gian tra loi nhu nhau.
let decoy: Promise<string> | null = null;

export async function verifyDecoy(password: string): Promise<false> {
  decoy ??= hashPassword("binhyen-decoy-password");
  await verifyPassword(password, await decoy);
  return false;
}
