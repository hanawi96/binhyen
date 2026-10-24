export interface MediaSize {
  width: number;
  height: number;
}

export type MediaLayout = "portrait" | "landscape" | "square" | "unknown";

export function mediaLayout(
  width: number | null | undefined,
  height: number | null | undefined
): MediaLayout {
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    width < 1 ||
    height < 1
  ) {
    return "unknown";
  }

  if (width === height) return "square";
  return height > width ? "portrait" : "landscape";
}

export function layoutLabel(layout: MediaLayout): string {
  if (layout === "portrait") return "dọc";
  if (layout === "landscape") return "ngang";
  if (layout === "square") return "vuông";
  return "";
}

/** Doc kich thuoc that tu File (anh/video) trong trinh duyet. */
export function readFileMediaSize(file: File): Promise<MediaSize | null> {
  if (file.type.startsWith("video/")) return readVideoObjectUrl(file);
  if (file.type.startsWith("image/")) return readImageObjectUrl(file);
  return Promise.resolve(null);
}

/** Do URL cung goc / HTTPS (co the that bai neu CORS chan). */
export function readUrlMediaSize(
  url: string,
  kind: "image" | "video"
): Promise<MediaSize | null> {
  const trimmed = url.trim();
  if (!trimmed) return Promise.resolve(null);
  return kind === "video"
    ? readVideoSrc(trimmed)
    : readImageSrc(trimmed);
}

function readImageObjectUrl(file: File): Promise<MediaSize | null> {
  const url = URL.createObjectURL(file);
  return readImageSrc(url).finally(() => URL.revokeObjectURL(url));
}

function readVideoObjectUrl(file: File): Promise<MediaSize | null> {
  const url = URL.createObjectURL(file);
  return readVideoSrc(url).finally(() => URL.revokeObjectURL(url));
}

function readImageSrc(src: string): Promise<MediaSize | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      resolve(width > 0 && height > 0 ? { width, height } : null);
    };
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function readVideoSrc(src: string): Promise<MediaSize | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    const finish = (size: MediaSize | null) => {
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute("src");
      video.load();
      resolve(size);
    };

    video.onloadedmetadata = () => {
      const width = video.videoWidth;
      const height = video.videoHeight;
      finish(width > 0 && height > 0 ? { width, height } : null);
    };
    video.onerror = () => finish(null);
    video.src = src;
  });
}
