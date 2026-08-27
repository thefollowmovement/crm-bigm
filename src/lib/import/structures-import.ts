// Mapping PUR de l'import du référentiel Structures (étape 46, cdc §3.3).
// Colonnes réelles de l'export comptable : Code, Nom, Nom du contact,
// Téléphone, E-mail, Encours disponible, Date Dernière Commande, Adresse 1,
// Code Postal, Ville, N° TVA intracom, SIRET, Société.
import {
  parseFrenchAmount,
  parseFrenchDate,
  type ParseError,
} from "@/lib/csv/revenue-import";
import { excelSerialToIsoDate } from "./tabular";

export type ParsedStructureRow = {
  code: string;
  name: string;
  company: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  creditAvailable: string | null; // "1234.56" — string numeric
  lastOrderDate: string | null; // ISO YYYY-MM-DD
  address: string | null;
  postalCode: string | null;
  city: string | null;
  vatNumber: string | null;
  siret: string | null;
};

export type StructureParseResult = {
  rows: ParsedStructureRow[];
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
  code: ["code", "code client", "code tiers", "compte"],
  name: ["nom", "intitule", "libelle"],
  company: ["societe", "raison sociale"],
  contactName: ["nom du contact", "contact", "nom contact"],
  phone: ["telephone", "tel", "tel.", "portable"],
  email: ["e-mail", "email", "mail", "adresse e-mail"],
  creditAvailable: ["encours disponible", "encours", "en-cours disponible"],
  lastOrderDate: [
    "date derniere commande",
    "derniere commande",
    "date dern. commande",
  ],
  address: ["adresse 1", "adresse", "adresse1"],
  postalCode: ["code postal", "cp"],
  city: ["ville", "commune"],
  vatNumber: [
    "n tva intracom",
    "tva intracom",
    "n tva intracommunautaire",
    "tva intracommunautaire",
    "numero tva",
  ],
  siret: ["siret", "n siret", "siren"],
};

type ColumnKey = keyof typeof HEADER_ALIASES;

// La 1re ligne est l'en-tête ; seules les colonnes Code et Nom sont exigées.
export function parseStructureRows(matrix: string[][]): StructureParseResult {
  const errors: ParseError[] = [];
  const rows: ParsedStructureRow[] = [];

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

  for (const required of ["code", "name"] as const) {
    if (columns[required] === undefined) {
      errors.push({
        line: 1,
        message: `Colonne « ${required === "code" ? "Code" : "Nom"} » introuvable dans l'en-tête.`,
      });
    }
  }
  if (errors.length > 0) return { rows, errors };

  const seenCodes = new Set<string>();
  dataRows.forEach((cells, index) => {
    const line = index + 2; // 1 = en-tête
    const get = (key: ColumnKey): string | null => {
      const col = columns[key];
      if (col === undefined) return null;
      const value = (cells[col] ?? "").trim();
      return value === "" ? null : value;
    };

    const code = get("code");
    if (!code) {
      errors.push({ line, message: "Code structure manquant." });
      return;
    }
    if (seenCodes.has(code)) {
      errors.push({
        line,
        message: `Code « ${code} » présent plusieurs fois dans le fichier.`,
      });
      return;
    }
    const name = get("name");
    if (!name) {
      errors.push({ line, message: `Nom manquant pour le code « ${code} ».` });
      return;
    }

    let creditAvailable: string | null = null;
    const rawCredit = get("creditAvailable");
    if (rawCredit !== null) {
      creditAvailable = parseFrenchAmount(rawCredit);
      if (creditAvailable === null) {
        errors.push({
          line,
          message: `Encours illisible : « ${rawCredit} » (code ${code}).`,
        });
        return;
      }
    }

    let lastOrderDate: string | null = null;
    const rawDate = get("lastOrderDate");
    if (rawDate !== null) {
      lastOrderDate = parseFrenchDate(rawDate) ?? excelSerialToIsoDate(rawDate);
      if (lastOrderDate === null) {
        errors.push({
          line,
          message: `Date de dernière commande invalide : « ${rawDate} » (code ${code}).`,
        });
        return;
      }
    }

    seenCodes.add(code);
    rows.push({
      code,
      name,
      company: get("company"),
      contactName: get("contactName"),
      phone: get("phone"),
      email: get("email"),
      creditAvailable,
      lastOrderDate,
      address: get("address"),
      postalCode: get("postalCode"),
      city: get("city"),
      vatNumber: get("vatNumber"),
      siret: get("siret"),
    });
  });

  return { rows, errors };
}
