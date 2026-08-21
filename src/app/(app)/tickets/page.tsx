import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { todayParis } from "@/lib/dates";
import {
  POLE_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
} from "@/lib/labels";
import { isTicketLate, listTickets } from "@/services/tickets.service";
import { listStores } from "@/services/stores.service";
import { AccessDenied } from "@/components/access-denied";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { CreateTicketDialog, TicketFilters } from "./ticket-dialogs";

export const metadata: Metadata = { title: "Tickets" };

const STATUS_VALUES = [
  "NOUVEAU",
  "AFFECTE",
  "EN_COURS",
  "EN_ATTENTE",
  "TERMINE",
  "VALIDE",
] as const;
const PRIORITY_VALUES = ["BASSE", "NORMALE", "HAUTE", "CRITIQUE"] as const;

function statusVariant(status: string) {
  switch (status) {
    case "NOUVEAU":
      return "brand" as const;
    case "AFFECTE":
    case "EN_COURS":
      return "info" as const;
    case "EN_ATTENTE":
      return "warning" as const;
    case "TERMINE":
      return "secondary" as const;
    default:
      return "success" as const;
  }
}

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!can(user, "ticket:read")) return <AccessDenied />;

  const params = await searchParams;
  const view =
    params.vue === "mine" || params.vue === "pole" || params.vue === "all"
      ? params.vue
      : "all";
  const status = STATUS_VALUES.find((s) => s === params.statut);
  const priority = PRIORITY_VALUES.find((p) => p === params.priorite);

  const [rows, stores] = await Promise.all([
    listTickets(user, { view, status, priority }),
    listStores(user),
  ]);
  const today = todayParis();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Tickets inter-pôles</h1>
          <p className="text-sm text-muted-foreground">
            Toutes les demandes entre services — fini WhatsApp, tout est tracé.
          </p>
        </div>
        <CreateTicketDialog
          stores={stores.map((s) => ({ id: s.id, label: `${s.code} — ${s.name}` }))}
        />
      </div>

      <TicketFilters current={{ vue: view, statut: status, priorite: priority }} />

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>N°</TableHead>
              <TableHead>Objet</TableHead>
              <TableHead>De → Vers</TableHead>
              <TableHead>Boutique</TableHead>
              <TableHead>Priorité</TableHead>
              <TableHead>Échéance</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Responsable</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  Aucun ticket.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((ticket) => {
                const late = isTicketLate(ticket, today);
                const number = `T-${String(ticket.number).padStart(6, "0")}`;
                return (
                  <TableRow key={ticket.id} data-testid={`ticket-row-${number}`}>
                    <TableCell>
                      <Link
                        href={`/tickets/${ticket.id}`}
                        className="font-medium text-brand hover:underline"
                      >
                        {number}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-64">
                      <Link href={`/tickets/${ticket.id}`} className="hover:underline">
                        <span className="line-clamp-1 font-medium">{ticket.title}</span>
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {POLE_LABELS[ticket.fromPole]} → {POLE_LABELS[ticket.toPole]}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {ticket.store ? ticket.store.code : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          ticket.priority === "CRITIQUE"
                            ? "destructive"
                            : ticket.priority === "HAUTE"
                              ? "warning"
                              : "secondary"
                        }
                      >
                        {TICKET_PRIORITY_LABELS[ticket.priority]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {ticket.dueDate ? (
                        late ? (
                          <Badge variant="destructive">En retard</Badge>
                        ) : (
                          <span className="text-muted-foreground">{ticket.dueDate}</span>
                        )
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(ticket.status)}>
                        {TICKET_STATUS_LABELS[ticket.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {ticket.assignee
                        ? `${ticket.assignee.firstName} ${ticket.assignee.lastName}`
                        : "—"}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
