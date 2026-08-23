import { describe, expect, it } from "vitest";

import {
  folderBreadcrumb,
  folderPathLabels,
} from "@/app/(app)/documents/folder-path";

const FOLDERS = [
  { id: "a", name: "Juridique", parentId: null },
  { id: "b", name: "Baux", parentId: "a" },
  { id: "c", name: "2026", parentId: "b" },
  { id: "d", name: "Communication", parentId: null },
];

describe("dossiers documentaires — chemins", () => {
  it("aplati les chemins « Parent / Enfant » triés en français", () => {
    expect(folderPathLabels(FOLDERS)).toEqual([
      { id: "d", label: "Communication" },
      { id: "a", label: "Juridique" },
      { id: "b", label: "Juridique / Baux" },
      { id: "c", label: "Juridique / Baux / 2026" },
    ]);
  });

  it("construit le fil d'Ariane racine → dossier", () => {
    expect(folderBreadcrumb(FOLDERS, "c").map((f) => f.name)).toEqual([
      "Juridique",
      "Baux",
      "2026",
    ]);
    expect(folderBreadcrumb(FOLDERS, "d").map((f) => f.name)).toEqual([
      "Communication",
    ]);
  });

  it("survit à un parent manquant ou à un cycle accidentel", () => {
    const orphan = [{ id: "x", name: "Orphelin", parentId: "disparu" }];
    expect(folderPathLabels(orphan)).toEqual([{ id: "x", label: "Orphelin" }]);

    const cycle = [
      { id: "a", name: "A", parentId: "b" },
      { id: "b", name: "B", parentId: "a" },
    ];
    // Pas de boucle infinie : la profondeur est bornée.
    expect(folderPathLabels(cycle).length).toBe(2);
    expect(folderBreadcrumb(cycle, "a").length).toBeGreaterThan(0);
  });
});
