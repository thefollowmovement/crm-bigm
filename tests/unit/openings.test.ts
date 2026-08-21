import { describe, expect, it } from "vitest";

import {
  STEP_ORDER,
  canTransitionStep,
  canUpdateChecklistItem,
  computeProgress,
  isStepLate,
} from "@/services/openings.service";

describe("canTransitionStep", () => {
  it("suit le parcours et autorise blocage/réouverture", () => {
    expect(canTransitionStep("A_VENIR", "EN_COURS").allowed).toBe(true);
    expect(canTransitionStep("EN_COURS", "TERMINEE").allowed).toBe(true);
    expect(canTransitionStep("EN_COURS", "BLOQUEE").allowed).toBe(true);
    expect(canTransitionStep("BLOQUEE", "EN_COURS").allowed).toBe(true);
    expect(canTransitionStep("TERMINEE", "EN_COURS").allowed).toBe(true);
    // Pas de saut direct A_VENIR → TERMINEE ni de retour TERMINEE → BLOQUEE.
    expect(canTransitionStep("A_VENIR", "TERMINEE").allowed).toBe(false);
    expect(canTransitionStep("TERMINEE", "BLOQUEE").allowed).toBe(false);
  });
});

describe("isStepLate", () => {
  const today = "2026-08-21";
  it("date prévue dépassée et jalon non terminé", () => {
    expect(isStepLate({ plannedDate: "2026-08-20", status: "EN_COURS" }, today)).toBe(true);
    expect(isStepLate({ plannedDate: "2026-08-20", status: "A_VENIR" }, today)).toBe(true);
    expect(isStepLate({ plannedDate: "2026-08-20", status: "TERMINEE" }, today)).toBe(false);
    expect(isStepLate({ plannedDate: "2026-08-22", status: "EN_COURS" }, today)).toBe(false);
    expect(isStepLate({ plannedDate: null, status: "EN_COURS" }, today)).toBe(false);
  });
});

describe("computeProgress", () => {
  it("compte les jalons terminés", () => {
    expect(computeProgress([])).toEqual({ done: 0, total: 0, pct: 0 });
    const steps = STEP_ORDER.map((_, i) => ({
      status: i < 2 ? ("TERMINEE" as const) : ("A_VENIR" as const),
    }));
    expect(computeProgress(steps)).toEqual({ done: 2, total: 8, pct: 25 });
  });
});

describe("canUpdateChecklistItem", () => {
  it("chaque pôle gère ses items ; opening:write gère tout ; pole null jamais", () => {
    expect(
      canUpdateChecklistItem({ pole: "COMMUNICATION", hasWrite: false }, "COMMUNICATION")
    ).toBe(true);
    expect(
      canUpdateChecklistItem({ pole: "COMMUNICATION", hasWrite: false }, "COMPTABILITE")
    ).toBe(false);
    expect(
      canUpdateChecklistItem({ pole: null, hasWrite: false }, "COMMUNICATION")
    ).toBe(false);
    expect(canUpdateChecklistItem({ pole: null, hasWrite: true }, "RH")).toBe(true);
  });
});
