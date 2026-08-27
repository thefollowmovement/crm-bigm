import { beforeEach, afterAll, describe, expect, it } from "vitest";

import { db, pool } from "@/lib/db/client";
import { acctStructures } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/authz/guards";
import {
  createStructure,
  getStructure,
  importStructures,
  listStructures,
  updateStructure,
} from "@/services/acct-structures.service";
import { resetDb } from "./setup/reset-db";
import { createTestUser } from "../helpers/factories";

function asSession(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: SessionUser["role"];
  pole: SessionUser["pole"];
  franchiseeId: string | null;
}): SessionUser {
  return { ...user };
}

function csvFile(content: string, name = "structures.csv"): File {
  return new File([Buffer.from(content, "utf8")], name, { type: "text/csv" });
}

const BASE_INPUT = {
  code: "411CDPS",
  name: "Central DPS",
  type: "DPS" as const,
};

describe("référentiel des structures comptables", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("création + unicité du code + périmètre compta", async () => {
    const compta = asSession(await createTestUser({ role: "COMPTABILITE" }));
    const structure = await createStructure(compta, BASE_INPUT);
    expect(structure.code).toBe("411CDPS");
    expect(structure.isActive).toBe(true);

    await expect(createStructure(compta, BASE_INPUT)).rejects.toThrow(
      /existe déjà/
    );

    const rh = asSession(await createTestUser({ role: "RH" }));
    await expect(createStructure(rh, BASE_INPUT)).rejects.toThrow(ForbiddenError);
    await expect(listStructures(rh)).rejects.toThrow(ForbiddenError);
  });

  it("mise à jour, désactivation et filtres de liste", async () => {
    const compta = asSession(await createTestUser({ role: "COMPTABILITE" }));
    const a = await createStructure(compta, BASE_INPUT);
    await createStructure(compta, {
      code: "411ORAN",
      name: "Orangina",
      type: "FOURNISSEUR",
    });

    await updateStructure(compta, a.id, { isActive: false, city: "Paris" });
    const updated = await getStructure(compta, a.id);
    expect(updated?.isActive).toBe(false);
    expect(updated?.city).toBe("Paris");

    const actives = await listStructures(compta, { active: "actives" });
    expect(actives.map((s) => s.code)).toEqual(["411ORAN"]);
    const search = await listStructures(compta, { q: "orang" });
    expect(search.map((s) => s.code)).toEqual(["411ORAN"]);
    const parType = await listStructures(compta, { type: "DPS" });
    expect(parType.map((s) => s.code)).toEqual(["411CDPS"]);
  });

  it("import CSV : créations, rapport détaillé, fichier conservé", async () => {
    const compta = asSession(await createTestUser({ role: "COMPTABILITE" }));
    const report = await importStructures(
      compta,
      csvFile(
        [
          "Code;Nom;Société;Ville;Encours disponible;Date Dernière Commande",
          "411CDPS;Central DPS;DPS SAS;Lyon;1 250,50;15/07/2026",
          "411ORAN;Orangina;Suntory;Paris;0,00;01/06/2026",
          ";Sans code;;;;",
        ].join("\n")
      ),
      "METTRE_A_JOUR"
    );

    expect(report.status).toBe("TERMINE");
    expect(report.createdRows).toBe(2);
    expect(report.updatedRows).toBe(0);
    expect(report.skippedRows).toBe(0);
    expect(report.totalRows).toBe(3);
    expect(report.fileId).not.toBeNull();
    const errors = report.errors as { line: number; message: string }[];
    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(4);

    const created = await listStructures(compta);
    expect(created.map((s) => s.code).sort()).toEqual(["411CDPS", "411ORAN"]);
    expect(created.find((s) => s.code === "411CDPS")?.creditAvailable).toBe(
      "1250.50"
    );
    expect(created.find((s) => s.code === "411CDPS")?.lastOrderDate).toBe(
      "2026-07-15"
    );
  });

  it("doublons : mis à jour ou ignorés selon le mode, sans écraser par du vide", async () => {
    const compta = asSession(await createTestUser({ role: "COMPTABILITE" }));
    await createStructure(compta, {
      ...BASE_INPUT,
      city: "Lyon",
      contactName: "Contact initial",
    });

    // Mode IGNORER : rien ne bouge.
    const ignored = await importStructures(
      compta,
      csvFile("Code;Nom;Ville\n411CDPS;Nouveau nom;Marseille\n"),
      "IGNORER"
    );
    expect(ignored.skippedRows).toBe(1);
    expect(ignored.createdRows).toBe(0);
    let structure = (await listStructures(compta))[0];
    expect(structure.name).toBe("Central DPS");
    expect(structure.city).toBe("Lyon");

    // Mode METTRE_A_JOUR : champs fournis réécrits, champs absents conservés.
    const updated = await importStructures(
      compta,
      csvFile("Code;Nom;Ville\n411CDPS;Central DPS bis;Marseille\n411NEW;Nouveau;Nice\n"),
      "METTRE_A_JOUR"
    );
    expect(updated.updatedRows).toBe(1);
    expect(updated.createdRows).toBe(1);
    structure = (await listStructures(compta)).find((s) => s.code === "411CDPS")!;
    expect(structure.name).toBe("Central DPS bis");
    expect(structure.city).toBe("Marseille");
    // Colonne absente du fichier → valeur existante conservée.
    expect(structure.contactName).toBe("Contact initial");

    const all = await db.select().from(acctStructures);
    expect(all).toHaveLength(2);
  });

  it("import xlsb : le format binaire du logiciel comptable est lu", async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([
      ["Code", "Nom", "Ville"],
      ["411XLSB", "Import binaire", "Toulouse"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Export");
    const buffer = XLSX.write(wb, { bookType: "xlsb", type: "buffer" }) as Buffer;
    const compta = asSession(await createTestUser({ role: "COMPTABILITE" }));

    const report = await importStructures(
      compta,
      new File([new Uint8Array(buffer)], "export.xlsb", {
        type: "application/vnd.ms-excel.sheet.binary.macroEnabled.12",
      }),
      "METTRE_A_JOUR"
    );
    expect(report.format).toBe("xlsb");
    expect(report.createdRows).toBe(1);
    const rows = await listStructures(compta);
    expect(rows[0].name).toBe("Import binaire");
  });
});
