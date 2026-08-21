import { describe, expect, it } from "vitest";

import {
  canTransitionPlan,
  formatPlanNumber,
  isPlanLate,
} from "@/services/action-plans.service";
import { shouldRemindPlan } from "@/lib/jobs/action-plan-overdue";
import { computeAuditScore, canManageCriteria } from "@/services/visits.service";

const creator = { isCreator: true, role: "ANIMATION" as const };
const other = { isCreator: false, role: "ANIMATION" as const };
const direction = { isCreator: false, role: "DIRECTION" as const };

describe("canTransitionPlan", () => {
  it("suit la machine à états A_FAIRE → EN_COURS → TERMINE → VALIDE", () => {
    expect(canTransitionPlan("A_FAIRE", "EN_COURS", other).allowed).toBe(true);
    expect(canTransitionPlan("EN_COURS", "TERMINE", other).allowed).toBe(true);
    expect(canTransitionPlan("TERMINE", "VALIDE", creator).allowed).toBe(true);
    expect(canTransitionPlan("TERMINE", "EN_COURS", other).allowed).toBe(true); // réouverture
  });

  it("interdit les sauts d'étape et les états finaux", () => {
    expect(canTransitionPlan("A_FAIRE", "TERMINE", creator).allowed).toBe(false);
    expect(canTransitionPlan("A_FAIRE", "VALIDE", creator).allowed).toBe(false);
    expect(canTransitionPlan("VALIDE", "EN_COURS", direction).allowed).toBe(false);
    expect(canTransitionPlan("ANNULE", "EN_COURS", direction).allowed).toBe(false);
  });

  it("réserve la validation et l'annulation au créateur ou à la direction", () => {
    expect(canTransitionPlan("TERMINE", "VALIDE", other).allowed).toBe(false);
    expect(canTransitionPlan("TERMINE", "VALIDE", direction).allowed).toBe(true);
    expect(canTransitionPlan("A_FAIRE", "ANNULE", other).allowed).toBe(false);
    expect(canTransitionPlan("A_FAIRE", "ANNULE", creator).allowed).toBe(true);
    expect(canTransitionPlan("EN_COURS", "ANNULE", direction).allowed).toBe(true);
  });
});

describe("isPlanLate", () => {
  it("dérive le retard de l'échéance et du statut (jamais stocké)", () => {
    const today = "2026-08-21";
    expect(isPlanLate({ dueDate: "2026-08-20", status: "EN_COURS" }, today)).toBe(true);
    expect(isPlanLate({ dueDate: "2026-08-21", status: "EN_COURS" }, today)).toBe(false);
    expect(isPlanLate({ dueDate: null, status: "EN_COURS" }, today)).toBe(false);
    expect(isPlanLate({ dueDate: "2026-08-01", status: "TERMINE" }, today)).toBe(false);
    expect(isPlanLate({ dueDate: "2026-08-01", status: "VALIDE" }, today)).toBe(false);
    expect(isPlanLate({ dueDate: "2026-08-01", status: "ANNULE" }, today)).toBe(false);
  });
});

describe("shouldRemindPlan", () => {
  const today = "2026-08-21";
  it("relance uniquement les plans ouverts, échus et jamais relancés", () => {
    expect(
      shouldRemindPlan({ status: "EN_COURS", dueDate: "2026-08-01", reminderSentAt: null }, today)
    ).toBe(true);
    expect(
      shouldRemindPlan({ status: "A_FAIRE", dueDate: "2026-08-01", reminderSentAt: null }, today)
    ).toBe(true);
    expect(
      shouldRemindPlan({ status: "TERMINE", dueDate: "2026-08-01", reminderSentAt: null }, today)
    ).toBe(false);
    expect(
      shouldRemindPlan({ status: "EN_COURS", dueDate: "2026-09-01", reminderSentAt: null }, today)
    ).toBe(false);
    expect(
      shouldRemindPlan(
        { status: "EN_COURS", dueDate: "2026-08-01", reminderSentAt: new Date() },
        today
      )
    ).toBe(false);
    expect(
      shouldRemindPlan({ status: "EN_COURS", dueDate: null, reminderSentAt: null }, today)
    ).toBe(false);
  });
});

describe("computeAuditScore", () => {
  it("calcule la note en % (1 décimale), null sans critère", () => {
    expect(
      computeAuditScore([
        { score: 9, maxScore: 10 },
        { score: 8, maxScore: 10 },
        { score: 6, maxScore: 10 },
      ])
    ).toBe(76.7);
    expect(computeAuditScore([{ score: 10, maxScore: 10 }])).toBe(100);
    expect(computeAuditScore([])).toBeNull();
  });
});

describe("canManageCriteria", () => {
  it("réserve la grille à la direction", () => {
    expect(canManageCriteria("ADMIN")).toBe(true);
    expect(canManageCriteria("DIRECTION")).toBe(true);
    expect(canManageCriteria("ANIMATION")).toBe(false);
    expect(canManageCriteria("COMPTABILITE")).toBe(false);
  });
});

describe("formatPlanNumber", () => {
  it("formate le numéro court", () => {
    expect(formatPlanNumber(123)).toBe("PA-000123");
  });
});
