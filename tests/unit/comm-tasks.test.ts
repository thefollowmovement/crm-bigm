import { describe, expect, it } from "vitest";

import {
  canCreateCommTask,
  canTransitionCommTask,
  formatCommTaskNumber,
  isCommTaskLate,
} from "@/services/comm-tasks.service";

describe("canCreateCommTask", () => {
  it("sans commtask:write, seule la DEMANDE est autorisée", () => {
    expect(canCreateCommTask({ hasWrite: false }, "DEMANDE")).toBe(true);
    expect(canCreateCommTask({ hasWrite: false }, "CAMPAGNE")).toBe(false);
    expect(canCreateCommTask({ hasWrite: false }, "ADS")).toBe(false);
    expect(canCreateCommTask({ hasWrite: true }, "CAMPAGNE")).toBe(true);
  });
});

describe("canTransitionCommTask", () => {
  const requester = { isRequester: true, hasWrite: false, role: "FRANCHISE" as const };
  const pole = { isRequester: false, hasWrite: true, role: "COMMUNICATION" as const };

  it("le pôle fait avancer, le demandeur valide (même sans droit d'écriture)", () => {
    expect(canTransitionCommTask("NOUVEAU", "AFFECTE", pole).allowed).toBe(true);
    expect(canTransitionCommTask("EN_COURS", "TERMINE", pole).allowed).toBe(true);
    expect(canTransitionCommTask("TERMINE", "VALIDE", requester).allowed).toBe(true);
    // Le demandeur sans écriture ne fait PAS avancer les autres statuts.
    expect(canTransitionCommTask("NOUVEAU", "AFFECTE", requester).allowed).toBe(false);
    // Le pôle (non demandeur) ne valide pas.
    expect(canTransitionCommTask("TERMINE", "VALIDE", pole).allowed).toBe(false);
    // La direction valide.
    expect(
      canTransitionCommTask("TERMINE", "VALIDE", {
        isRequester: false,
        hasWrite: false,
        role: "DIRECTION",
      }).allowed
    ).toBe(true);
  });

  it("respecte la machine à états", () => {
    expect(canTransitionCommTask("NOUVEAU", "TERMINE", pole).allowed).toBe(false);
    expect(canTransitionCommTask("VALIDE", "EN_COURS", pole).allowed).toBe(false);
    expect(canTransitionCommTask("TERMINE", "EN_COURS", pole).allowed).toBe(true);
  });
});

describe("isCommTaskLate", () => {
  const today = "2026-08-21";
  it("prend la plus proche des deux échéances, ignore les tâches closes", () => {
    expect(
      isCommTaskLate(
        { dueDate: "2026-08-20", publicationDate: null, status: "EN_COURS" },
        today
      )
    ).toBe(true);
    expect(
      isCommTaskLate(
        { dueDate: null, publicationDate: "2026-08-20", status: "NOUVEAU" },
        today
      )
    ).toBe(true);
    expect(
      isCommTaskLate(
        { dueDate: "2026-09-01", publicationDate: "2026-08-20", status: "EN_COURS" },
        today
      )
    ).toBe(true);
    expect(
      isCommTaskLate(
        { dueDate: "2026-09-01", publicationDate: null, status: "EN_COURS" },
        today
      )
    ).toBe(false);
    expect(
      isCommTaskLate(
        { dueDate: "2026-08-01", publicationDate: null, status: "TERMINE" },
        today
      )
    ).toBe(false);
    expect(
      isCommTaskLate({ dueDate: null, publicationDate: null, status: "EN_COURS" }, today)
    ).toBe(false);
  });
});

describe("formatCommTaskNumber", () => {
  it("formate le numéro court", () => {
    expect(formatCommTaskNumber(7)).toBe("COM-000007");
  });
});
