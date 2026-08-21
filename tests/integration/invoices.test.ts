import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db, pool } from "@/lib/db/client";
import { invoices } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/authz/guards";
import {
  addReminder,
  cancelInvoice,
  createInvoice,
  getInvoice,
  listInvoices,
  recordPayment,
  type InvoiceInput,
} from "@/services/invoices.service";
import { runInvoiceOverdueJob } from "@/lib/jobs/invoice-overdue";
import { addMonthsIso, todayParis } from "@/lib/dates";
import { resetDb } from "./setup/reset-db";
import { createTestStore, createTestUser } from "../helpers/factories";

function asSession(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: SessionUser["role"];
  pole: SessionUser["pole"];
  franchiseeId: string | null;
}): SessionUser {
  return { ...user };
}

function baseInput(storeId: string, overrides: Partial<InvoiceInput> = {}): InvoiceInput {
  return {
    storeId,
    type: "REDEVANCE",
    label: null,
    periodStart: null,
    periodEnd: null,
    amountHT: "1000.00",
    vatRate: "20.00",
    issuedAt: "2026-08-01",
    dueDate: "2026-09-01",
    notes: null,
    ...overrides,
  };
}

afterAll(async () => {
  await pool.end();
});

describe("factures : numérotation et cycle de paiement", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("numérote séquentiellement même sous concurrence", async () => {
    const compta = asSession(await createTestUser({ role: "COMPTABILITE" }));
    const store = await createTestStore();

    const created = await Promise.all(
      Array.from({ length: 5 }, () => createInvoice(compta, baseInput(store.id)))
    );
    const numbers = created.map((i) => i.number).sort();
    expect(new Set(numbers).size).toBe(5);
    expect(numbers).toEqual([
      "F2026-0001",
      "F2026-0002",
      "F2026-0003",
      "F2026-0004",
      "F2026-0005",
    ]);
    // TTC calculé automatiquement
    expect(created[0].amountTTC).toBe("1200.00");
  });

  it("paiement partiel → PARTIELLEMENT_PAYEE, solde → PAYEE, surpaiement refusé", async () => {
    const compta = asSession(await createTestUser({ role: "COMPTABILITE" }));
    const store = await createTestStore();
    const invoice = await createInvoice(compta, baseInput(store.id));

    await recordPayment(compta, invoice.id, {
      amount: "500.00",
      paidAt: "2026-08-10",
      method: "VIREMENT",
      reference: null,
      notes: null,
    });
    let current = await getInvoice(compta, invoice.id);
    expect(current?.status).toBe("PARTIELLEMENT_PAYEE");
    expect(current?.paidTotal).toBe("500.00");

    // surpaiement refusé (solde restant : 700)
    await expect(
      recordPayment(compta, invoice.id, {
        amount: "800.00",
        paidAt: "2026-08-11",
        method: "VIREMENT",
        reference: null,
        notes: null,
      })
    ).rejects.toThrow(/dépasse le solde/);

    await recordPayment(compta, invoice.id, {
      amount: "700.00",
      paidAt: "2026-08-12",
      method: "CHEQUE",
      reference: null,
      notes: null,
    });
    current = await getInvoice(compta, invoice.id);
    expect(current?.status).toBe("PAYEE");

    // plus de paiement possible
    await expect(
      recordPayment(compta, invoice.id, {
        amount: "1.00",
        paidAt: "2026-08-13",
        method: "CB",
        reference: null,
        notes: null,
      })
    ).rejects.toThrow(/déjà intégralement payée/);
  });

  it("annulation impossible avec paiement, paiement impossible sur annulée", async () => {
    const compta = asSession(await createTestUser({ role: "COMPTABILITE" }));
    const store = await createTestStore();

    const paid = await createInvoice(compta, baseInput(store.id));
    await recordPayment(compta, paid.id, {
      amount: "100.00",
      paidAt: "2026-08-10",
      method: "CB",
      reference: null,
      notes: null,
    });
    await expect(cancelInvoice(compta, paid.id)).rejects.toThrow(/paiements/);

    const cancelled = await createInvoice(compta, baseInput(store.id));
    await cancelInvoice(compta, cancelled.id);
    await expect(
      recordPayment(compta, cancelled.id, {
        amount: "10.00",
        paidAt: "2026-08-10",
        method: "CB",
        reference: null,
        notes: null,
      })
    ).rejects.toThrow(/annulée/);
  });

  it("le niveau de relance ne régresse jamais", async () => {
    const compta = asSession(await createTestUser({ role: "COMPTABILITE" }));
    const store = await createTestStore();
    const invoice = await createInvoice(compta, baseInput(store.id));

    await addReminder(compta, invoice.id, {
      level: 2,
      channel: "EMAIL",
      sentAt: "2026-09-10",
      notes: null,
    });
    await expect(
      addReminder(compta, invoice.id, {
        level: 1,
        channel: "TELEPHONE",
        sentAt: "2026-09-15",
        notes: null,
      })
    ).rejects.toThrow(/régresser/);
    // même niveau : autorisé (nouvelle relance de niveau 2)
    await addReminder(compta, invoice.id, {
      level: 2,
      channel: "COURRIER",
      sentAt: "2026-09-20",
      notes: null,
    });
  });

  it("COMMUNICATION n'a pas accès aux finances", async () => {
    const communication = asSession(await createTestUser({ role: "COMMUNICATION" }));
    await expect(listInvoices(communication)).rejects.toThrow(ForbiddenError);
  });
});

