// Parseur PUR de l'import CSV des ventes par produit — mêmes tolérances que
// l'import de CA (BOM, ; ou , , dates françaises, montants « 1 234,56 »).
// Colonnes : boutique;date;produit;quantite;montant (montant facultatif).
import Papa from "papaparse";

import {
  parseFrenchAmount,
  parseFrenchDate,
  parseFrenchInteger,
  type ParseError,
} from "./revenue-import";

export type ParsedProductSaleRow = {
  storeCode: string;
  date: string; // ISO YYYY-MM-DD
  productCode: string;
  quantity: number;
  amount: string | null; // CA du produit sur la journée
};

export type ProductSalesParseResult = {
  rows: ParsedProductSaleRow[];
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
  date: ["date", "jour"],
  productCode: ["produit", "code_produit", "code produit", "article", "ref", "reference"],
  quantity: ["quantite", "qte", "qty", "nb", "nombre"],
  amount: ["montant", "montant_ttc", "ca", "ca_produit", "ca produit", "total"],
};

export function parseProductSalesCsv(text: string): ProductSalesParseResult {
  const errors: ParseError[] = [];
  const rows: ParsedProductSaleRow[] = [];

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

  for (const required of ["storeCode", "date", "productCode", "quantity"] as const) {
    if (columns[required] === undefined) {
      const labels: Record<string, string> = {
        storeCode: "boutique",
        date: "date",
        productCode: "produit",
        quantity: "quantite",
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

    const date = parseFrenchDate(get("date"));
    if (!date) {
      errors.push({
        line,
        message: `Date invalide : « ${get("date")} » (attendu JJ/MM/AAAA ou AAAA-MM-JJ).`,
      });
      return;
    }

    const productCode = get("productCode");
    if (!productCode) {
      errors.push({ line, message: "Code produit manquant." });
      return;
    }

    const quantity = parseFrenchInteger(get("quantity"));
    if (quantity === null) {
      errors.push({
        line,
        message: `Quantité invalide : « ${get("quantity")} » (entier attendu).`,
      });
      return;
    }

    let amount: string | null = null;
    if (columns.amount !== undefined && get("amount") !== "") {
      amount = parseFrenchAmount(get("amount"));
      if (amount === null) {
        errors.push({
          line,
          message: `Montant illisible : « ${get("amount")} ».`,
        });
        return;
      }
    }

    rows.push({ storeCode, date, productCode: productCode.toUpperCase(), quantity, amount });
  });

  return { rows, errors };
}
