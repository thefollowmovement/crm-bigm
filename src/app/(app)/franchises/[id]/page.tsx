import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { toFranchiseeDTO } from "@/lib/authz/field-visibility";
import { STORE_STATUS_LABELS } from "@/lib/labels";
import { getFranchisee } from "@/services/franchisees.service";
import { ForbiddenError } from "@/lib/authz/guards";
import { AccessDenied } from "@/components/access-denied";
import { EntityHistory } from "@/components/entity-history";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { FranchiseeForm } from "../franchisee-form";
import { listSignedDocsForFranchisee } from "@/services/trainings.service";
import type { SessionUser } from "@/lib/auth/session";
import { formatDateFr } from "@/lib/dates";
import { TRAINING_TYPE_LABELS } from "@/lib/labels";

export const metadata: Metadata = { title: "Fiche franchisé" };

// Documents signés en formation, rattachés automatiquement (cdc §9).
async function SignedTrainingDocs({
  user,
  franchiseeId,
}: {
  user: SessionUser;
  franchiseeId: string;
}) {
  const docs = await listSignedDocsForFranchisee(user, franchiseeId);
  if (docs.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Documents signés (formations)</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1 text-sm" data-testid="signed-training-docs">
          {docs.map((doc) => (
            <li key={doc.fileId}>
              <a
                href={`/api/files/${doc.fileId}`}
                className="font-medium underline-offset-2 hover:underline"
              >
                {doc.originalName}
              </a>{" "}
              <span className="text-muted-foreground">
                — {TRAINING_TYPE_LABELS[doc.trainingType]} du{" "}
                {formatDateFr(doc.trainingDate)}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm">{value ?? "—"}</dd>
    </div>
  );
}

export default async function FicheFranchisePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();

  const { id } = await params;
  let franchisee;
  try {
    franchisee = await getFranchisee(user, id);
  } catch (e) {
    if (e instanceof ForbiddenError) return <AccessDenied />;
    throw e;
  }
  if (!franchisee) notFound();

  const dto = toFranchiseeDTO(franchisee, user);
  const canWrite = can(user, "franchisee:write");
  const canAudit = can(user, "audit:read");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold" data-testid="franchisee-title">
          {dto.companyName}
        </h1>
        {dto.legalForm ? <Badge variant="secondary">{dto.legalForm}</Badge> : null}
      </div>

      <Tabs defaultValue="infos">
        <TabsList>
          <TabsTrigger value="infos">Informations</TabsTrigger>
          {canAudit ? <TabsTrigger value="historique">Historique</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="infos" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Société</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Info
                  label="Contact"
                  value={`${dto.contactFirstName} ${dto.contactLastName}`}
                />
                <Info label="SIREN" value={dto.siren} />
                <Info label="E-mail" value={dto.email} />
                <Info label="Téléphone" value={dto.phone} />
                <Info label="Adresse" value={dto.address} />
                <Info
                  label="Ville"
                  value={[dto.postalCode, dto.city].filter(Boolean).join(" ") || null}
                />
              </dl>
              {"notes" in dto && dto.notes ? (
                <div className="mt-6 rounded-lg border border-amber-300/50 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
                  <div className="text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
                    Notes internes (siège)
                  </div>
                  <p className="mt-1 whitespace-pre-wrap">{dto.notes}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Boutiques rattachées</CardTitle>
            </CardHeader>
            <CardContent>
              {franchisee.stores.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune boutique.</p>
              ) : (
                <ul className="space-y-2">
                  {franchisee.stores.map((s) => (
                    <li key={s.id} className="flex items-center gap-3 text-sm">
                      <Link
                        href={`/boutiques/${s.id}`}
                        className="font-medium text-brand hover:underline"
                      >
                        {s.code} — {s.name}
                      </Link>
                      <Badge variant="secondary">
                        {STORE_STATUS_LABELS[s.status]}
                      </Badge>
                      <span className="text-muted-foreground">{s.city}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {franchisee.users.length > 0 && user.role !== "FRANCHISE" ? (
            <Card>
              <CardHeader>
                <CardTitle>Accès CRM du franchisé</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm">
                  {franchisee.users.map((u) => (
                    <li key={u.id}>
                      {u.firstName} {u.lastName}{" "}
                      <span className="text-muted-foreground">({u.email})</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {can(user, "training:read") ? (
            <SignedTrainingDocs user={user} franchiseeId={franchisee.id} />
          ) : null}

          {canWrite ? (
            <Card>
              <CardHeader>
                <CardTitle>Modifier la fiche</CardTitle>
              </CardHeader>
              <CardContent>
                <FranchiseeForm
                  franchisee={dto}
                  canSeeNotes={"notes" in dto}
                />
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        {canAudit ? (
          <TabsContent value="historique">
            <EntityHistory
              user={user}
              tableName="franchisees"
              recordId={franchisee.id}
            />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
