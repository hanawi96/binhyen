/** ~30 nền màu; sáng/tối cùng bố cục CSS, chỉ khác bộ màu. */

export const ATMOSPHERE_COUNT = 30;
export const ATMOSPHERE_LAYOUT_COUNT = 10;

export type AtmosphereMode = "light" | "dark";

export type AtmospherePreset = {
  id: number;
  /** Nhóm bố cục (dùng chống trùng liên tiếp). */
  layout: number;
  light: { wash: string; a: string; b: string };
  dark: { wash: string; a: string; b: string };
};

export const ATMOSPHERE_PRESETS: AtmospherePreset[] = [
  {
    id: 0,
    layout: 0,
    light: { wash: "#e6eee6", a: "#7d9a84", b: "#d5e0c8" },
    dark: { wash: "#24352c", a: "#5a7a66", b: "#314538" }
  },
  {
    id: 1,
    layout: 1,
    light: { wash: "#e5eaf2", a: "#526a91", b: "#c8d4e8" },
    dark: { wash: "#222c3a", a: "#6a82a8", b: "#2c384a" }
  },
  {
    id: 2,
    layout: 2,
    light: { wash: "#f4e9df", a: "#8c6b57", b: "#ead5c0" },
    dark: { wash: "#332820", a: "#a8846c", b: "#3f3228" }
  },
  {
    id: 3,
    layout: 3,
    light: { wash: "#e1ede5", a: "#527b65", b: "#c5ddd0" },
    dark: { wash: "#21352c", a: "#6a9a80", b: "#2c4538" }
  },
  {
    id: 4,
    layout: 4,
    light: { wash: "#efe6ed", a: "#80647e", b: "#e0cddc" },
    dark: { wash: "#32262f", a: "#9a7a96", b: "#3e3040" }
  },
  {
    id: 5,
    layout: 5,
    light: { wash: "#f7e9e3", a: "#9d695e", b: "#efd2c6" },
    dark: { wash: "#352620", a: "#b48478", b: "#423028" }
  },
  {
    id: 6,
    layout: 6,
    light: { wash: "#dff3ef", a: "#4d8b7f", b: "#bfe6de" },
    dark: { wash: "#1e332f", a: "#68a89a", b: "#28423c" }
  },
  {
    id: 7,
    layout: 7,
    light: { wash: "#f7f0d8", a: "#a8904a", b: "#ebe0b0" },
    dark: { wash: "#332e1c", a: "#c4a85a", b: "#403828" }
  },
  {
    id: 8,
    layout: 8,
    light: { wash: "#e8ecef", a: "#5c6b7a", b: "#cfd6de" },
    dark: { wash: "#262c32", a: "#7a8a9a", b: "#343c44" }
  },
  {
    id: 9,
    layout: 9,
    light: { wash: "#f6e6ea", a: "#a66b7a", b: "#ebcdd6" },
    dark: { wash: "#342428", a: "#c08494", b: "#422e34" }
  },
  {
    id: 10,
    layout: 0,
    light: { wash: "#e4efe0", a: "#5f7d52", b: "#cfe0c4" },
    dark: { wash: "#243224", a: "#7a9a68", b: "#304030" }
  },
  {
    id: 11,
    layout: 1,
    light: { wash: "#ebe4f0", a: "#6e5b8a", b: "#d9cee6" },
    dark: { wash: "#2c2636", a: "#8a78a8", b: "#3a3248" }
  },
  {
    id: 12,
    layout: 2,
    light: { wash: "#f3e6dc", a: "#9a6b52", b: "#e6cfc0" },
    dark: { wash: "#34261e", a: "#b88868", b: "#423028" }
  },
  {
    id: 13,
    layout: 3,
    light: { wash: "#e2eef5", a: "#4a7a96", b: "#c2d8e6" },
    dark: { wash: "#1e2c36", a: "#6a96b0", b: "#2a3c48" }
  },
  {
    id: 14,
    layout: 4,
    light: { wash: "#f8eedc", a: "#b08940", b: "#ecd9b0" },
    dark: { wash: "#342c1a", a: "#c8a050", b: "#423822" }
  },
  {
    id: 15,
    layout: 5,
    light: { wash: "#eceee8", a: "#7a8478", b: "#d5d9d0" },
    dark: { wash: "#2a2e2a", a: "#8a9488", b: "#383c38" }
  },
  {
    id: 16,
    layout: 6,
    light: { wash: "#f8e8e4", a: "#c07868", b: "#efcfc6" },
    dark: { wash: "#362420", a: "#d09080", b: "#443028" }
  },
  {
    id: 17,
    layout: 7,
    light: { wash: "#dfece3", a: "#3f6b54", b: "#b8d4c4" },
    dark: { wash: "#1c3026", a: "#5a8a6e", b: "#284036" }
  },
  {
    id: 18,
    layout: 8,
    light: { wash: "#ebe8f2", a: "#71689a", b: "#d4cee6" },
    dark: { wash: "#2a2836", a: "#8a82b0", b: "#383648" }
  },
  {
    id: 19,
    layout: 9,
    light: { wash: "#f9ebe0", a: "#c4895a", b: "#efd4bc" },
    dark: { wash: "#36281c", a: "#d4a070", b: "#443424" }
  },
  {
    id: 20,
    layout: 0,
    light: { wash: "#e4e9f4", a: "#455a7a", b: "#c4cee4" },
    dark: { wash: "#222a36", a: "#6a7e9a", b: "#2e3848" }
  },
  {
    id: 21,
    layout: 1,
    light: { wash: "#e8f0dc", a: "#6b8448", b: "#d2e0b4" },
    dark: { wash: "#2a321e", a: "#8aa05a", b: "#384028" }
  },
  {
    id: 22,
    layout: 2,
    light: { wash: "#f5e4ec", a: "#9a6078", b: "#e8c8d6" },
    dark: { wash: "#34242c", a: "#b47890", b: "#422e38" }
  },
  {
    id: 23,
    layout: 3,
    light: { wash: "#ebe8e2", a: "#7a7368", b: "#d8d2c8" },
    dark: { wash: "#2c2a26", a: "#908878", b: "#3a3832" }
  },
  {
    id: 24,
    layout: 4,
    light: { wash: "#e0f2f1", a: "#3d8a84", b: "#b5e0dc" },
    dark: { wash: "#1c302e", a: "#5aa8a0", b: "#284240" }
  },
  {
    id: 25,
    layout: 5,
    light: { wash: "#f0e4e8", a: "#8a5a68", b: "#e0c8d0" },
    dark: { wash: "#322428", a: "#a87888", b: "#402e34" }
  },
  {
    id: 26,
    layout: 6,
    light: { wash: "#f4f2dc", a: "#8a9a48", b: "#e4e6b4" },
    dark: { wash: "#302e1c", a: "#a8b458", b: "#3e3c24" }
  },
  {
    id: 27,
    layout: 7,
    light: { wash: "#e6e8f0", a: "#585878", b: "#c8cadc" },
    dark: { wash: "#262830", a: "#7878a0", b: "#343640" }
  },
  {
    id: 28,
    layout: 8,
    light: { wash: "#f4e5dc", a: "#a06850", b: "#e6c8b6" },
    dark: { wash: "#34261e", a: "#b88068", b: "#423028" }
  },
  {
    id: 29,
    layout: 9,
    light: { wash: "#e5efe8", a: "#5a7d6a", b: "#c4dcc8" },
    dark: { wash: "#223028", a: "#729a84", b: "#2e4034" }
  }
];

