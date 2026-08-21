import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { formatDateFr, todayParis } from "@/lib/dates";
import {
  ACTION_PLAN_STATUS_LABELS,
  TICKET_PRIORITY_LABELS,
  VISIT_TYPE_LABELS,
} from "@/lib/labels";
import {
  canTransitionPlan,
  formatPlanNumber,
  getPlan,
  isPlanLate,
  listAssignableUsers,
} from "@/services/action-plans.service";
import { ForbiddenError } from "@/lib/authz/guards";
import { AccessDenied } from "@/components/access-denied";
import { EntityHistory } from "@/components/entity-history";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import {
  AssignPlanForm,
  PlanCommentForm,
  TransitionPlanButtons,
} from "./plan-detail-components";

export const metadata: Metadata = { title: "Plan d'action" };

const ALL_STATUSES = ["A_FAIRE", "EN_COURS", "TERMINE", "VALIDE", "ANNULE"] as const;

export default async function PlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!can(user, "actionplan:read")) return <AccessDenied />;

  const { id } = await params;
  let plan;
  try {
    plan = await getPlan(user, id);
  } catch (e) {
    if (e instanceof ForbiddenError) return <AccessDenied />;
    throw e;
  }
  if (!plan) notFound();

  const canWrite = can(user, "actionplan:write");
  const today = todayParis();
  const late = isPlanLate(plan, today);
  const nextStatuses = canWrite
    ? ALL_STATUSES.filter(
        (next) =>
          canTransitionPlan(plan.status, next, {
            isCreator: plan.createdById === user.id,
            role: user.role,
          }).allowed
      )
    : [];
  const assignees = canWrite ? await listAssignableUsers(user) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            {formatPlanNumber(plan.number)} — {plan.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            Boutique {plan.store.code} — {plan.store.name} · créé par{" "}
            {plan.createdBy.firstName} {plan.createdBy.lastName}
            {plan.visit ? (
              <>
                {" "}
                · issu de la visite{" "}
                <Link
                  href={`/animation/visites/${plan.visit.id}`}
                  className="underline-offset-2 hover:underline"
                >
                  {VISIT_TYPE_LABELS[plan.visit.type]} du{" "}
                  {formatDateFr(plan.visit.visitDate)}
                </Link>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {late ? <Badge variant="destructive">En retard</Badge> : null}
          <Badge
            variant={plan.status === "VALIDE" ? "success" : "secondary"}
            data-testid="plan-status"
          >
            {ACTION_PLAN_STATUS_LABELS[plan.status]}
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
              <p className="whitespace-pre-wrap text-sm">
                {plan.description ?? "—"}
              </p>
              {plan.attachments.length > 0 ? (
                <ul className="list-inside list-disc text-sm">
                  {plan.attachments.map((a) => (
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
              {plan.comments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucun commentaire.
                </p>
              ) : (
                <ul className="space-y-3" data-testid="plan-comments">
                  {plan.comments.map((comment) => (
                    <li key={comment.id} className="rounded-lg border p-3 text-sm">
                      <div className="mb-1 text-xs text-muted-foreground">
                        {comment.author.firstName} {comment.author.lastName}
                      </div>
                      <p className="whitespace-pre-wrap">{comment.body}</p>
                    </li>
                  ))}
                </ul>
              )}
              {canWrite ? <PlanCommentForm planId={plan.id} /> : null}
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
                <span>{TICKET_PRIORITY_LABELS[plan.priority]}</span>
                <span className="text-muted-foreground">Échéance</span>
                <span className={late ? "font-medium text-destructive" : ""}>
                  {plan.dueDate ? formatDateFr(plan.dueDate) : "—"}
                </span>
                <span className="text-muted-foreground">Responsable</span>
                <span data-testid="plan-assignee">
                  {plan.assignee
                    ? `${plan.assignee.firstName} ${plan.assignee.lastName}`
                    : "À affecter"}
                </span>
                <span className="text-muted-foreground">Terminé le</span>
                <span>
                  {plan.completedAt
                    ? formatDateFr(plan.completedAt.toISOString().slice(0, 10))
                    : "—"}
                </span>
                <span className="text-muted-foreground">Validé le</span>
                <span>
                  {plan.validatedAt
                    ? formatDateFr(plan.validatedAt.toISOString().slice(0, 10))
                    : "—"}
                </span>
              </div>
              {canWrite &&
              plan.status !== "VALIDE" &&
              plan.status !== "ANNULE" ? (
                <AssignPlanForm
                  planId={plan.id}
                  currentAssigneeId={plan.assigneeId}
                  assignees={assignees.map((a) => ({
                    id: a.id,
                    label: `${a.firstName} ${a.lastName}`,
                  }))}
                />
              ) : null}
              <TransitionPlanButtons
                planId={plan.id}
                nextStatuses={[...nextStatuses]}
              />
            </CardContent>
          </Card>

          <EntityHistory user={user} tableName="action_plans" recordId={plan.id} />
        </div>
      </div>
    </div>
  );
}
