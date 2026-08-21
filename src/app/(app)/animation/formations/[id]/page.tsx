import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { formatDateFr } from "@/lib/dates";
import {
  TRAINING_DOC_KIND_LABELS,
  TRAINING_STATUS_LABELS,
  TRAINING_TYPE_LABELS,
} from "@/lib/labels";
import {
  canTransitionTraining,
  getTraining,
} from "@/services/trainings.service";
import { ForbiddenError } from "@/lib/authz/guards";
import { AccessDenied } from "@/components/access-denied";
import { EntityHistory } from "@/components/entity-history";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import {
  ParticipantForm,
  RemoveParticipantButton,
  TrainingDocsForm,
  TrainingReportForm,
  TransitionTrainingButtons,
} from "../training-components";

export const metadata: Metadata = { title: "Formation" };

const ALL_STATUSES = ["PLANIFIEE", "REALISEE", "VALIDEE", "ANNULEE"] as const;

export default async function TrainingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!can(user, "training:read")) return <AccessDenied />;

  const { id } = await params;
  let training;
  try {
    training = await getTraining(user, id);
  } catch (e) {
    if (e instanceof ForbiddenError) return <AccessDenied />;
    throw e;
  }
  if (!training) notFound();

  const canWrite = can(user, "training:write");
  const isOpen = training.status === "PLANIFIEE" || training.status === "REALISEE";
  const nextStatuses = canWrite
    ? ALL_STATUSES.filter(
        (next) =>
          canTransitionTraining(training.status, next, {
            hasReport: training.report !== null && training.report.trim() !== "",
            isTrainer: training.trainerId === user.id,
            role: user.role,
          }).allowed
      )
    : [];

  const remis = training.documents.filter((d) => d.kind === "REMIS");
  const signes = training.documents.filter((d) => d.kind === "SIGNE");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            {TRAINING_TYPE_LABELS[training.type]} — {training.store.code}{" "}
            {training.store.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            Le {formatDateFr(training.trainingDate)} · formateur :{" "}
            {training.trainer.firstName} {training.trainer.lastName}
            {training.franchisee ? ` · ${training.franchisee.companyName}` : ""}
            {training.validatedBy
              ? ` · validée par ${training.validatedBy.firstName} ${training.validatedBy.lastName}`
              : ""}
          </p>
        </div>
        <Badge
          variant={training.status === "VALIDEE" ? "success" : "secondary"}
          data-testid="training-status"
        >
          {TRAINING_STATUS_LABELS[training.status]}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Participants</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {training.participants.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun participant.</p>
            ) : (
              <ul className="space-y-1 text-sm" data-testid="participants-list">
                {training.participants.map((p) => (
                  <li key={p.id} className="flex items-center justify-between">
                    <span>{p.name}</span>
                    {canWrite && isOpen ? (
                      <RemoveParticipantButton participantId={p.id} />
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {canWrite && isOpen ? <ParticipantForm trainingId={training.id} /> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Compte rendu</CardTitle>
          </CardHeader>
          <CardContent>
            {canWrite && isOpen ? (
              <TrainingReportForm
                trainingId={training.id}
                report={training.report}
                notes={training.notes}
              />
            ) : (
              <div className="space-y-3 text-sm">
                <p className="whitespace-pre-wrap" data-testid="training-report">
                  {training.report ?? "—"}
                </p>
                {training.notes ? (
                  <p className="whitespace-pre-wrap text-muted-foreground">
                    {training.notes}
                  </p>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {training.documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun document rattaché.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { label: TRAINING_DOC_KIND_LABELS.REMIS, docs: remis, testId: "docs-remis" },
                { label: TRAINING_DOC_KIND_LABELS.SIGNE, docs: signes, testId: "docs-signes" },
              ].map((group) => (
                <div key={group.label} data-testid={group.testId}>
                  <div className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                    {group.label}
                  </div>
                  {group.docs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">—</p>
                  ) : (
                    <ul className="list-inside list-disc text-sm">
                      {group.docs.map((doc) => (
                        <li key={doc.id}>
                          <a
                            href={`/api/files/${doc.file.id}`}
                            className="underline-offset-2 hover:underline"
                          >
                            {doc.file.originalName}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
          {canWrite && isOpen ? <TrainingDocsForm trainingId={training.id} /> : null}
        </CardContent>
      </Card>

      {nextStatuses.length > 0 ? (
        <TransitionTrainingButtons
          trainingId={training.id}
          nextStatuses={[...nextStatuses]}
        />
      ) : null}

      <EntityHistory user={user} tableName="trainings" recordId={training.id} />
    </div>
  );
}
