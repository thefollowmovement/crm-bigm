// Parseur PUR de l'import CSV de chiffre d'affaires — aucune dépendance à la
// base, testé exhaustivement en unit. Tolérant aux exports Excel français :
// BOM, séparateur ; ou , , en-têtes accentués, dates JJ/MM/AAAA, montants
// « 1 234,56 ».
import Papa from "papaparse";

export type RevenueChannel =
  | "SUR_PLACE"
  | "EMPORTE"
  | "TABLETTE"
  | "UBER_EATS"
  | "DELIVEROO"
  | "AUTRE";

export type ParsedRevenueRow = {
  storeCode: string;
  date: string; // ISO YYYY-MM-DD
  channel: RevenueChannel;
  channelLabel: string | null;
  grossAmount: string; // "1234.56"
  netAmount: string | null;
};

export type ParseError = { line: number; message: string };

export type ParseResult = { rows: ParsedRevenueRow[]; errors: ParseError[] };

// Normalisation : minuscules, sans accents, sans espaces superflus.
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
  channel: ["canal", "channel"],
  gross: ["montant_brut", "montant brut", "brut", "montant", "ca_brut", "ca brut", "ca"],
  net: ["montant_net", "montant net", "net", "ca_net", "ca net"],
};

const CHANNEL_ALIASES: Record<string, RevenueChannel> = {
  sur_place: "SUR_PLACE",
  "sur place": "SUR_PLACE",
  emporte: "EMPORTE",
  "a emporter": "EMPORTE",
  tablette: "TABLETTE",
  "tablette big m": "TABLETTE",
  uber_eats: "UBER_EATS",
  "uber eats": "UBER_EATS",
  ubereats: "UBER_EATS",
  deliveroo: "DELIVEROO",
  autre: "AUTRE",
};

function resolveChannel(raw: string): RevenueChannel | null {
  const normalized = normalize(raw).replace(/\s+/g, " ");
  return CHANNEL_ALIASES[normalized] ?? CHANNEL_ALIASES[normalized.replace(/ /g, "_")] ?? null;
}

// "1 234,56" / "1234.56" / "1234" → "1234.56" ; null si illisible.
export function parseFrenchAmount(raw: string): string | null {
  // retire espaces normaux, insécables et fines, symbole €
  const cleaned = raw.replace(/[\s\u00A0\u202F€]/g, "");
  if (cleaned === "") return null;
  const dotted = cleaned.replace(",", ".");
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(dotted)) return null;
  const [int, dec = ""] = dotted.replace("-", "").split(".");
  const sign = dotted.startsWith("-") ? "-" : "";
  return `${sign}${int}.${dec.padEnd(2, "0")}`;
}

// "21/08/2026" ou "2026-08-21" → ISO ; null si invalide.
export function parseFrenchDate(raw: string): string | null {
  const value = raw.trim();
  let year: number, month: number, day: number;
  const fr = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (fr) {
    day = Number(fr[1]);
    month = Number(fr[2]);
    year = Number(fr[3]);
  } else if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else {
    return null;
  }
  if (month < 1 || month > 12 || day < 1) return null;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > lastDay) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseRevenueCsv(text: string): ParseResult {
  const errors: ParseError[] = [];
  const rows: ParsedRevenueRow[] = [];

  // BOM éventuel
  const content = text.replace(/^\uFEFF/, "");
  if (content.trim() === "") {
    return { rows, errors: [{ line: 1, message: "Fichier vide." }] };
  }

  // Auto-détection du séparateur sur la ligne d'en-tête.
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

  // Résolution des colonnes par alias.
  const columns: Partial<Record<keyof typeof HEADER_ALIASES, number>> = {};
  rawHeader.forEach((cell, index) => {
    const name = normalize(cell);
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(name) && columns[key as keyof typeof HEADER_ALIASES] === undefined) {
        columns[key as keyof typeof HEADER_ALIASES] = index;
      }
    }
  });

  for (const required of ["storeCode", "date", "channel", "gross"] as const) {
    if (columns[required] === undefined) {
      const labels: Record<string, string> = {
        storeCode: "boutique",
        date: "date",
        channel: "canal",
        gross: "montant_brut",
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

    const channelRaw = get("channel");
    const channel = resolveChannel(channelRaw);
    if (!channel) {
      errors.push({ line, message: `Canal inconnu : « ${channelRaw} ».` });
      return;
    }

    const grossAmount = parseFrenchAmount(get("gross"));
    if (grossAmount === null) {
      errors.push({
        line,
        message: `Montant brut illisible : « ${get("gross")} ».`,
      });
      return;
    }

    let netAmount: string | null = null;
    if (columns.net !== undefined && get("net") !== "") {
      netAmount = parseFrenchAmount(get("net"));
      if (netAmount === null) {
        errors.push({
          line,
          message: `Montant net illisible : « ${get("net")} ».`,
        });
        return;
      }
    }

    rows.push({
      storeCode,
      date,
      channel,
      channelLabel: channel === "AUTRE" ? channelRaw : null,
      grossAmount,
      netAmount,
    });
  });

  return { rows, errors };
}
