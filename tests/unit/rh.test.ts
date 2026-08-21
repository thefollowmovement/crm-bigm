import { describe, expect, it } from "vitest";

import { canCancelLeave, datesOverlap } from "@/services/leaves.service";
import {
  computeWorkedMinutes,
  formatMinutes,
  nextClockActions,
} from "@/services/timeclock.service";

describe("datesOverlap", () => {
  it("détecte les chevauchements de périodes incluses", () => {
    expect(datesOverlap("2026-08-01", "2026-08-05", "2026-08-05", "2026-08-10")).toBe(true);
    expect(datesOverlap("2026-08-01", "2026-08-05", "2026-08-06", "2026-08-10")).toBe(false);
    expect(datesOverlap("2026-08-10", "2026-08-12", "2026-08-01", "2026-08-31")).toBe(true);
    expect(datesOverlap("2026-08-01", "2026-08-01", "2026-08-01", "2026-08-01")).toBe(true);
  });
});

describe("canCancelLeave", () => {
  it("le salarié annule sa demande tant qu'elle n'est pas tranchée", () => {
    expect(canCancelLeave({ isOwn: true, hasWrite: false, status: "DEMANDEE" })).toBe(true);
    expect(canCancelLeave({ isOwn: true, hasWrite: false, status: "VALIDEE" })).toBe(false);
    expect(canCancelLeave({ isOwn: true, hasWrite: false, status: "REFUSEE" })).toBe(false);
    expect(canCancelLeave({ isOwn: false, hasWrite: false, status: "DEMANDEE" })).toBe(false);
  });
  it("la RH annule aussi une demande validée (changement de planning)", () => {
    expect(canCancelLeave({ isOwn: false, hasWrite: true, status: "VALIDEE" })).toBe(true);
    expect(canCancelLeave({ isOwn: false, hasWrite: true, status: "ANNULEE" })).toBe(false);
  });
});

describe("nextClockActions", () => {
  it("suit le cycle Début → Pause/Fin → Reprise/Fin", () => {
    expect(nextClockActions(null)).toEqual(["DEBUT"]);
    expect(nextClockActions("TRAVAIL")).toEqual(["PAUSE", "FIN"]);
    expect(nextClockActions("PAUSE")).toEqual(["REPRISE", "FIN"]);
  });
});

describe("computeWorkedMinutes", () => {
  const at = (iso: string) => new Date(iso);

  it("sépare travail et pause, badge ouvert compté jusqu'à maintenant", () => {
    const entries = [
      { type: "TRAVAIL" as const, startedAt: at("2026-08-21T08:00:00Z"), endedAt: at("2026-08-21T12:00:00Z") },
      { type: "PAUSE" as const, startedAt: at("2026-08-21T12:00:00Z"), endedAt: at("2026-08-21T12:45:00Z") },
      { type: "TRAVAIL" as const, startedAt: at("2026-08-21T12:45:00Z"), endedAt: null },
    ];
    const result = computeWorkedMinutes(entries, at("2026-08-21T15:15:00Z"));
    // 4 h le matin + 2 h 30 l'après-midi (en cours) = 390 min ; pause 45 min.
    expect(result.workedMinutes).toBe(390);
    expect(result.pauseMinutes).toBe(45);
  });

  it("journée vide et intervalles incohérents (fin avant début) → zéro", () => {
    expect(computeWorkedMinutes([], new Date("2026-08-21T10:00:00Z"))).toEqual({
      workedMinutes: 0,
      pauseMinutes: 0,
    });
    const weird = [
      { type: "TRAVAIL" as const, startedAt: at("2026-08-21T10:00:00Z"), endedAt: at("2026-08-21T09:00:00Z") },
    ];
    expect(computeWorkedMinutes(weird, at("2026-08-21T11:00:00Z")).workedMinutes).toBe(0);
  });
});

describe("formatMinutes", () => {
  it("affiche « h » et minutes sur deux chiffres", () => {
    expect(formatMinutes(0)).toBe("0 h 00");
    expect(formatMinutes(65)).toBe("1 h 05");
    expect(formatMinutes(390)).toBe("6 h 30");
  });
});
