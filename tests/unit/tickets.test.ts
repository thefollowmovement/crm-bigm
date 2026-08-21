import { describe, expect, it } from "vitest";

import { canTransition, isTicketLate } from "@/services/tickets.service";

const member = { isRequester: false, role: "RH" as const };
const requester = { isRequester: true, role: "COMPTABILITE" as const };

describe("machine à états des tickets", () => {
  it("suit le chemin nominal NOUVEAU → … → VALIDE", () => {
    expect(canTransition("NOUVEAU", "AFFECTE", member).allowed).toBe(true);
    expect(canTransition("AFFECTE", "EN_COURS", member).allowed).toBe(true);
    expect(canTransition("EN_COURS", "EN_ATTENTE", member).allowed).toBe(true);
    expect(canTransition("EN_ATTENTE", "EN_COURS", member).allowed).toBe(true);
    expect(canTransition("EN_COURS", "TERMINE", member).allowed).toBe(true);
    expect(canTransition("TERMINE", "VALIDE", requester).allowed).toBe(true);
  });

  it("interdit les sauts d'étapes", () => {
    expect(canTransition("NOUVEAU", "VALIDE", requester).allowed).toBe(false);
    expect(canTransition("NOUVEAU", "TERMINE", member).allowed).toBe(false);
    expect(canTransition("AFFECTE", "TERMINE", member).allowed).toBe(false);
    expect(canTransition("VALIDE", "EN_COURS", member).allowed).toBe(false);
  });

  it("réserve la validation au demandeur ou à la direction", () => {
    expect(canTransition("TERMINE", "VALIDE", member).allowed).toBe(false);
    expect(
      canTransition("TERMINE", "VALIDE", { isRequester: false, role: "DIRECTION" })
        .allowed
    ).toBe(true);
    expect(
      canTransition("TERMINE", "VALIDE", { isRequester: false, role: "ADMIN" }).allowed
    ).toBe(true);
  });

  it("autorise la réouverture d'un ticket terminé", () => {
    expect(canTransition("TERMINE", "EN_COURS", member).allowed).toBe(true);
  });
});

describe("retard d'un ticket", () => {
  it("détecte l'échéance dépassée sur un ticket ouvert", () => {
    expect(
      isTicketLate({ dueDate: "2026-08-01", status: "EN_COURS" }, "2026-08-21")
    ).toBe(true);
  });

  it("ignore les tickets terminés/validés ou sans échéance", () => {
    expect(
      isTicketLate({ dueDate: "2026-08-01", status: "TERMINE" }, "2026-08-21")
    ).toBe(false);
    expect(
      isTicketLate({ dueDate: "2026-08-01", status: "VALIDE" }, "2026-08-21")
    ).toBe(false);
    expect(isTicketLate({ dueDate: null, status: "EN_COURS" }, "2026-08-21")).toBe(
      false
    );
  });
});
