// Parseur PUR de l'import CSV des achats DPS — mêmes tolérances que les
// autres imports (BOM, ; ou , , dates françaises, montants « 1 234,56 »).
// Colonnes : boutique;depot;date;reference;montant.
import Papa from "papaparse";

import {
  parseFrenchAmount,
  parseFrenchDate,
  type ParseError,
} from "./revenue-import";

export type ParsedPurchaseRow = {
  storeCode: string;
  depotCode: string;
  date: string; // ISO YYYY-MM-DD
  reference: string;
  amount: string;
};

export type PurchaseParseResult = {
  rows: ParsedPurchaseRow[];
  errors: ParseError[];
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

const HEADER_ALIASES: Record<string, string[]> = {
  storeCode: ["boutique", "code", "code_boutique", "code boutique", "magasin"],
  depotCode: ["depot", "code_depot", "code depot", "dps"],
  date: ["date", "jour"],
  reference: ["reference", "ref", "bl", "n_bl", "no_bl", "facture", "piece"],
  amount: ["montant", "montant_ttc", "total", "montant_ht"],
};

export function parsePurchaseCsv(text: string): PurchaseParseResult {
  const errors: ParseError[] = [];
  const rows: ParsedPurchaseRow[] = [];

  const content = text.replace(/^\uFEFF/, "");
  if (content.trim() === "") {
    return { rows, errors: [{ line: 1, message: "Fichier vide." }] };
  }

  const headerLine = content.split(/\r?\n/, 1)[0] ?? "";
  const delimiter =
    (headerLine.match(/;/g)?.length ?? 0) >= (headerLine.match(/,/g)?.length ?? 0)
      ? ";"
      : ",";

  const parsed = Papa.parse<string[]>(content, {
    delimiter,
    skipEmptyLines: "greedy",
  });

  const [rawHeader, ...dataRows] = parsed.data;
  if (!rawHeader || rawHeader.length === 0) {
    return { rows, errors: [{ line: 1, message: "En-tête introuvable." }] };
  }

  const columns: Partial<Record<keyof typeof HEADER_ALIASES, number>> = {};
  rawHeader.forEach((cell, index) => {
    const name = normalize(cell);
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(name) && columns[key as keyof typeof HEADER_ALIASES] === undefined) {
        columns[key as keyof typeof HEADER_ALIASES] = index;
      }
    }
  });

  for (const required of ["storeCode", "depotCode", "date", "reference", "amount"] as const) {
    if (columns[required] === undefined) {
      const labels: Record<string, string> = {
        storeCode: "boutique",
        depotCode: "depot",
        date: "date",
        reference: "reference",
        amount: "montant",
      };
      errors.push({
        line: 1,
        message: `Colonne « ${labels[required]} » introuvable dans l'en-tête.`,
      });
    }
  }
  if (errors.length > 0) return { rows, errors };

  dataRows.forEach((cells, index) => {
    const line = index + 2; // 1 = en-tête
    const get = (key: keyof typeof HEADER_ALIASES) =>
      (cells[columns[key]!] ?? "").trim();

    const storeCode = get("storeCode");
    if (!storeCode) {
      errors.push({ line, message: "Code boutique manquant." });
      return;
    }
    const depotCode = get("depotCode");
    if (!depotCode) {
      errors.push({ line, message: "Code dépôt manquant." });
      return;
    }
    const date = parseFrenchDate(get("date"));
    if (!date) {
      errors.push({
        line,
        message: `Date invalide : « ${get("date")} » (attendu JJ/MM/AAAA ou AAAA-MM-JJ).`,
      });
      return;
    }
    const reference = get("reference");
    if (!reference) {
      errors.push({ line, message: "Référence (BL / facture) manquante." });
      return;
    }
    const amount = parseFrenchAmount(get("amount"));
    if (amount === null) {
      errors.push({ line, message: `Montant illisible : « ${get("amount")} ».` });
      return;
    }

    rows.push({
      storeCode,
      depotCode: depotCode.toUpperCase(),
      date,
      reference,
      amount,
    });
  });

  return { rows, errors };
}
