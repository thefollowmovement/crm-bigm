import { describe, expect, it } from "vitest";

import { isFollowUpDue } from "@/services/prospects.service";

describe("isFollowUpDue", () => {
  const today = "2026-08-21";
  it("relance due si la date est atteinte et le prospect actif", () => {
    expect(isFollowUpDue({ nextFollowUpDate: "2026-08-21", status: "QUALIFIE" }, today)).toBe(true);
    expect(isFollowUpDue({ nextFollowUpDate: "2026-08-01", status: "NOUVEAU" }, today)).toBe(true);
    expect(isFollowUpDue({ nextFollowUpDate: "2026-08-22", status: "QUALIFIE" }, today)).toBe(false);
    expect(isFollowUpDue({ nextFollowUpDate: null, status: "QUALIFIE" }, today)).toBe(false);
    // Un prospect abandonné ne se relance plus.
    expect(isFollowUpDue({ nextFollowUpDate: "2026-08-01", status: "ABANDONNE" }, today)).toBe(false);
  });
});
