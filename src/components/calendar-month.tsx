import type { ReactNode } from "react";

import { monthGridDays } from "@/lib/dates";

// Grille calendaire mensuelle (lundi → dimanche) réutilisable : planning,
// congés, agenda… Le contenu de chaque jour est fourni par l'appelant.
const WEEKDAYS = ["Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam.", "Dim."];

export function CalendarMonth({
  month,
  cells,
  today,
  testId = "month-grid",
}: {
  // n'importe quelle date ISO du mois à afficher
  month: string;
  // contenu par date ISO (chips, liens…)
  cells: Map<string, ReactNode>;
  today?: string;
  testId?: string;
}) {
  const weeks = monthGridDays(month);
  const currentMonth = month.slice(0, 7);

  return (
    <div className="overflow-x-auto rounded-xl border bg-card" data-testid={testId}>
      <table className="w-full min-w-[840px] table-fixed text-sm">
        <thead>
          <tr className="border-b">
            {WEEKDAYS.map((day) => (
              <th
                key={day}
                className="p-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]} className="border-b last:border-0">
              {week.map((date) => {
                const inMonth = date.slice(0, 7) === currentMonth;
                return (
                  <td
                    key={date}
                    className={`h-24 p-1.5 align-top ${
                      inMonth ? "" : "bg-muted/40 text-muted-foreground"
                    }`}
                    data-testid={`month-day-${date}`}
                  >
                    <div
                      className={`text-xs font-medium ${
                        date === today
                          ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand text-brand-foreground"
                          : ""
                      }`}
                    >
                      {Number(date.slice(8, 10))}
                    </div>
                    <div className="mt-1 space-y-1">{cells.get(date) ?? null}</div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
