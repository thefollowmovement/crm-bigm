import { describe, expect, it } from "vitest";

import {
  canEditPlanning,
  hasDayConflict,
  hasPeriodConflict,
} from "@/services/planning.service";
import { startOfWeekIso } from "@/lib/dates";

describe("canEditPlanning", () => {
  const self = "user-a";
  const other = "user-b";
  it("l'animateur ne modifie que son planning, la direction modifie tout", () => {
    expect(canEditPlanning({ id: self, role: "ANIMATION" }, self)).toBe(true);
    expect(canEditPlanning({ id: self, role: "ANIMATION" }, other)).toBe(false);
    expect(canEditPlanning({ id: self, role: "ADMIN" }, other)).toBe(true);
    expect(canEditPlanning({ id: self, role: "DIRECTION" }, other)).toBe(true);
    expect(canEditPlanning({ id: self, role: "COMPTABILITE" }, self)).toBe(false);
    expect(canEditPlanning({ id: self, role: "FRANCHISE" }, self)).toBe(false);
  });
});

describe("hasPeriodConflict", () => {
  it("JOURNEE est exclusive des demi-journées", () => {
    expect(hasPeriodConflict([], "JOURNEE")).toBe(false);
    expect(hasPeriodConflict([], "MATIN")).toBe(false);
    expect(hasPeriodConflict(["MATIN"], "APRES_MIDI")).toBe(false);
    expect(hasPeriodConflict(["MATIN"], "JOURNEE")).toBe(true);
    expect(hasPeriodConflict(["APRES_MIDI"], "JOURNEE")).toBe(true);
    expect(hasPeriodConflict(["JOURNEE"], "MATIN")).toBe(true);
    expect(hasPeriodConflict(["JOURNEE"], "APRES_MIDI")).toBe(true);
  });
});

describe("hasDayConflict (glisser-déposer)", () => {
  it("refuse la même période ou un conflit Journée sur le jour cible", () => {
    expect(hasDayConflict([], "MATIN")).toBe(false);
    expect(hasDayConflict([], "JOURNEE")).toBe(false);
    expect(hasDayConflict(["MATIN"], "APRES_MIDI")).toBe(false);
    expect(hasDayConflict(["MATIN"], "MATIN")).toBe(true);
    expect(hasDayConflict(["MATIN"], "JOURNEE")).toBe(true);
    expect(hasDayConflict(["JOURNEE"], "APRES_MIDI")).toBe(true);
  });
});

describe("startOfWeekIso", () => {
  it("retourne le lundi de la semaine, y compris pour un dimanche", () => {
    expect(startOfWeekIso("2026-08-21")).toBe("2026-08-17"); // vendredi
    expect(startOfWeekIso("2026-08-17")).toBe("2026-08-17"); // lundi
    expect(startOfWeekIso("2026-08-23")).toBe("2026-08-17"); // dimanche
    expect(startOfWeekIso("2026-01-01")).toBe("2025-12-29"); // passage d'année
  });
});
