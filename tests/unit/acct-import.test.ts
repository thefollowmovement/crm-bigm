import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import {
  csvToMatrix,
  detectTabularFormat,
  excelSerialToIsoDate,
  readTabularFile,
} from "@/lib/import/tabular";
import { parseStructureRows } from "@/lib/import/structures-import";

const HEADER = [
  "Code",
  "Nom",
  "Nom du contact",
  "Téléphone",
  "E-mail",
  "Encours disponible",
  "Date Dernière Commande",
  "Adresse 1",
  "Code Postal",
  "Ville",
  "N° TVA intracom",
  "SIRET",
  "Société",
];

const ROW = [
  "411CDPS",
  "Central DPS",
  "Farid Benali",
  "01 23 45 67 89",
  "compta@dps.fr",
  "1 250,50",
  "15/07/2026",
  "12 rue des Volailles",
  "75011",
  "Paris",
  "FR12345678901",
  "12345678900012",
  "DPS SAS",
];

function workbookBuffer(bookType: XLSX.BookType): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([HEADER, ROW]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Feuille1");
  return XLSX.write(wb, { bookType, type: "buffer" }) as Buffer;
}

describe("détection du format par signature binaire", () => {
  it("reconnaît un .xlsx (zip) même mal nommé", () => {
    const buffer = workbookBuffer("xlsx");
    expect(detectTabularFormat(buffer, "export.xlsx")).toBe("xlsx");
    expect(detectTabularFormat(buffer, "export.csv")).toBe("xlsx");
  });

  it("distingue le .xlsb du .xlsx (workbook binaire dans le zip)", () => {
    const buffer = workbookBuffer("xlsb");
    expect(detectTabularFormat(buffer, "export.xlsb")).toBe("xlsb");
  });

  it("reconnaît un .xls (conteneur OLE2)", () => {
    const buffer = workbookBuffer("biff8");
    expect(detectTabularFormat(buffer, "export.xls")).toBe("xls");
  });

  it("traite un texte comme CSV et rejette un binaire inconnu", () => {
    expect(detectTabularFormat(Buffer.from("Code;Nom\nA;B\n"), "f.csv")).toBe("csv");
    const binary = Buffer.alloc(64);
    binary[10] = 0; // octet NUL → pas du texte
    expect(detectTabularFormat(binary, "f.bin")).toBeNull();
  });
});

describe("lecture des fichiers tabulaires", () => {
  it.each(["xlsx", "xlsb", "biff8"] as XLSX.BookType[])(
    "lit l'en-tête et les cellules d'un classeur %s",
    (bookType) => {
      const result = readTabularFile(workbookBuffer(bookType), "export.tmp");
      if ("error" in result) throw new Error(result.error);
      expect(result.rows[0]).toEqual(HEADER);
      expect(result.rows[1][0]).toBe("411CDPS");
      expect(result.rows[1][1]).toBe("Central DPS");
    }
  );

  it("découpe un CSV ; ou , avec BOM", () => {
    expect(csvToMatrix("﻿Code;Nom\n411A;Alpha\n")).toEqual([
      ["Code", "Nom"],
      ["411A", "Alpha"],
    ]);
    expect(csvToMatrix("Code,Nom\n411A,Alpha\n")).toEqual([
      ["Code", "Nom"],
      ["411A", "Alpha"],
    ]);
  });
});

describe("numéros de série Excel", () => {
  it("convertit un serial plausible en date ISO", () => {
    // 46199 = 26/06/2026 (jours depuis le 30/12/1899)
    expect(excelSerialToIsoDate("46199")).toBe("2026-06-26");
  });
  it("refuse les valeurs hors plage ou non numériques", () => {
    expect(excelSerialToIsoDate("75011")).toBeNull(); // code postal
    expect(excelSerialToIsoDate("12/07/2026")).toBeNull();
  });
});

describe("mapping du référentiel Structures", () => {
  it("mappe toutes les colonnes réelles de l'export comptable", () => {
    const { rows, errors } = parseStructureRows([HEADER, ROW]);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      code: "411CDPS",
      name: "Central DPS",
      contactName: "Farid Benali",
      email: "compta@dps.fr",
      creditAvailable: "1250.50",
      lastOrderDate: "2026-07-15",
      postalCode: "75011",
      city: "Paris",
      vatNumber: "FR12345678901",
      siret: "12345678900012",
      company: "DPS SAS",
    });
  });

  it("signale l'absence des colonnes Code / Nom", () => {
    const { errors } = parseStructureRows([["Ville"], ["Paris"]]);
    expect(errors.map((e) => e.message).join(" ")).toContain("Code");
  });

  it("erreurs ligne à ligne sans bloquer les autres lignes", () => {
    const { rows, errors } = parseStructureRows([
      ["Code", "Nom", "Encours disponible"],
      ["411A", "Alpha", "10,00"],
      ["", "Sans code", ""],
      ["411B", "", ""],
      ["411C", "Gamma", "pas-un-montant"],
      ["411A", "Doublon fichier", ""],
      ["411D", "Delta", ""],
    ]);
    expect(rows.map((r) => r.code)).toEqual(["411A", "411D"]);
    expect(errors).toHaveLength(4);
    expect(errors[0].line).toBe(3);
  });

  it("une date en numéro de série Excel est acceptée", () => {
    const { rows, errors } = parseStructureRows([
      ["Code", "Nom", "Date Dernière Commande"],
      ["411A", "Alpha", "46199"],
    ]);
    expect(errors).toEqual([]);
    expect(rows[0].lastOrderDate).toBe("2026-06-26");
  });
});
