import Papa from "papaparse";
import * as XLSX from "xlsx";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PortfolioHolding {
  symbol: string;
  isin?: string;
  sector: string;
  investment_volume: number; // Quantity column
  avg_buy_price: number;     // Average Buy Price column
  current_price: number;     // Current Price column
}

export interface ParseResult {
  holdings: PortfolioHolding[];
  errors: string[];
}

// ── Fixed column contract ─────────────────────────────────────────────────────
// The template defines exactly these headers (case-insensitive match).

const REQUIRED_COLUMNS = [
  "symbol",
  "sector",
  "quantity",
  "average buy price",
  "current price",
] as const;

// ── Row mapper ────────────────────────────────────────────────────────────────

function normalise(s: string): string {
  return s.trim().toLowerCase();
}

function validateHeaders(headers: string[]): string[] {
  const normalised = headers.map(normalise);
  return REQUIRED_COLUMNS.filter((col) => !normalised.includes(col)).map(
    (col) => `Missing required column: "${col}"`
  );
}

function mapRow(
  row: Record<string, string>,
  headers: string[],
  rowIndex: number,
  errors: string[]
): PortfolioHolding | null {
  // Build a normalised-key lookup so casing in the file doesn't matter
  const lookup: Record<string, string> = {};
  for (const h of headers) {
    lookup[normalise(h)] = row[h] ?? "";
  }

  const symbol = lookup["symbol"]?.trim();
  const sector = lookup["sector"]?.trim();
  const volume = parseFloat(lookup["quantity"]);
  const avgBuy = parseFloat(lookup["average buy price"]);
  const curPrice = parseFloat(lookup["current price"]);

  if (!symbol || !sector) {
    errors.push(`Row ${rowIndex}: skipped — Symbol or Sector is empty`);
    return null;
  }

  if (isNaN(volume) || isNaN(avgBuy) || isNaN(curPrice)) {
    errors.push(`Row ${rowIndex}: skipped — Quantity, Average Buy Price, or Current Price is not a number`);
    return null;
  }

  if (volume <= 0 || avgBuy <= 0 || curPrice <= 0) {
    errors.push(`Row ${rowIndex}: skipped — Quantity, Average Buy Price, and Current Price must be positive`);
    return null;
  }

  return {
    symbol,
    sector,
    investment_volume: volume,
    avg_buy_price: avgBuy,
    current_price: curPrice,
    ...(lookup["isin"] ? { isin: lookup["isin"].trim() } : {}),
  };
}

// ── CSV parser ────────────────────────────────────────────────────────────────

export function parseCSV(content: string): ParseResult {
  const errors: string[] = [];

  const { data, errors: parseErrors } = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (parseErrors.length) {
    errors.push(...parseErrors.map((e) => `CSV parse error: ${e.message}`));
  }

  if (!data.length) return { holdings: [], errors: ["File is empty."] };

  const headers = Object.keys(data[0]);
  const headerErrors = validateHeaders(headers);
  if (headerErrors.length) {
    return { holdings: [], errors: headerErrors };
  }

  const holdings: PortfolioHolding[] = [];
  for (let i = 0; i < data.length; i++) {
    const h = mapRow(data[i], headers, i + 2, errors);
    if (h) holdings.push(h);
  }

  return { holdings, errors };
}

// ── Excel parser ──────────────────────────────────────────────────────────────

export function parseExcel(buffer: ArrayBuffer): ParseResult {
  const errors: string[] = [];

  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { holdings: [], errors: ["Excel file has no sheets."] };

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, {
    defval: "",
    raw: false,
  });

  if (!rows.length) return { holdings: [], errors: ["Sheet is empty."] };

  const headers = Object.keys(rows[0]);
  const headerErrors = validateHeaders(headers);
  if (headerErrors.length) {
    return { holdings: [], errors: headerErrors };
  }

  const holdings: PortfolioHolding[] = [];
  for (let i = 0; i < rows.length; i++) {
    const h = mapRow(rows[i], headers, i + 2, errors);
    if (h) holdings.push(h);
  }

  return { holdings, errors };
}

// ── File entry point ──────────────────────────────────────────────────────────

export async function parsePortfolioFile(file: File): Promise<ParseResult> {
  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext === "csv") {
    const text = await file.text();
    return parseCSV(text);
  }

  if (ext === "xlsx" || ext === "xls") {
    const buffer = await file.arrayBuffer();
    return parseExcel(buffer);
  }

  return {
    holdings: [],
    errors: [`Unsupported file type ".${ext}". Please use the provided template (CSV or Excel).`],
  };
}
