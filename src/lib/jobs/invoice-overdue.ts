import "server-only";

import { and, eq, inArray, isNull, lt } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { invoices, users } from "@/db/schema";
import { logAuditEvent } from "@/lib/audit/log";
import { todayParis } from "@/lib/dates";
import { formatEUR } from "@/lib/money";
import { notify } from "@/services/notifications.service";

// Job quotidien : signale les factures échues et impayées à la comptabilité
// et à la direction. Idempotent : dedupeKey par facture + marqueur
// overdueNotifiedAt (le statut « en retard » lui-même reste dérivé).
export async function runInvoiceOverdueJob(now: Date = new Date()) {
  const today = todayParis(now);

  const overdue = await db.query.invoices.findMany({
    where: and(
      inArray(invoices.status, ["EMISE", "PARTIELLEMENT_PAYEE"]),
      lt(invoices.dueDate, today),
      isNull(invoices.overdueNotifiedAt)
    ),
    with: { store: { columns: { code: true, name: true } } },
  });

  if (overdue.length === 0) return { checked: 0, alerted: 0, notified: 0 };

  const recipients = await db.query.users.findMany({
    where: and(
      inArray(users.role, ["ADMIN", "DIRECTION", "COMPTABILITE"]),
      eq(users.isActive, true)
    ),
    columns: { id: true },
  });
  const recipientIds = recipients.map((u) => u.id);

  let notified = 0;
  for (const invoice of overdue) {
    notified += await notify(recipientIds, {
      type: "FACTURE_IMPAYEE",
      title: `Facture ${invoice.number} en retard (${invoice.store.code})`,
      body: `${formatEUR(invoice.amountTTC)} TTC — échéance dépassée le ${invoice.dueDate}.`,
      link: `/finances/${invoice.id}`,
      dedupeKey: `invoice-overdue:${invoice.id}`,
    });

    await db
      .update(invoices)
      .set({ overdueNotifiedAt: now })
      .where(eq(invoices.id, invoice.id));

    await logAuditEvent({
      userId: null,
      action: "UPDATE",
      tableName: "invoices",
      recordId: invoice.id,
      changes: { overdueNotifiedAt: { old: null, new: now.toISOString() } },
    });
  }

  return { checked: overdue.length, alerted: overdue.length, notified };
}
