// Mapping PUR de l'import du journal Factures / Avoirs (étape 47, cdc §3.3).
// Colonnes réelles de l'export comptable : Type de pièce, N° pièce,
// Date Pièce, Client, Société, Total HT, Total TVA, Total TTC.
// Le champ « Client » correspond au champ « Code » du référentiel Structures.
import {
  parseFrenchAmount,
  parseFrenchDate,
  type ParseError,
} from "@/lib/csv/revenue-import";
import { fromCents, toCents } from "@/lib/money";
import { excelSerialToIsoDate } from "./tabular";

export type ParsedInvoiceRow = {
  line: number; // ligne du fichier source (rapports d'erreur du service)
  pieceNumber: string;
  pieceType: "FACTURE" | "AVOIR";
  pieceDate: string; // ISO YYYY-MM-DD
  clientCode: string;
  company: string | null;
  amountHT: string;
  amountVAT: string;
  amountTTC: string;
};

export type InvoiceParseResult = {
  rows: ParsedInvoiceRow[];
  errors: ParseError[];
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[°º]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const HEADER_ALIASES: Record<string, string[]> = {
  pieceType: ["type de piece", "type piece", "type"],
  pieceNumber: ["n piece", "no piece", "numero de piece", "numero piece", "piece"],
  pieceDate: ["date piece", "date"],
  clientCode: ["client", "code client", "code tiers", "code"],
  company: ["societe", "raison sociale"],
  amountHT: ["total ht", "montant ht", "ht"],
  amountVAT: ["total tva", "montant tva", "tva"],
  amountTTC: ["total ttc", "montant ttc", "ttc"],
};

type ColumnKey = keyof typeof HEADER_ALIASES;

const PIECE_TYPES: Record<string, "FACTURE" | "AVOIR"> = {
  facture: "FACTURE",
  fa: "FACTURE",
  f: "FACTURE",
  fc: "FACTURE",
  avoir: "AVOIR",
  av: "AVOIR",
  a: "AVOIR",
};

export function parseInvoiceRows(matrix: string[][]): InvoiceParseResult {
  const errors: ParseError[] = [];
  const rows: ParsedInvoiceRow[] = [];

  const [rawHeader, ...dataRows] = matrix;
  if (!rawHeader || rawHeader.length === 0) {
    return { rows, errors: [{ line: 1, message: "En-tête introuvable." }] };
  }

  const columns: Partial<Record<ColumnKey, number>> = {};
  rawHeader.forEach((cell, index) => {
    const name = normalize(cell);
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(name) && columns[key as ColumnKey] === undefined) {
        columns[key as ColumnKey] = index;
      }
    }
  });

  const requiredLabels: Partial<Record<ColumnKey, string>> = {
    pieceType: "Type de pièce",
    pieceNumber: "N° pièce",
    pieceDate: "Date Pièce",
    clientCode: "Client",
    amountHT: "Total HT",
    amountTTC: "Total TTC",
  };
  for (const [key, label] of Object.entries(requiredLabels)) {
    if (columns[key as ColumnKey] === undefined) {
      errors.push({
        line: 1,
        message: `Colonne « ${label} » introuvable dans l'en-tête.`,
      });
    }
  }
  if (errors.length > 0) return { rows, errors };

  const seenPieces = new Set<string>();
  dataRows.forEach((cells, index) => {
    const line = index + 2;
    const get = (key: ColumnKey): string | null => {
      const col = columns[key];
      if (col === undefined) return null;
      const value = (cells[col] ?? "").trim();
      return value === "" ? null : value;
    };

    const pieceNumber = get("pieceNumber");
    if (!pieceNumber) {
      errors.push({ line, message: "N° de pièce manquant." });
      return;
    }
    if (seenPieces.has(pieceNumber)) {
      errors.push({
        line,
        message: `Pièce « ${pieceNumber} » présente plusieurs fois dans le fichier.`,
      });
      return;
    }

    const rawType = get("pieceType");
    const pieceType = rawType ? PIECE_TYPES[normalize(rawType)] : undefined;
    if (!pieceType) {
      errors.push({
        line,
        message: `Type de pièce invalide : « ${rawType ?? ""} » (attendu Facture ou Avoir) — pièce ${pieceNumber}.`,
      });
      return;
    }

    const rawDate = get("pieceDate");
    const pieceDate = rawDate
      ? (parseFrenchDate(rawDate) ?? excelSerialToIsoDate(rawDate))
      : null;
    if (!pieceDate) {
      errors.push({
        line,
        message: `Date de pièce invalide : « ${rawDate ?? ""} » — pièce ${pieceNumber}.`,
      });
      return;
    }

    const clientCode = get("clientCode");
    if (!clientCode) {
      errors.push({ line, message: `Client manquant — pièce ${pieceNumber}.` });
      return;
    }

    const rawHT = get("amountHT");
    const amountHT = rawHT !== null ? parseFrenchAmount(rawHT) : null;
    if (amountHT === null) {
      errors.push({
        line,
        message: `Total HT illisible : « ${rawHT ?? ""} » — pièce ${pieceNumber}.`,
      });
      return;
    }
    const rawTTC = get("amountTTC");
    const amountTTC = rawTTC !== null ? parseFrenchAmount(rawTTC) : null;
    if (amountTTC === null) {
      errors.push({
        line,
        message: `Total TTC illisible : « ${rawTTC ?? ""} » — pièce ${pieceNumber}.`,
      });
      return;
    }
    // TVA absente → déduite TTC − HT (en centimes entiers, jamais en float).
    let amountVAT: string;
    const rawVAT = get("amountVAT");
    if (rawVAT !== null) {
      const parsed = parseFrenchAmount(rawVAT);
      if (parsed === null) {
        errors.push({
          line,
          message: `Total TVA illisible : « ${rawVAT} » — pièce ${pieceNumber}.`,
        });
        return;
      }
      amountVAT = parsed;
    } else {
      amountVAT = fromCents(toCents(amountTTC) - toCents(amountHT));
    }

    seenPieces.add(pieceNumber);
    rows.push({
      line,
      pieceNumber,
      pieceType,
      pieceDate,
      clientCode,
      company: get("company"),
      amountHT,
      amountVAT,
      amountTTC,
    });
  });

  return { rows, errors };
}
