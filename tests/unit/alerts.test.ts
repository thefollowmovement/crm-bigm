import { describe, expect, it } from "vitest";

import { isAuditOverdue } from "@/lib/jobs/audit-overdue";

describe("isAuditOverdue", () => {
  const today = "2026-08-21";
  it("détecte l'absence d'audit ou un audit trop ancien", () => {
    expect(isAuditOverdue(null, today, 90)).toBe(true);
    expect(isAuditOverdue("2026-01-01", today, 90)).toBe(true); // 232 jours
    expect(isAuditOverdue("2026-06-01", today, 90)).toBe(false); // 81 jours
    expect(isAuditOverdue("2026-05-23", today, 90)).toBe(false); // pile 90
    expect(isAuditOverdue("2026-05-22", today, 90)).toBe(true); // 91 jours
  });
});
