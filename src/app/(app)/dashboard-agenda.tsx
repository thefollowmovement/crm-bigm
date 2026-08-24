import Link from "next/link";

import type { SessionUser } from "@/lib/auth/session";
import { addDaysIso, formatDateFr, todayParis } from "@/lib/dates";
import {
  AGENDA_TYPE_LABELS,
  getAgenda,
  hasAgendaAccess,
  type AgendaEventType,
} from "@/services/agenda.service";
import { CalendarMonth } from "@/components/calendar-month";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Bloc « Agenda » des tableaux de bord : calendrier du mois en cours +
// liste des événements des 30 prochains jours, selon les permissions.

const TYPE_STYLES: Record<AgendaEventType, string> = {
  VISITE: "bg-sky-500/15 text-sky-800 dark:text-sky-300",
  FORMATION: "bg-violet-500/15 text-violet-800 dark:text-violet-300",
  CONTRAT: "bg-rose-500/15 text-rose-800 dark:text-rose-300",
  FACTURE: "bg-orange-500/15 text-orange-800 dark:text-orange-300",
  PLAN_ACTION: "bg-red-500/15 text-red-800 dark:text-red-300",
  JALON: "bg-teal-500/15 text-teal-800 dark:text-teal-300",
  COMM: "bg-fuchsia-500/15 text-fuchsia-800 dark:text-fuchsia-300",
  CONGE: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
};

export async function DashboardAgenda({ user }: { user: SessionUser }) {
  if (!hasAgendaAccess(user)) return null;

  const today = todayParis();
  const to = addDaysIso(today, 30);
  const events = await getAgenda(user, { from: today, to });

  const cells = new Map<string, React.ReactNode>();
  const byDate = new Map<string, typeof events>();
  for (const event of events) {
    byDate.set(event.date, [...(byDate.get(event.date) ?? []), event]);
  }
  for (const [date, list] of byDate) {
    cells.set(
      date,
      list.map((event, i) => (
        <Link
          key={`${date}-${i}`}
          href={event.link}
          className={`block truncate rounded px-1 py-0.5 text-[11px] hover:opacity-80 ${TYPE_STYLES[event.type]}`}
          title={`${AGENDA_TYPE_LABELS[event.type]} — ${event.label}`}
        >
          {event.label}
        </Link>
      ))
    );
  }

  return (
    <Card data-testid="dashboard-agenda">
      <CardHeader>
        <CardTitle>Agenda — 30 prochains jours</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <CalendarMonth
          month={today}
          cells={cells}
          today={today}
          testId="agenda-month"
        />
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun événement à venir sur votre périmètre.
          </p>
        ) : (
          <ul className="space-y-1 text-sm" data-testid="agenda-list">
            {events.slice(0, 12).map((event, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="w-20 shrink-0 text-muted-foreground tabular-nums">
                  {formatDateFr(event.date)}
                </span>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${TYPE_STYLES[event.type]}`}
                >
                  {AGENDA_TYPE_LABELS[event.type]}
                </span>
                <Link
                  href={event.link}
                  className="truncate underline-offset-2 hover:underline"
                >
                  {event.label}
                </Link>
              </li>
            ))}
            {events.length > 12 ? (
              <li className="text-xs text-muted-foreground">
                … et {events.length - 12} autre{events.length - 12 > 1 ? "s" : ""}{" "}
                (voir le calendrier ci-dessus).
              </li>
            ) : null}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
