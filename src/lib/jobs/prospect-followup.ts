import "server-only";

import { and, eq, isNotNull, ne } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { prospects, users } from "@/db/schema";
import { todayParis } from "@/lib/dates";
import { isFollowUpDue } from "@/services/prospects.service";
import { notify } from "@/services/notifications.service";

// Job quotidien : prospects dont la date de relance est atteinte (cdc §14).
// Idempotent sur la journée : dedupeKey par prospect ET par jour — la
// relance revient chaque jour tant que la date n'est pas repoussée.
export async function runProspectFollowupJob(now: Date = new Date()) {
  const today = todayParis(now);

  const candidates = await db.query.prospects.findMany({
    where: and(
      isNotNull(prospects.nextFollowUpDate),
      ne(prospects.status, "ABANDONNE")
    ),
  });
  const due = candidates.filter((p) => isFollowUpDue(p, today));

  const pole = await db.query.users.findMany({
    where: and(eq(users.pole, "DEVELOPPEMENT"), eq(users.isActive, true)),
    columns: { id: true },
  });

  let notified = 0;
  for (const prospect of due) {
    const recipients = [
      ...(prospect.assigneeId ? [prospect.assigneeId] : []),
      ...pole.map((u) => u.id),
    ];
    notified += await notify([...new Set(recipients)], {
      type: "DEVELOPPEMENT",
      title: `Relance prospect : ${prospect.firstName} ${prospect.lastName}`,
      body: `Prévue le ${prospect.nextFollowUpDate}`,
      link: `/developpement/prospects/${prospect.id}`,
      dedupeKey: `prospect-followup:${prospect.id}:${today}`,
    });
  }

  return { checked: candidates.length, due: due.length, notified };
}