describe("job de retards de paiement", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("alerte compta/direction/admin une seule fois par facture échue", async () => {
    const compta = asSession(await createTestUser({ role: "COMPTABILITE" }));
    const direction = await createTestUser({ role: "DIRECTION" });
    const rh = await createTestUser({ role: "RH" });
    const store = await createTestStore();
    const today = todayParis();

    // échue impayée → alerte ; payée et future → ignorées
    const overdue = await createInvoice(
      compta,
      baseInput(store.id, { issuedAt: "2026-01-01", dueDate: "2026-01-31" })
    );
    const paid = await createInvoice(
      compta,
      baseInput(store.id, { issuedAt: "2026-01-01", dueDate: "2026-01-31" })
    );
    await recordPayment(compta, paid.id, {
      amount: "1200.00",
      paidAt: "2026-01-15",
      method: "VIREMENT",
      reference: null,
      notes: null,
    });
    await createInvoice(
      compta,
      baseInput(store.id, { dueDate: addMonthsIso(today, 2) })
    );

    const first = await runInvoiceOverdueJob();
    expect(first.alerted).toBe(1);

    const second = await runInvoiceOverdueJob();
    expect(second.alerted).toBe(0);

    const notifs = await db.query.notifications.findMany();
    const recipients = notifs.map((n) => n.userId).sort();
    expect(recipients).toEqual([compta.id, direction.id].sort());
    expect(notifs.some((n) => n.userId === rh.id)).toBe(false);
    expect(
      notifs.every((n) => n.dedupeKey === `invoice-overdue:${overdue.id}`)
    ).toBe(true);

    const [updated] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, overdue.id));
    expect(updated.overdueNotifiedAt).not.toBeNull();
  });

  it("un paiement complet avant le job évite l'alerte", async () => {
    const compta = asSession(await createTestUser({ role: "COMPTABILITE" }));
    await createTestUser({ role: "DIRECTION" });
    const store = await createTestStore();
    const invoice = await createInvoice(
      compta,
      baseInput(store.id, { issuedAt: "2026-01-01", dueDate: "2026-01-31" })
    );
    await recordPayment(compta, invoice.id, {
      amount: "1200.00",
      paidAt: "2026-02-15",
      method: "VIREMENT",
      reference: null,
      notes: null,
    });

    const result = await runInvoiceOverdueJob();
    expect(result.alerted).toBe(0);
    expect(await db.query.notifications.findMany()).toHaveLength(0);
  });
});
