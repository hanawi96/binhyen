/**
 * Bitmap bai da xem cua mot nguoi: bit thu seq bat la da xem.
 * Byte k chua seq 8k..8k+7, bit thap truoc. Khop cot viewer_feed_state.seen_bits.
 */
export const MAX_SEEN_BYTES = 131072;
export const MAX_SEQ = MAX_SEEN_BYTES * 8 - 1;

export function isSeq(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= MAX_SEQ
  );
}

function isByteArray(value: readonly unknown[]): value is number[] {
  return value.every(
    (byte) =>
      typeof byte === "number" &&
      Number.isInteger(byte) &&
      byte >= 0 &&
      byte <= 255
  );
}

/** D1 co the tra BLOB la ArrayBuffer hoac mang so; du lieu la coi nhu chua xem gi. */
export function toSeenBits(value: unknown): Uint8Array {
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value.slice(0, MAX_SEEN_BYTES));
  }

  if (ArrayBuffer.isView(value)) {
    const bytes = new Uint8Array(
      value.buffer,
      value.byteOffset,
      value.byteLength
    );
    return bytes.slice(0, MAX_SEEN_BYTES);
  }

  if (
    Array.isArray(value) &&
    value.length <= MAX_SEEN_BYTES &&
    isByteArray(value)
  ) {
    return Uint8Array.from(value);
  }

  return new Uint8Array(0);
}

/** D1 nhan BLOB qua ArrayBuffer; ban sao rieng de khong lo phan du cua buffer goc. */
export function seenBlob(bits: Uint8Array): ArrayBuffer {
  return bits.slice().buffer;
}

export function hasSeen(bits: Uint8Array, seq: number): boolean {
  if (!isSeq(seq)) return false;

  const byte = bits[seq >> 3] ?? 0;
  return (byte & (1 << (seq & 7))) !== 0;
}

/** Tra ban moi, khong sua ban cu; seq sai bi bo qua. */
export function markSeen(
  bits: Uint8Array,
  seqs: readonly number[]
): { bits: Uint8Array; added: number } {
  let size = bits.length;

  for (const seq of seqs) {
    if (isSeq(seq)) size = Math.max(size, (seq >> 3) + 1);
  }

  const next = new Uint8Array(size);
  next.set(bits);

  let added = 0;

  for (const seq of seqs) {
    if (!isSeq(seq)) continue;

    const index = seq >> 3;
    const mask = 1 << (seq & 7);
    const byte = next[index] ?? 0;

    if ((byte & mask) !== 0) continue;

    next[index] = byte | mask;
    added += 1;
  }

  return { bits: next, added };
}

/** Gop lich su hai noi, vi du an danh vao tai khoan. */
export function mergeSeen(a: Uint8Array, b: Uint8Array): Uint8Array {
  const next = new Uint8Array(Math.max(a.length, b.length));
  next.set(a);

  for (let index = 0; index < b.length; index++) {
    next[index] = (next[index] ?? 0) | (b[index] ?? 0);
  }

  return next;
}

export function countSeen(bits: Uint8Array): number {
  let total = 0;

  for (const byte of bits) {
    let rest = byte;

    while (rest !== 0) {
      rest &= rest - 1;
      total += 1;
    }
  }

  return total;
}
