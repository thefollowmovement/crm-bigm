import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { formatDateFr, todayParis } from "@/lib/dates";
import {
  COMM_TASK_TYPE_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
} from "@/lib/labels";
import {
  formatCommTaskNumber,
  isCommTaskLate,
  listCommTasks,
  type CommTaskFilters as Filters,
} from "@/services/comm-tasks.service";
import { listPartners } from "@/services/partners.service";
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
import { ticketStatusVariant } from "@/app/(app)/tickets/status-variant";

import { CommTaskFilters, CreateCommTaskDialog } from "./comm-components";

export const metadata: Metadata = { title: "Tâches communication" };

const STATUSES = Object.keys(TICKET_STATUS_LABELS);
const TYPES = Object.keys(COMM_TASK_TYPE_LABELS);

export default async function CommunicationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!can(user, "commtask:read")) return <AccessDenied />;

  const params = await searchParams;
  const status =
    typeof params.statut === "string" && STATUSES.includes(params.statut)
      ? (params.statut as Filters["status"])
      : undefined;
  const type =
    typeof params.type === "string" && TYPES.includes(params.type)
      ? (params.type as Filters["type"])
      : undefined;

  const canWrite = can(user, "commtask:write");
  const [tasks, stores, partners] = await Promise.all([
    listCommTasks(user, { status, type }),
    listStores(user),
    can(user, "partner:read") ? listPartners(user) : Promise.resolve([]),
  ]);
  const today = todayParis();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Tâches communication</h1>
          <p className="text-sm text-muted-foreground">
            Créations, campagnes, réseaux sociaux, Ads et demandes des
            boutiques — jusqu&apos;à la validation du demandeur.
          </p>
        </div>
        {can(user, "commtask:request") ? (
          <CreateCommTaskDialog
            stores={stores.map((s) => ({ id: s.id, label: `${s.code} — ${s.name}` }))}
            partners={partners.map((p) => ({ id: p.id, label: p.companyName }))}
            canWrite={canWrite}
          />
        ) : null}
      </div>

      <CommTaskFilters
        current={{ statut: (status as string) ?? "", type: (type as string) ?? "" }}
      />

      <div className="rounded-xl border bg-card">
        <Table data-testid="comm-tasks-table">
          <TableHeader>
            <TableRow>
              <TableHead>N°</TableHead>
              <TableHead>Objet</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Demandeur</TableHead>
              <TableHead>Responsable</TableHead>
              <TableHead>Priorité</TableHead>
              <TableHead>Publication</TableHead>
              <TableHead>Statut</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  Aucune tâche pour ces filtres.
                </TableCell>
              </TableRow>
            ) : (
              tasks.map((task) => {
                const late = isCommTaskLate(task, today);
                return (
                  <TableRow key={task.id}>
                    <TableCell>
                      <Link
                        href={`/communication/${task.id}`}
                        className="font-mono text-sm font-medium underline-offset-2 hover:underline"
                      >
                        {formatCommTaskNumber(task.number)}
                      </Link>
                    </TableCell>
                    <TableCell className="font-medium">{task.title}</TableCell>
                    <TableCell>{COMM_TASK_TYPE_LABELS[task.type]}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {task.requester.firstName} {task.requester.lastName}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {task.assignee
                        ? `${task.assignee.firstName} ${task.assignee.lastName}`
                        : "—"}
                    </TableCell>
                    <TableCell>{TICKET_PRIORITY_LABELS[task.priority]}</TableCell>
                    <TableCell>
                      <span className={late ? "font-medium text-destructive" : ""}>
                        {task.publicationDate
                          ? formatDateFr(task.publicationDate)
                          : (task.dueDate ? formatDateFr(task.dueDate) : "—")}
                        {late ? " (en retard)" : ""}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={ticketStatusVariant(task.status)}>
                        {TICKET_STATUS_LABELS[task.status]}
                      </Badge>
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
