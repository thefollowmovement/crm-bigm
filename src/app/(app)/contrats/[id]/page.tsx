import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { formatDateFr } from "@/lib/dates";
import { CONTRACT_STATUS_LABELS, CONTRACT_TYPE_LABELS } from "@/lib/labels";
import { getContract } from "@/services/contracts.service";
import { ForbiddenError } from "@/lib/authz/guards";
import { AccessDenied } from "@/components/access-denied";
import { EntityHistory } from "@/components/entity-history";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { EditContractForm } from "../contract-form";
import { AttachmentUpload } from "./attachment-upload";

export const metadata: Metadata = { title: "Contrat" };

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!can(user, "contract:read")) return <AccessDenied />;

  const { id } = await params;
  let contract;
  try {
    contract = await getContract(user, id);
  } catch (e) {
    if (e instanceof ForbiddenError) return <AccessDenied />;
    throw e;
  }
  if (!contract) notFound();

  const canWrite = can(user, "contract:write");
  const canAudit = can(user, "audit:read");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold" data-testid="contract-title">
          {CONTRACT_TYPE_LABELS[contract.type]}
          {contract.reference ? ` — ${contract.reference}` : ""}
        </h1>
        <Badge variant={contract.status === "ACTIF" ? "success" : "secondary"}>
          {CONTRACT_STATUS_LABELS[contract.status]}
        </Badge>
        <Link
          href={`/boutiques/${contract.store.id}`}
          className="text-sm text-brand hover:underline"
        >
          {contract.store.code} — {contract.store.name}
        </Link>
      </div>

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Détails</TabsTrigger>
          <TabsTrigger value="documents">
            Documents ({contract.attachments.length})
          </TabsTrigger>
          {canAudit ? <TabsTrigger value="historique">Historique</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="details" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Échéances</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">Signé le</dt>
                  <dd>{formatDateFr(contract.signedAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">Début</dt>
                  <dd>{formatDateFr(contract.startDate)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">Fin</dt>
                  <dd data-testid="contract-end-date">{formatDateFr(contract.endDate)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">Alerte</dt>
                  <dd>
                    {contract.alertMonthsBefore} mois avant
                    {contract.expiryAlertSentAt ? " (envoyée)" : ""}
                  </dd>
                </div>
              </dl>
              {contract.franchisee ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  Signataire : {contract.franchisee.companyName}
                </p>
              ) : null}
              {contract.parentContract ? (
                <p className="mt-1 text-sm">
                  Avenant du contrat{" "}
                  <Link
                    href={`/contrats/${contract.parentContract.id}`}
                    className="text-brand hover:underline"
                  >
                    {contract.parentContract.reference ??
                      CONTRACT_TYPE_LABELS[contract.parentContract.type]}
                  </Link>
                </p>
              ) : null}
              {contract.amendments.length > 0 ? (
                <div className="mt-4 text-sm">
                  <div className="text-xs uppercase text-muted-foreground">Avenants</div>
                  <ul className="mt-1 space-y-1">
                    {contract.amendments.map((a) => (
                      <li key={a.id}>
                        <Link
                          href={`/contrats/${a.id}`}
                          className="text-brand hover:underline"
                        >
                          {a.reference ?? CONTRACT_TYPE_LABELS[a.type]}
                        </Link>{" "}
                        <Badge variant="secondary">
                          {CONTRACT_STATUS_LABELS[a.status]}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {contract.notes ? (
                <p className="mt-4 whitespace-pre-wrap text-sm">{contract.notes}</p>
              ) : null}
            </CardContent>
          </Card>

          {canWrite ? (
            <Card>
              <CardHeader>
                <CardTitle>Modifier le contrat</CardTitle>
              </CardHeader>
              <CardContent>
                <EditContractForm
                  contract={{
                    id: contract.id,
                    storeId: contract.store.id,
                    type: contract.type,
                    status: contract.status,
                    reference: contract.reference,
                    signedAt: contract.signedAt,
                    startDate: contract.startDate,
                    endDate: contract.endDate,
                    alertMonthsBefore: contract.alertMonthsBefore,
                    parentContractId: contract.parentContractId,
                    notes: contract.notes,
                  }}
                />
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        <TabsContent value="documents" className="space-y-4">
          {contract.attachments.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Aucun document (contrat signé, DIP, annexes…).
            </p>
          ) : (
            <ul className="space-y-2">
              {contract.attachments.map((file) => (
                <li
                  key={file.id}
                  className="flex items-center justify-between rounded-lg border bg-card p-3 text-sm"
                >
                  <span>{file.originalName}</span>
                  <Button variant="outline" size="sm" asChild>
                    <a href={`/api/files/${file.id}`} data-testid="contract-file-download">
                      <Download /> Télécharger
                    </a>
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {canWrite ? <AttachmentUpload contractId={contract.id} /> : null}
        </TabsContent>

        {canAudit ? (
          <TabsContent value="historique">
            <EntityHistory user={user} tableName="contracts" recordId={contract.id} />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
