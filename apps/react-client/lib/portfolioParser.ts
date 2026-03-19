import Papa from "papaparse";
import * as XLSX from "xlsx";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PortfolioHolding {
  symbol: string;
  isin?: string;
  sector: string;
  investment_volume: number; // quantity of shares held
  avg_buy_price: number;
  current_price: number;
}

export interface ParseResult {
  holdings: PortfolioHolding[];
  warnings: string[]; // rows skipped or fields that couldn't be resolved
}

// ── Column alias map ──────────────────────────────────────────────────────────
// Each key is the canonical field name; values are accepted column headers
// (all matched case-insensitively after trimming whitespace).

const COLUMN_ALIASES: Record<keyof PortfolioHolding, string[]> = {
  symbol: ["symbol", "ticker", "scrip", "stock", "name", "stock name", "scrip name"],
  isin: ["isin", "isin code", "isin number"],
  sector: ["sector", "industry", "segment", "category"],
  investment_volume: [
    "quantity available",
    "qty available",
    "quantity",
    "qty",
    "shares",
    "units",
    "holdings",
    "quantity long term",
  ],
  avg_buy_price: [
    "average price",
    "avg price",
    "avg buy price",
    "average buy price",
    "buy price",
    "cost price",
    "purchase price",
    "avg cost",
  ],
  current_price: [
    "previous closing price",
    "prev closing price",
    "closing price",
    "current price",
    "ltp",
    "last traded price",
    "market price",
    "cmp",
    "last price",
  ],
};

// ── Column resolver ───────────────────────────────────────────────────────────

function buildColumnMap(
  headers: string[]
): Partial<Record<keyof PortfolioHolding, string>> {
  const normalised = headers.map((h) => h.trim().toLowerCase());
  const result: Partial<Record<keyof PortfolioHolding, string>> = {};

  for (const [field, aliases] of Object.entries(COLUMN_ALIASES) as [
    keyof PortfolioHolding,
    string[],
  ][]) {
    for (const alias of aliases) {
      const idx = normalised.indexOf(alias);
      if (idx !== -1) {
        result[field] = headers[idx]; // keep original casing for row lookup
        break;
      }
    }
  }

  return result;
}

// ── Row mapper ────────────────────────────────────────────────────────────────

function mapRow(
  row: Record<string, string>,
  colMap: Partial<Record<keyof PortfolioHolding, string>>,
  warnings: string[],
  rowIndex: number
): PortfolioHolding | null {
  const required: Array<keyof PortfolioHolding> = [
    "symbol",
    "sector",
    "investment_volume",
    "avg_buy_price",
    "current_price",
  ];

  for (const field of required) {
    if (!colMap[field]) {
      // Only warn once per field (not per row) — handled by caller
      return null;
    }
  }

  const symbolCol = colMap.symbol!;
  const sectorCol = colMap.sector!;
  const volCol = colMap.investment_volume!;
  const buyCol = colMap.avg_buy_price!;
  const curCol = colMap.current_price!;

  const symbol = row[symbolCol]?.trim();
  const sector = row[sectorCol]?.trim();
  const volume = parseFloat(row[volCol]);
  const avgBuy = parseFloat(row[buyCol]);
  const curPrice = parseFloat(row[curCol]);

  if (!symbol || !sector) {
    warnings.push(`Row ${rowIndex}: skipped — missing symbol or sector`);
    return null;
  }

  if (isNaN(volume) || isNaN(avgBuy) || isNaN(curPrice)) {
    warnings.push(`Row ${rowIndex}: skipped — non-numeric price/volume values`);
    return null;
  }

  const holding: PortfolioHolding = {
    symbol,
    sector,
    investment_volume: volume,
    avg_buy_price: avgBuy,
    current_price: curPrice,
  };

  if (colMap.isin) {
    holding.isin = row[colMap.isin]?.trim();
  }

  return holding;
}

// ── CSV parser ────────────────────────────────────────────────────────────────

export function parseCSV(content: string): ParseResult {
  const warnings: string[] = [];

  const { data, errors } = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (errors.length) {
    warnings.push(...errors.map((e) => `CSV parse warning: ${e.message}`));
  }

  if (!data.length) return { holdings: [], warnings };

  const headers = Object.keys(data[0]);
  const colMap = buildColumnMap(headers);

  checkMissingColumns(colMap, warnings);

  const holdings: PortfolioHolding[] = [];
  for (let i = 0; i < data.length; i++) {
    const holding = mapRow(data[i], colMap, warnings, i + 2); // +2 for 1-based + header row
    if (holding) holdings.push(holding);
  }

  return { holdings, warnings };
}

// ── Excel parser ──────────────────────────────────────────────────────────────

export function parseExcel(buffer: ArrayBuffer): ParseResult {
  const warnings: string[] = [];

  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { holdings: [], warnings: ["Excel file has no sheets"] };

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, {
    defval: "",
    raw: false,
  });

  if (!rows.length) return { holdings: [], warnings };

  const headers = Object.keys(rows[0]);
  const colMap = buildColumnMap(headers);

  checkMissingColumns(colMap, warnings);

  const holdings: PortfolioHolding[] = [];
  for (let i = 0; i < rows.length; i++) {
    const holding = mapRow(rows[i], colMap, warnings, i + 2);
    if (holding) holdings.push(holding);
  }

  return { holdings, warnings };
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
    warnings: [`Unsupported file type ".${ext}". Please upload a CSV or Excel file.`],
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function checkMissingColumns(
  colMap: Partial<Record<keyof PortfolioHolding, string>>,
  warnings: string[]
) {
  const required: Array<keyof PortfolioHolding> = [
    "symbol",
    "sector",
    "investment_volume",
    "avg_buy_price",
    "current_price",
  ];
  for (const field of required) {
    if (!colMap[field]) {
      warnings.push(
        `Could not find a column for "${field}". Expected one of: ${COLUMN_ALIASES[field].join(", ")}`
      );
    }
  }
}
