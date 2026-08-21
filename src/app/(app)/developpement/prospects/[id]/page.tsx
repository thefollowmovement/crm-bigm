import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { formatDateFr, todayParis } from "@/lib/dates";
import {
  INTEREST_LEVEL_LABELS,
  PROSPECT_EVENT_TYPE_LABELS,
  PROSPECT_STATUS_LABELS,
} from "@/lib/labels";
import { formatEUR } from "@/lib/money";
import {
  getProspect,
  isFollowUpDue,
  listAgents,
  listDevMembers,
} from "@/services/prospects.service";
import { AccessDenied } from "@/components/access-denied";
import { EntityHistory } from "@/components/entity-history";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import {
  AddProspectEventForm,
  EditProspectForm,
  ProspectFilesForm,
  ProspectStatusForm,
} from "../prospect-components";

export const metadata: Metadata = { title: "Fiche prospect" };

export default async function ProspectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!can(user, "development:read")) return <AccessDenied />;

  const { id } = await params;
  const prospect = await getProspect(user, id);
  if (!prospect) notFound();

  const canWrite = can(user, "development:write");
  const today = todayParis();
  const due = isFollowUpDue(prospect, today);
  const [agents, devMembers] = await Promise.all([
    canWrite ? listAgents(user) : Promise.resolve([]),
    canWrite ? listDevMembers(user) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold" data-testid="prospect-title">
          {prospect.firstName} {prospect.lastName}
        </h1>
        <Badge variant="secondary" data-testid="prospect-status">
          {PROSPECT_STATUS_LABELS[prospect.status]}
        </Badge>
        {prospect.interestLevel ? (
          <Badge variant="outline">
            Intérêt {INTEREST_LEVEL_LABELS[prospect.interestLevel]}
          </Badge>
        ) : null}
        {due ? <Badge variant="destructive">À relancer</Badge> : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Fiche</CardTitle>
            </CardHeader>
            <CardContent>
              {canWrite ? (
                <EditProspectForm
                  prospectId={prospect.id}
                  agents={agents.map((a) => ({ id: a.id, label: a.name }))}
                  devMembers={devMembers.map((m) => ({
                    id: m.id,
                    label: `${m.firstName} ${m.lastName}`,
                  }))}
                  values={{
                    firstName: prospect.firstName,
                    lastName: prospect.lastName,
                    email: prospect.email,
                    phone: prospect.phone,
                    city: prospect.city,
                    targetZone: prospect.targetZone,
                    budget: prospect.budget,
                    personalContribution: prospect.personalContribution,
                    leadSource: prospect.leadSource,
                    interestLevel: prospect.interestLevel,
                    agentId: prospect.agentId,
                    assigneeId: prospect.assigneeId,
                    nextFollowUpDate: prospect.nextFollowUpDate,
                    notes: prospect.notes,
                  }}
                />
              ) : (
                <dl className="grid gap-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs uppercase text-muted-foreground">Budget</dt>
                    <dd>{prospect.budget ? formatEUR(prospect.budget) : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-muted-foreground">Relance</dt>
                    <dd>
                      {prospect.nextFollowUpDate
                        ? formatDateFr(prospect.nextFollowUpDate)
                        : "—"}
                    </dd>
                  </div>
                </dl>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Documents</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {prospect.attachments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun document.</p>
              ) : (
                <ul className="list-inside list-disc text-sm">
                  {prospect.attachments.map((a) => (
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
              )}
              {canWrite ? <ProspectFilesForm prospectId={prospect.id} /> : null}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {canWrite ? (
            <Card>
              <CardHeader>
                <CardTitle>Changer le statut</CardTitle>
              </CardHeader>
              <CardContent>
                <ProspectStatusForm
                  prospectId={prospect.id}
                  current={prospect.status}
                />
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Historique des échanges</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {prospect.events.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun événement.</p>
              ) : (
                <ul className="space-y-3" data-testid="prospect-events">
                  {prospect.events.map((event) => (
                    <li key={event.id} className="rounded-lg border p-3 text-sm">
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline">
                          {PROSPECT_EVENT_TYPE_LABELS[event.type]}
                        </Badge>
                        {formatDateFr(event.eventDate)} · {event.createdBy.firstName}{" "}
                        {event.createdBy.lastName}
                      </div>
                      {event.notes ? (
                        <p className="whitespace-pre-wrap">{event.notes}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {canWrite ? (
                <AddProspectEventForm prospectId={prospect.id} today={today} />
              ) : null}
            </CardContent>
          </Card>

          <EntityHistory user={user} tableName="prospects" recordId={prospect.id} />
        </div>
      </div>
    </div>
  );
}
