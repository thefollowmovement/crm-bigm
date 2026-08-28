// Lecture des fichiers tabulaires des imports comptables (étape 46).
// Formats : .xlsx / .xls / .xlsb (export natif du logiciel comptable) / .csv.
// La détection se fait par SIGNATURE BINAIRE (cdc §3.3), jamais par la seule
// extension : un .xlsb renommé en .xlsx doit être lu correctement.
import Papa from "papaparse";
import * as XLSX from "xlsx";

export type TabularFormat = "xlsx" | "xls" | "xlsb" | "csv";

const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // PK\x03\x04
const CFB_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]); // OLE2 (xls)

// Détecte le format réel du fichier. null = format non reconnu.
export function detectTabularFormat(
  buffer: Buffer,
  fileName: string
): TabularFormat | null {
  if (buffer.length < 8) return null;
  if (buffer.subarray(0, 4).equals(ZIP_SIGNATURE)) {
    // xlsx et xlsb sont tous deux des zips : on cherche le nom du workbook
    // dans l'archive (workbook.bin = xlsb, workbook.xml = xlsx).
    const head = buffer.toString("latin1");
    if (head.includes("workbook.bin") || head.includes("xl/worksheets/sheet1.bin")) {
      return "xlsb";
    }
    if (fileName.toLowerCase().endsWith(".xlsb") && !head.includes("workbook.xml")) {
      return "xlsb";
    }
    return "xlsx";
  }
  if (buffer.subarray(0, 4).equals(CFB_SIGNATURE)) return "xls";
  // Texte plausible (pas d'octet NUL dans le premier Ko) → CSV.
  const probe = buffer.subarray(0, 1024);
  for (const byte of probe) {
    if (byte === 0) return null;
  }
  return "csv";
}

// Découpe un texte CSV en matrice de cellules (séparateur ; ou , détecté sur
// l'en-tête, BOM toléré) — même tolérance que les imports CSV existants.
export function csvToMatrix(text: string): string[][] {
  const content = text.replace(/^\uFEFF/, "");
  if (content.trim() === "") return [];
  const headerLine = content.split(/\r?\n/, 1)[0] ?? "";
  const delimiter =
    (headerLine.match(/;/g)?.length ?? 0) >= (headerLine.match(/,/g)?.length ?? 0)
      ? ";"
      : ",";
  const parsed = Papa.parse<string[]>(content, {
    delimiter,
    skipEmptyLines: "greedy",
  });
  return parsed.data.map((row) => row.map((cell) => (cell ?? "").trim()));
}

export type TabularFile = { format: TabularFormat; rows: string[][] };

// Lit le fichier en matrice de chaînes (1re feuille pour Excel). Les cellules
// sont les valeurs AFFICHÉES (raw:false) : dates « JJ/MM/AAAA », montants
// éventuellement « 1 234,56 » — les parseurs français en aval les acceptent.
export function readTabularFile(
  buffer: Buffer,
  fileName: string
): TabularFile | { error: string } {
  const format = detectTabularFormat(buffer, fileName);
  if (!format) {
    return {
      error:
        "Format de fichier non reconnu. Formats acceptés : .xlsx, .xls, .xlsb, .csv.",
    };
  }
  if (format === "csv") {
    return { format, rows: csvToMatrix(buffer.toString("utf8")) };
  }
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: false, cellNF: true });
  } catch {
    return { error: "Fichier Excel illisible ou corrompu." };
  }
  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet || !sheet["!ref"]) {
    return { error: "Le classeur ne contient aucune feuille." };
  }
  // Lecture par VALEUR de cellule, pas par texte affiché : les exports
  // comptables affichent « 939988.98  EUR » (format monétaire) et des dates
  // américaines « 5/7/26 » — on lit le nombre et le numéro de série de date
  // sous-jacents pour rester indépendant du format d'affichage.
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const rows: string[][] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: string[] = [];
    let hasContent = false;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })] as
        | XLSX.CellObject
        | undefined;
      const value = cellToString(cell);
      if (value !== "") hasContent = true;
      row.push(value);
    }
    if (hasContent) rows.push(row);
  }
  return { format, rows };
}

function cellToString(cell: XLSX.CellObject | undefined): string {
  if (!cell || cell.v === undefined || cell.v === null) return "";
  switch (cell.t) {
    case "n": {
      const value = cell.v as number;
      // Cellule numérique au format DATE → ISO, quel que soit l'affichage.
      if (cell.z && XLSX.SSF.is_date(String(cell.z))) {
        return serialToIsoDate(value);
      }
      // Montant : deux décimales ; entier (code, SIRET…) : tel quel.
      return Number.isInteger(value) ? String(value) : value.toFixed(2);
    }
    case "d": {
      const d = cell.v as Date;
      const year = d.getUTCFullYear();
      const month = String(d.getUTCMonth() + 1).padStart(2, "0");
      const day = String(d.getUTCDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
    case "b":
      return cell.v ? "1" : "0";
    default:
      return String(cell.v).trim();
  }
}

// Numéro de série Excel (jours depuis le 30/12/1899) → ISO.
function serialToIsoDate(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const d = new Date(ms);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Retire un éventuel suffixe monétaire (« 939988.98  EUR », « 12,50 € »)
// avant le parsing du montant — présent quand la cellule est du TEXTE.
export function stripCurrencySuffix(value: string): string {
  return value.replace(/\s*(?:EUR|€)\s*$/i, "").trim();
}

// Les exports Excel livrent parfois une date en « numéro de série » (jours
// depuis le 30/12/1899) quand la cellule n'a pas de format de date.
export function excelSerialToIsoDate(value: string): string | null {
  if (!/^\d{4,6}$/.test(value)) return null;
  const serial = Number(value);
  // Plage plausible ~1954-2064. À n'appliquer QUE sur des colonnes attendues
  // comme dates (un code postal à 5 chiffres passerait le test).
  if (serial < 20000 || serial > 60000) return null;
  const ms = Math.round((serial - 25569) * 86400 * 1000); // 25569 = 01/01/1970
  const d = new Date(ms);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
