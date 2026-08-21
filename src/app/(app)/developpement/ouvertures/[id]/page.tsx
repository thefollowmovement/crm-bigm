import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { ForbiddenError } from "@/lib/authz/guards";
import { formatDateFr, todayParis } from "@/lib/dates";
import {
  CHECKLIST_STATUS_LABELS,
  OPENING_PROJECT_STATUS_LABELS,
  OPENING_STEP_STATUS_LABELS,
  OPENING_STEP_TYPE_LABELS,
  POLE_LABELS,
} from "@/lib/labels";
import {
  canTransitionStep,
  canUpdateChecklistItem,
  getProject,
  isStepLate,
} from "@/services/openings.service";
import { AccessDenied } from "@/components/access-denied";
import { EntityHistory } from "@/components/entity-history";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import {
  AddChecklistItemForm,
  ChecklistStatusSelect,
  DeleteChecklistItemButton,
  EditProjectForm,
  StepFilesForm,
  StepPlanForm,
  StepTransitionButtons,
} from "../opening-components";

export const metadata: Metadata = { title: "Projet d'ouverture" };

const ALL_STEP_STATUSES = ["A_VENIR", "EN_COURS", "TERMINEE", "BLOQUEE"] as const;

function stepBadgeVariant(status: string, late: boolean) {
  if (late) return "destructive" as const;
  if (status === "TERMINEE") return "success" as const;
  if (status === "BLOQUEE") return "destructive" as const;
  if (status === "EN_COURS") return "secondary" as const;
  return "outline" as const;
}

export default async function OpeningDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!can(user, "opening:read")) return <AccessDenied />;

  const { id } = await params;
  let project;
  try {
    project = await getProject(user, id);
  } catch (e) {
    if (e instanceof ForbiddenError) return <AccessDenied />;
    throw e;
  }
  if (!project) notFound();

  const canWrite = can(user, "opening:write");
  const canChecklist = can(user, "opening:checklist");
  const today = todayParis();

  const poles = [...new Set(project.checklistItems.map((i) => i.pole))];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold" data-testid="opening-title">
          Ouverture {project.store.code} — {project.store.name}
        </h1>
        <Badge
          variant={project.status === "TERMINE" ? "success" : "secondary"}
          data-testid="opening-status"
        >
          {OPENING_PROJECT_STATUS_LABELS[project.status]}
        </Badge>
        <Badge variant="outline" data-testid="opening-progress">
          {project.progress.done}/{project.progress.total} jalons ·{" "}
          {project.progress.pct} %
        </Badge>
        <Link
          href={`/boutiques/${project.store.id}`}
          className="text-sm underline-offset-2 hover:underline"
        >
          Fiche boutique
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-4">
          {project.steps.map((step) => {
            const late = isStepLate(step, today);
            const nextStatuses = canWrite
              ? ALL_STEP_STATUSES.filter(
                  (next) => canTransitionStep(step.status, next).allowed
                )
              : [];
            return (
              <Card key={step.id} data-testid={`step-${step.step}`}>
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base">
                      {OPENING_STEP_TYPE_LABELS[step.step]}
                    </CardTitle>
                    <div className="flex items-center gap-2 text-sm">
                      {step.plannedDate ? (
                        <span className={late ? "font-medium text-destructive" : "text-muted-foreground"}>
                          prévu le {formatDateFr(step.plannedDate)}
                          {late ? " (en retard)" : ""}
                        </span>
                      ) : null}
                      {step.doneDate ? (
                        <span className="text-muted-foreground">
                          fait le {formatDateFr(step.doneDate)}
                        </span>
                      ) : null}
                      <Badge
                        variant={stepBadgeVariant(step.status, late)}
                        data-testid={`step-status-${step.step}`}
                      >
                        {OPENING_STEP_STATUS_LABELS[step.status]}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {step.notes ? (
                    <p className="whitespace-pre-wrap text-sm">{step.notes}</p>
                  ) : null}
                  {step.attachments.length > 0 ? (
                    <ul className="list-inside list-disc text-sm">
                      {step.attachments.map((a) => (
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
                  {canWrite ? (
                    <>
                      <StepPlanForm
                        projectId={project.id}
                        stepId={step.id}
                        plannedDate={step.plannedDate}
                        notes={step.notes}
                      />
                      <div className="flex flex-wrap items-center gap-3">
                        <StepTransitionButtons
                          projectId={project.id}
                          stepId={step.id}
                          nextStatuses={[...nextStatuses]}
                        />
                        <StepFilesForm projectId={project.id} stepId={step.id} />
                      </div>
                    </>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Checklist collaborative</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {project.checklistItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucun item pour l&apos;instant.
                </p>
              ) : (
                poles.map((pole) => (
                  <div key={pole} className="space-y-2">
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {POLE_LABELS[pole]}
                    </div>
                    <ul className="space-y-2" data-testid={`checklist-${pole}`}>
                      {project.checklistItems
                        .filter((item) => item.pole === pole)
                        .map((item) => {
                          const editable =
                            canChecklist &&
                            canUpdateChecklistItem(
                              { pole: user.pole, hasWrite: canWrite },
                              item.pole
                            );
                          const itemLate =
                            item.status !== "TERMINE" &&
                            item.dueDate !== null &&
                            item.dueDate < today;
                          return (
                            <li
                              key={item.id}
                              className="flex flex-wrap items-center gap-2 text-sm"
                            >
                              <span
                                className={
                                  item.status === "TERMINE"
                                    ? "text-muted-foreground line-through"
                                    : ""
                                }
                              >
                                {item.label}
                              </span>
                              {item.dueDate ? (
                                <span
                                  className={
                                    itemLate
                                      ? "text-xs font-medium text-destructive"
                                      : "text-xs text-muted-foreground"
                                  }
                                >
                                  {formatDateFr(item.dueDate)}
                                  {itemLate ? " (en retard)" : ""}
                                </span>
                              ) : null}
                              {editable ? (
                                <ChecklistStatusSelect
                                  projectId={project.id}
                                  itemId={item.id}
                                  status={item.status}
                                  disabled={false}
                                />
                              ) : (
                                <Badge variant="outline">
                                  {CHECKLIST_STATUS_LABELS[item.status]}
                                </Badge>
                              )}
                              {editable ? (
                                <DeleteChecklistItemButton
                                  projectId={project.id}
                                  itemId={item.id}
                                />
                              ) : null}
                            </li>
                          );
                        })}
                    </ul>
                  </div>
                ))
              )}
              {canChecklist ? <AddChecklistItemForm projectId={project.id} /> : null}
            </CardContent>
          </Card>

          {canWrite ? (
            <Card>
              <CardHeader>
                <CardTitle>Projet</CardTitle>
              </CardHeader>
              <CardContent>
                <EditProjectForm
                  projectId={project.id}
                  values={{
                    status: project.status,
                    targetOpeningDate: project.targetOpeningDate,
                    notes: project.notes,
                  }}
                />
              </CardContent>
            </Card>
          ) : project.notes ? (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">{project.notes}</p>
              </CardContent>
            </Card>
          ) : null}

          <EntityHistory
            user={user}
            tableName="opening_projects"
            recordId={project.id}
          />
        </div>
      </div>
    </div>
  );
}
