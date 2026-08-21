import { describe, expect, it } from "vitest";

import { canTransitionTraining } from "@/services/trainings.service";

const trainer = { hasReport: true, isTrainer: true, role: "ANIMATION" as const };
const rh = { hasReport: true, isTrainer: false, role: "RH" as const };
const autre = { hasReport: true, isTrainer: false, role: "ANIMATION" as const };

describe("canTransitionTraining", () => {
  it("suit la machine à états PLANIFIEE → REALISEE → VALIDEE", () => {
    expect(canTransitionTraining("PLANIFIEE", "REALISEE", trainer).allowed).toBe(true);
    expect(canTransitionTraining("REALISEE", "VALIDEE", rh).allowed).toBe(true);
    expect(canTransitionTraining("PLANIFIEE", "VALIDEE", rh).allowed).toBe(false);
    expect(canTransitionTraining("VALIDEE", "REALISEE", rh).allowed).toBe(false);
    expect(canTransitionTraining("ANNULEE", "REALISEE", rh).allowed).toBe(false);
  });

  it("exige un compte rendu pour marquer réalisée", () => {
    const sansCr = { hasReport: false, isTrainer: true, role: "ANIMATION" as const };
    const decision = canTransitionTraining("PLANIFIEE", "REALISEE", sansCr);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/compte rendu/i);
  });

  it("réserve la validation à la direction/RH et l'annulation au formateur ou direction/RH", () => {
    expect(canTransitionTraining("REALISEE", "VALIDEE", autre).allowed).toBe(false);
    expect(canTransitionTraining("REALISEE", "VALIDEE", trainer).allowed).toBe(false);
    expect(
      canTransitionTraining("REALISEE", "VALIDEE", {
        hasReport: true,
        isTrainer: false,
        role: "DIRECTION",
      }).allowed
    ).toBe(true);
    expect(canTransitionTraining("PLANIFIEE", "ANNULEE", trainer).allowed).toBe(true);
    expect(canTransitionTraining("PLANIFIEE", "ANNULEE", autre).allowed).toBe(false);
    expect(canTransitionTraining("PLANIFIEE", "ANNULEE", rh).allowed).toBe(true);
  });
});