export function atmosphereLayout(id: number): number {
  const preset = ATMOSPHERE_PRESETS[id];
  if (preset) return preset.layout;
  return (
    ((id % ATMOSPHERE_LAYOUT_COUNT) + ATMOSPHERE_LAYOUT_COUNT) %
    ATMOSPHERE_LAYOUT_COUNT
  );
}

export function getAtmospherePreset(id: number): AtmospherePreset {
  return ATMOSPHERE_PRESETS[
    ((id % ATMOSPHERE_COUNT) + ATMOSPHERE_COUNT) % ATMOSPHERE_COUNT
  ];
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Chọn preset khác id và khác nhóm layout so với previous. */
export function pickAtmosphereId(seed: string, previous: number): number {
  let n = hashString(seed) % ATMOSPHERE_COUNT;
  if (previous < 0) return n;

  let guard = 0;
  while (
    guard < ATMOSPHERE_COUNT &&
    (n === previous || atmosphereLayout(n) === atmosphereLayout(previous))
  ) {
    n = (n + 1) % ATMOSPHERE_COUNT;
    guard += 1;
  }
  return n;
}

/** Gán theo thứ tự feed — hai id liền nhau không cùng preset/layout. */
export function buildAtmosphereMap(ids: readonly string[]): Map<string, number> {
  const map = new Map<string, number>();
  let prev = -1;
  for (const id of ids) {
    const n = pickAtmosphereId(id, prev);
    map.set(id, n);
    prev = n;
  }
  return map;
}

/** Inline style — browser nội suy @property --atm-* khi đổi giá trị. */
export function atmosphereStyle(
  id: number,
  mode: AtmosphereMode = "light"
): string {
  const p = getAtmospherePreset(id);
  const colors = mode === "dark" ? p.dark : p.light;
  return `--atm-wash:${colors.wash};--atm-a:${colors.a};--atm-b:${colors.b};`;
}
