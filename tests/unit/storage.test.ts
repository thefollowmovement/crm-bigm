import { describe, expect, it } from "vitest";

import { buildStoragePath, validateUpload } from "@/lib/files/storage";

describe("validation des uploads", () => {
  it("accepte un PDF de taille raisonnable", () => {
    const result = validateUpload({ originalName: "contrat.pdf", sizeBytes: 1024 });
    expect(result).toEqual({ ok: true, extension: "pdf" });
  });

  it("normalise l'extension en minuscules", () => {
    const result = validateUpload({ originalName: "PHOTO.JPG", sizeBytes: 500 });
    expect(result).toEqual({ ok: true, extension: "jpg" });
  });

  it("refuse un fichier vide", () => {
    const result = validateUpload({ originalName: "vide.pdf", sizeBytes: 0 });
    expect(result.ok).toBe(false);
  });

  it("refuse un type non autorisé", () => {
    for (const name of ["script.exe", "archive.zip", "page.html", "sans-extension"]) {
      const result = validateUpload({ originalName: name, sizeBytes: 100 });
      expect(result.ok, name).toBe(false);
    }
  });

  it("refuse un fichier dépassant la taille maximale", () => {
    const tooBig = 26 * 1024 * 1024; // défaut : 25 Mo
    const result = validateUpload({ originalName: "gros.pdf", sizeBytes: tooBig });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("volumineux");
  });
});

describe("chemin de stockage", () => {
  it("suit le motif AAAA/MM/<uuid>.<ext> sans le nom d'origine", () => {
    const path = buildStoragePath("pdf", new Date("2026-08-21T10:00:00Z"));
    expect(path).toMatch(
      /^2026\/08\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/
    );
  });

  it("génère des chemins uniques", () => {
    expect(buildStoragePath("pdf")).not.toBe(buildStoragePath("pdf"));
  });
});
