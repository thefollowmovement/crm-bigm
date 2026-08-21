import { describe, expect, it } from "vitest";

import { computeDiff } from "@/lib/db/audited";

describe("computeDiff (audit)", () => {
  it("ne retient que les champs modifiés", () => {
    const diff = computeDiff(
      { name: "Big M Lyon", city: "Lyon", phone: null },
      { name: "Big M Lyon 2", city: "Lyon", phone: null }
    );
    expect(diff).toEqual({ name: { old: "Big M Lyon", new: "Big M Lyon 2" } });
  });

  it("retourne un diff vide quand rien ne change", () => {
    const row = { name: "X", count: 3 };
    expect(computeDiff(row, { ...row })).toEqual({});
  });

  it("sérialise les dates en ISO", () => {
    const diff = computeDiff(
      { endDate: new Date("2026-01-01T00:00:00Z") },
      { endDate: new Date("2027-01-01T00:00:00Z") }
    );
    expect(diff.endDate).toEqual({
      old: "2026-01-01T00:00:00.000Z",
      new: "2027-01-01T00:00:00.000Z",
    });
  });

  it("masque la valeur des champs sensibles modifiés", () => {
    const diff = computeDiff({ passwordHash: "aaa" }, { passwordHash: "bbb" });
    expect(diff.passwordHash).toEqual({ old: "***", new: "***" });
  });

  it("ignore les champs techniques (updatedAt/createdAt)", () => {
    const diff = computeDiff(
      { updatedAt: new Date(1), createdAt: new Date(1), name: "A" },
      { updatedAt: new Date(2), createdAt: new Date(2), name: "A" }
    );
    expect(diff).toEqual({});
  });

  it("distingue null et valeurs définies", () => {
    const diff = computeDiff({ notes: null }, { notes: "nouvelle note" });
    expect(diff.notes).toEqual({ old: null, new: "nouvelle note" });
  });
});
