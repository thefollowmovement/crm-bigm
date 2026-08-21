import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { PREMISES_STATUS_LABELS } from "@/lib/labels";
import { listAgents } from "@/services/prospects.service";
import { getPremises } from "@/services/premises.service";
import { AccessDenied } from "@/components/access-denied";
import { EntityHistory } from "@/components/entity-history";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { EditPremisesForm, PremisesFilesForm } from "../premises-components";

export const metadata: Metadata = { title: "Fiche local" };

export default async function PremisesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!can(user, "development:read")) return <AccessDenied />;

  const { id } = await params;
  const premises = await getPremises(user, id);
  if (!premises) notFound();

  const canWrite = can(user, "development:write");
  const agents = canWrite ? await listAgents(user) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold" data-testid="premises-title">
          {premises.address}, {premises.city}
        </h1>
        <Badge variant="secondary">{PREMISES_STATUS_LABELS[premises.status]}</Badge>
        {premises.agent ? <Badge variant="outline">{premises.agent.name}</Badge> : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Fiche</CardTitle>
          </CardHeader>
          <CardContent>
            {canWrite ? (
              <EditPremisesForm
                premisesId={premises.id}
                agents={agents.map((a) => ({ id: a.id, label: a.name }))}
                values={{
                  address: premises.address,
                  city: premises.city,
                  postalCode: premises.postalCode,
                  surfaceM2: premises.surfaceM2,
                  monthlyRent: premises.monthlyRent,
                  leaseRights: premises.leaseRights,
                  status: premises.status,
                  agentId: premises.agentId,
                  notes: premises.notes,
                }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {premises.notes ?? "Aucune note."}
              </p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Photos & documents</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {premises.attachments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun document.</p>
              ) : (
                <ul className="list-inside list-disc text-sm" data-testid="premises-files">
                  {premises.attachments.map((a) => (
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
              {canWrite ? <PremisesFilesForm premisesId={premises.id} /> : null}
            </CardContent>
          </Card>

          <EntityHistory user={user} tableName="premises" recordId={premises.id} />
        </div>
      </div>
    </div>
  );
}
