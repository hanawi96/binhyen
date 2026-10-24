import {
  contentFormats,
  isContentFormat,
  type ContentFormat
} from "./content.types";

/** Doc format tu DB / payload; thieu hoac la thi coi la chu. */
export function readContentFormat(value: unknown): ContentFormat {
  return typeof value === "string" && isContentFormat(value)
    ? value
    : "text";
}

export function isKnownContentFormat(value: string): boolean {
  return (contentFormats as readonly string[]).includes(value);
}
