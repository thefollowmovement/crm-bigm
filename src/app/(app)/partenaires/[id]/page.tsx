import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { TICKET_STATUS_LABELS } from "@/lib/labels";
import { getPartner } from "@/services/partners.service";
import { formatCommTaskNumber } from "@/services/comm-tasks.service";
import { listStores } from "@/services/stores.service";
import { AccessDenied } from "@/components/access-denied";
import { EntityHistory } from "@/components/entity-history";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ticketStatusVariant } from "@/app/(app)/tickets/status-variant";

import { EditPartnerForm, PartnerStoresEditor } from "../partner-components";

export const metadata: Metadata = { title: "Fiche partenaire" };

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 whitespace-pre-wrap text-sm">{value ?? "—"}</dd>
    </div>
  );
}

export default async function PartnerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!can(user, "partner:read")) return <AccessDenied />;

  const { id } = await params;
  const partner = await getPartner(user, id);
  if (!partner) notFound();

  const canWrite = can(user, "partner:write");
  const stores = canWrite ? await listStores(user) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold" data-testid="partner-title">
          {partner.companyName}
        </h1>
        {partner.domain ? <Badge variant="secondary">{partner.domain}</Badge> : null}
        <Badge variant={partner.isActive ? "success" : "outline"}>
          {partner.isActive ? "Actif" : "Inactif"}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Informations</CardTitle>
          </CardHeader>
          <CardContent>
            {canWrite ? (
              <EditPartnerForm
                partnerId={partner.id}
                values={{
                  companyName: partner.companyName,
                  contactName: partner.contactName,
                  phone: partner.phone,
                  email: partner.email,
                  domain: partner.domain,
                  tariffNotes: partner.tariffNotes,
                  scopeNotes: partner.scopeNotes,
                  internalNotes: partner.internalNotes ?? null,
                }}
              />
            ) : (
              <dl className="grid gap-4 sm:grid-cols-2" data-testid="partner-info">
                <Info label="Interlocuteur" value={partner.contactName} />
                <Info label="Téléphone" value={partner.phone} />
                <Info label="E-mail" value={partner.email} />
                <Info label="Domaine" value={partner.domain} />
                <Info label="Devis / tarifs" value={partner.tariffNotes} />
                <Info label="Champ d'action" value={partner.scopeNotes} />
              </dl>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Boutiques concernées</CardTitle>
            </CardHeader>
            <CardContent>
              {canWrite ? (
                <PartnerStoresEditor
                  partnerId={partner.id}
                  stores={stores.map((s) => ({
                    id: s.id,
                    label: `${s.code} — ${s.name}`,
                  }))}
                  selected={partner.stores.map((s) => s.id)}
                />
              ) : partner.stores.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune boutique.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {partner.stores.map((store) => (
                    <li key={store.id}>
                      <Link
                        href={`/boutiques/${store.id}`}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {store.code} — {store.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tâches liées</CardTitle>
            </CardHeader>
            <CardContent>
              {partner.tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune tâche.</p>
              ) : (
                <ul className="space-y-1 text-sm" data-testid="partner-tasks">
                  {partner.tasks.map((task) => (
                    <li key={task.id} className="flex items-center gap-2">
                      <Link
                        href={`/communication/${task.id}`}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {formatCommTaskNumber(task.number)} — {task.title}
                      </Link>
                      <Badge variant={ticketStatusVariant(task.status)}>
                        {TICKET_STATUS_LABELS[task.status]}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <EntityHistory user={user} tableName="partners" recordId={partner.id} />
        </div>
      </div>
    </div>
  );
}
