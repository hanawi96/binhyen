import ExcelJS from "exceljs";
import type { AdminCatalogItem } from "./d1-admin-content";
import {
  IMPORT_FORMAT_OPTIONS,
  IMPORT_HEADER_LABELS,
  IMPORT_HEADERS,
  IMPORT_MAX_ROWS,
  draftFromImportRow,
  mapHeaderIndexes,
  rowRecord,
  type ImportCatalog,
  type ImportRowResult
} from "./content-import";

const SHEET_DATA = "NoiDung";
const SHEET_REF = "DanhMuc";
const DATA_START_ROW = 2;
const DATA_END_ROW = IMPORT_MAX_ROWS + 1;

function sheetCells(sheet: ExcelJS.Worksheet, rowNumber: number): unknown[] {
  const row = sheet.getRow(rowNumber);
  const values = Array.isArray(row.values) ? row.values : [];
  return values.slice(1).map((cell) => {
    if (cell && typeof cell === "object" && "text" in cell) {
      return String((cell as { text?: string }).text ?? "");
    }
    if (cell && typeof cell === "object" && "result" in cell) {
      return (cell as { result?: unknown }).result;
    }
    return cell;
  });
}

function catalogLabels(items: AdminCatalogItem[]): string[] {
  return items
    .map((item) => item.label.trim())
    .filter(Boolean);
}

/** Tao file mau .xlsx — dropdown dung NHAN TIENG VIET tu DB. */
export async function buildImportTemplate(
  catalog: ImportCatalog
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "BinhYen";
  workbook.created = new Date();

  const ref = workbook.addWorksheet(SHEET_REF, {
    state: "hidden"
  });
  ref.getCell("A1").value = "Định dạng";
  ref.getCell("B1").value = "Chủ đề";
  ref.getCell("C1").value = "Slug chủ đề";
  ref.getCell("D1").value = "Tâm trạng";
  ref.getCell("E1").value = "Slug tâm trạng";

  IMPORT_FORMAT_OPTIONS.forEach((option, index) => {
    ref.getCell(index + 2, 1).value = option.label;
  });

  catalog.topics.forEach((item, index) => {
    ref.getCell(index + 2, 2).value = item.label;
    ref.getCell(index + 2, 3).value = item.slug;
  });

  catalog.moods.forEach((item, index) => {
    ref.getCell(index + 2, 4).value = item.label;
    ref.getCell(index + 2, 5).value = item.slug;
  });

  const topicCount = Math.max(catalog.topics.length, 1);
  const moodCount = Math.max(catalog.moods.length, 1);
  const formatCount = IMPORT_FORMAT_OPTIONS.length;

  const data = workbook.addWorksheet(SHEET_DATA);
  IMPORT_HEADERS.forEach((name, index) => {
    const cell = data.getCell(1, index + 1);
    cell.value = IMPORT_HEADER_LABELS[name];
    cell.font = { bold: true };
  });

  data.getRow(1).height = 20;
  data.columns = [
    { width: 14 },
    { width: 36 },
    { width: 28 },
    { width: 28 },
    { width: 22 },
    { width: 32 },
    { width: 48 }
  ];

  // Dong mau — dung nhan VI de nguoi dung nhin thay dung
  const sampleTopic = catalogLabels(catalog.topics)[0] ?? "";
  const sampleMood = catalogLabels(catalog.moods)[0] ?? "";
  data.getCell(2, 1).value = IMPORT_FORMAT_OPTIONS[0]?.label ?? "Bài viết";
  data.getCell(2, 2).value = "Ví dụ tiêu đề bản nháp";
  data.getCell(2, 3).value = sampleTopic;
  data.getCell(2, 4).value = sampleMood;
  data.getCell(2, 5).value = "";
  data.getCell(2, 6).value = "";
  data.getCell(2, 7).value = "Nội dung dài (tuỳ chọn).";

  // Dropdown dinh dang (cot A) — nhan VI
  for (let row = DATA_START_ROW; row <= DATA_END_ROW; row += 1) {
    data.getCell(row, 1).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`=${SHEET_REF}!$A$2:$A$${formatCount + 1}`],
      showErrorMessage: true,
      errorTitle: "Định dạng",
      error: `Chọn một trong: ${IMPORT_FORMAT_OPTIONS.map((o) => o.label).join(", ")}.`
    };
  }

  // Dropdown chu de (cot C) — nhan VI tu DB
  for (let row = DATA_START_ROW; row <= DATA_END_ROW; row += 1) {
    data.getCell(row, 3).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`=${SHEET_REF}!$B$2:$B$${topicCount + 1}`],
      showErrorMessage: true,
      errorTitle: "Chủ đề",
      error: "Chọn chủ đề trong danh sách (đồng bộ database)."
    };
  }

  // Dropdown tam trang (cot D) — nhan VI tu DB
  for (let row = DATA_START_ROW; row <= DATA_END_ROW; row += 1) {
    data.getCell(row, 4).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`=${SHEET_REF}!$D$2:$D$${moodCount + 1}`],
      showErrorMessage: true,
      errorTitle: "Tâm trạng",
      error: "Chọn tâm trạng trong danh sách (đồng bộ database)."
    };
  }

  const guide = workbook.addWorksheet("HuongDan");
  guide.getCell("A1").value = "Hướng dẫn nhập hàng loạt";
  guide.getCell("A1").font = { bold: true, size: 14 };
  guide.mergeCells("A1:B1");

  const lines: Array<[string, string]> = [
    ["Định dạng", IMPORT_FORMAT_OPTIONS.map((o) => o.label).join(" / ")],
    ["Chủ đề", "Chọn đúng tên trong dropdown (đồng bộ danh mục hiện có). Nhiều chủ đề: cách nhau bằng |"],
    ["Tâm trạng", "Chọn đúng tên trong dropdown. Có thể để trống. Nhiều giá trị: cách nhau bằng |"],
    ["Tiêu đề", "Bắt buộc"],
    ["Nội dung dài", "Tuỳ chọn (Bài viết / Câu hỏi)"],
    ["Kết quả", `Tối đa ${IMPORT_MAX_ROWS} dòng → tạo bản nháp. Kiểm tra rồi xuất bản từng bài.`],
    ["Danh mục", "Sheet DanhMuc ẩn chứa nhãn + slug hiện tại từ database."]
  ];
  lines.forEach(([label, text], index) => {
    guide.getCell(index + 3, 1).value = label;
    guide.getCell(index + 3, 1).font = { bold: true };
    guide.getCell(index + 3, 2).value = text;
  });
  guide.columns = [{ width: 16 }, { width: 72 }];

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

