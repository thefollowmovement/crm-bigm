import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { formatDateFr, todayParis } from "@/lib/dates";
import {
  COMM_TASK_TYPE_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
} from "@/lib/labels";
import {
  canTransitionCommTask,
  formatCommTaskNumber,
  getCommTask,
  isCommTaskLate,
  listCommMembers,
} from "@/services/comm-tasks.service";
import { ForbiddenError } from "@/lib/authz/guards";
import { AccessDenied } from "@/components/access-denied";
import { EntityHistory } from "@/components/entity-history";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import {
  AssignCommTaskForm,
  CommTaskCommentForm,
  TransitionCommTaskButtons,
} from "../comm-components";

export const metadata: Metadata = { title: "Tâche communication" };

const ALL_STATUSES = [
  "NOUVEAU",
  "AFFECTE",
  "EN_COURS",
  "EN_ATTENTE",
  "TERMINE",
  "VALIDE",
] as const;

export default async function CommTaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!can(user, "commtask:read")) return <AccessDenied />;

  const { id } = await params;
  let task;
  try {
    task = await getCommTask(user, id);
  } catch (e) {
    if (e instanceof ForbiddenError) return <AccessDenied />;
    throw e;
  }
  if (!task) notFound();

  const hasWrite = can(user, "commtask:write");
  const today = todayParis();
  const late = isCommTaskLate(task, today);
  const nextStatuses = ALL_STATUSES.filter(
    (next) =>
      canTransitionCommTask(task.status, next, {
        isRequester: task.requesterId === user.id,
        hasWrite,
        role: user.role,
      }).allowed
  );
  const members = hasWrite ? await listCommMembers(user) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            {formatCommTaskNumber(task.number)} — {task.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {COMM_TASK_TYPE_LABELS[task.type]} · demandé par{" "}
            {task.requester.firstName} {task.requester.lastName}
            {task.store ? (
              <>
                {" "}
                · boutique{" "}
                <Link
                  href={`/boutiques/${task.store.id}`}
                  className="underline-offset-2 hover:underline"
                >
                  {task.store.code}
                </Link>
              </>
            ) : null}
            {task.partner ? ` · partenaire ${task.partner.companyName}` : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {late ? <Badge variant="destructive">En retard</Badge> : null}
          <Badge
            variant={task.status === "VALIDE" ? "success" : "secondary"}
            data-testid="comm-task-status"
          >
            {TICKET_STATUS_LABELS[task.status]}
          </Badge>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="whitespace-pre-wrap text-sm">{task.description ?? "—"}</p>
              {task.attachments.length > 0 ? (
                <ul className="list-inside list-disc text-sm">
                  {task.attachments.map((a) => (
                    <li key={a.id}>
                      <a
                        href={`/api/files/${a.id}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {a.originalName}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Commentaires</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {task.comments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun commentaire.</p>
              ) : (
                <ul className="space-y-3" data-testid="comm-comments">
                  {task.comments.map((comment) => (
                    <li key={comment.id} className="rounded-lg border p-3 text-sm">
                      <div className="mb-1 text-xs text-muted-foreground">
                        {comment.author.firstName} {comment.author.lastName}
                      </div>
                      <p className="whitespace-pre-wrap">{comment.body}</p>
                    </li>
                  ))}
                </ul>
              )}
              <CommTaskCommentForm taskId={task.id} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Suivi</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">Priorité</span>
                <span>{TICKET_PRIORITY_LABELS[task.priority]}</span>
                <span className="text-muted-foreground">Échéance</span>
                <span>{task.dueDate ? formatDateFr(task.dueDate) : "—"}</span>
                <span className="text-muted-foreground">Publication</span>
                <span className={late ? "font-medium text-destructive" : ""}>
                  {task.publicationDate ? formatDateFr(task.publicationDate) : "—"}
                </span>
                <span className="text-muted-foreground">Responsable</span>
                <span data-testid="comm-assignee">
                  {task.assignee
                    ? `${task.assignee.firstName} ${task.assignee.lastName}`
                    : "À affecter"}
                </span>
              </div>
              {hasWrite && task.status !== "VALIDE" ? (
                <AssignCommTaskForm
                  taskId={task.id}
                  currentAssigneeId={task.assigneeId}
                  members={members.map((m) => ({
                    id: m.id,
                    label: `${m.firstName} ${m.lastName}`,
                  }))}
                />
              ) : null}
              <TransitionCommTaskButtons
                taskId={task.id}
                nextStatuses={[...nextStatuses]}
              />
            </CardContent>
          </Card>

          <EntityHistory user={user} tableName="comm_tasks" recordId={task.id} />
        </div>
      </div>
    </div>
  );
}