export interface ParsedImportFile {
  rows: Array<{ row: number; values: Record<string, string> }>;
  error?: string;
}

/** Doc file .xlsx → cac dong du lieu (chua map sang draft). */
export async function parseImportWorkbook(
  data: ArrayBuffer
): Promise<ParsedImportFile> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);

  const sheet =
    workbook.getWorksheet(SHEET_DATA) ??
    workbook.worksheets.find((item) => item.state !== "hidden") ??
    workbook.worksheets[0];

  if (!sheet) {
    return { rows: [], error: "Không tìm thấy sheet dữ liệu trong file." };
  }

  const headerCells = sheetCells(sheet, 1);
  const indexes = mapHeaderIndexes(headerCells);
  if (!indexes) {
    return {
      rows: [],
      error:
        "Hàng 1 phải có các cột: Định dạng, Tiêu đề, Chủ đề (hoặc format / title / topics)."
    };
  }

  const rows: ParsedImportFile["rows"] = [];
  const lastRow = Math.min(sheet.rowCount || 0, DATA_END_ROW);

  for (let rowNumber = DATA_START_ROW; rowNumber <= lastRow; rowNumber += 1) {
    const cells = sheetCells(sheet, rowNumber);
    const values = rowRecord(cells, indexes);
    const empty = IMPORT_HEADERS.every((name) => !values[name]);
    if (empty) continue;
    rows.push({ row: rowNumber, values });
  }

  if (rows.length === 0) {
    return { rows: [], error: "File không có dòng dữ liệu nào." };
  }

  if (rows.length > IMPORT_MAX_ROWS) {
    return {
      rows: [],
      error: `Tối đa ${IMPORT_MAX_ROWS} dòng mỗi lần nhập (file có ${rows.length}).`
    };
  }

  return { rows };
}

/** Doc .xlsx → rows gui API import (kem __row). */
export async function readImportRowsFromXlsx(
  data: ArrayBuffer
): Promise<Array<Record<string, string> & { __row: number }>> {
  const parsed = await parseImportWorkbook(data);
  if (parsed.error) {
    throw new Error(parsed.error);
  }

  return parsed.rows.map((item) => ({
    ...item.values,
    __row: item.row
  }));
}

/** Validate 1 dong voi catalog DB (dung khi test / preview). */
export function validateImportRow(
  values: Record<string, string>,
  catalog: ImportCatalog
): ImportRowResult & { draftOk?: boolean } {
  const parsed = draftFromImportRow(values, catalog);
  if (!parsed.ok) {
    return { row: 0, ok: false, error: parsed.error };
  }
  return { row: 0, ok: true, title: parsed.value.title, draftOk: true };
}
