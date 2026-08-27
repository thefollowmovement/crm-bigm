import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { ForbiddenError } from "@/lib/authz/guards";
import { formatDateFr, todayParis } from "@/lib/dates";
import {
  formatTransmissionNumber,
  getTransmission,
} from "@/services/transmissions.service";
import { listStructures } from "@/services/acct-structures.service";
import { AccessDenied } from "@/components/access-denied";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  EXTERNAL_CATEGORY_LABELS,
  POLE_LABELS,
  TRANSMISSION_CASE_LABELS,
  TRANSMISSION_STATUS_LABELS,
  TRANSMISSION_TYPE_LABELS,
} from "@/lib/labels";
import { formatEUR } from "@/lib/money";

import { ConvertForm, StatusForm } from "../transmission-components";

export const metadata: Metadata = { title: "Transmission" };

const STATUS_BADGES: Record<string, "success" | "secondary" | "destructive" | "outline"> = {
  EN_ATTENTE: "secondary",
  VALIDEE: "success",
  REJETEE: "destructive",
  TRAITEE: "outline",
};

export default async function TransmissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  let transmission;
  try {
    transmission = await getTransmission(user, id);
  } catch (e) {
    if (e instanceof ForbiddenError) return <AccessDenied />;
    throw e;
  }
  if (!transmission) notFound();

  const manage = can(user, "transmission:manage");
  const canConvert =
    manage &&
    can(user, "accounting:write") &&
    transmission.type === "FACTURE" &&
    transmission.status === "VALIDEE" &&
    !transmission.invoiceId;

  const structures = canConvert ? await listStructures(user, { active: "actives" }) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href="/compta/transmissions" className="hover:underline">
              Transmissions
            </Link>{" "}
            / {formatTransmissionNumber(transmission.number)}
          </p>
          <h1
            className="flex flex-wrap items-center gap-2 text-2xl font-semibold"
            data-testid="transmission-title"
          >
            {transmission.subject}
            <Badge variant={STATUS_BADGES[transmission.status] ?? "secondary"}>
              {TRANSMISSION_STATUS_LABELS[transmission.status]}
            </Badge>
          </h1>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Détails</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Type</dt>
                  <dd className="font-medium">
                    {TRANSMISSION_TYPE_LABELS[transmission.type]}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Cas d&apos;usage</dt>
                  <dd className="font-medium">
                    {TRANSMISSION_CASE_LABELS[transmission.caseType]}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Émetteur</dt>
                  <dd className="font-medium">
                    {transmission.origin === "EXTERNE" ? (
                      <>
                        <Badge variant="outline">Externe</Badge>{" "}
                        {transmission.externalName ?? "—"}
                        {transmission.externalEmail ? (
                          <span className="block text-xs text-muted-foreground">
                            {transmission.externalEmail}
                            {transmission.externalCategory
                              ? ` · ${EXTERNAL_CATEGORY_LABELS[transmission.externalCategory]}`
                              : null}
                          </span>
                        ) : null}
                      </>
                    ) : transmission.emitter ? (
                      `${transmission.emitter.firstName} ${transmission.emitter.lastName}`
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Destinataire</dt>
                  <dd className="font-medium">
                    {POLE_LABELS[transmission.targetPole] ?? transmission.targetPole}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Structure liée</dt>
                  <dd className="font-medium">
                    {transmission.structure
                      ? `${transmission.structure.code} — ${transmission.structure.name}`
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Boutique</dt>
                  <dd className="font-medium">{transmission.store?.name ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Montant</dt>
                  <dd className="font-medium tabular-nums">
                    {transmission.amount ? formatEUR(transmission.amount) : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Reçue le</dt>
                  <dd className="font-medium">
                    {formatDateFr(
                      transmission.createdAt.toISOString().slice(0, 10)
                    )}
                  </dd>
                </div>
                {manage && transmission.submittedIp ? (
                  <div>
                    <dt className="text-muted-foreground">IP de soumission</dt>
                    <dd className="font-mono text-xs">{transmission.submittedIp}</dd>
                  </div>
                ) : null}
                {transmission.invoice ? (
                  <div>
                    <dt className="text-muted-foreground">Facture au journal</dt>
                    <dd className="font-mono text-sm">
                      <Link href="/compta/factures" className="hover:underline">
                        {transmission.invoice.pieceNumber}
                      </Link>
                    </dd>
                  </div>
                ) : null}
              </dl>
              {transmission.message ? (
                <p className="mt-4 whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm">
                  {transmission.message}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                Pièces jointes ({transmission.attachments.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {transmission.attachments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune pièce jointe.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {transmission.attachments.map((file) => (
                    <li key={file.id}>
                      <a
                        href={`/api/files/${file.id}`}
                        className="font-medium underline-offset-2 hover:underline"
                        data-testid="transmission-attachment"
                      >
                        {file.originalName}
                      </a>{" "}
                      <span className="text-muted-foreground">
                        ({Math.max(1, Math.round(file.sizeBytes / 1024))} Ko)
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Historique des statuts</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm" data-testid="transmission-history">
                {transmission.events.map((event) => (
                  <li key={event.id} className="flex flex-wrap items-baseline gap-2">
                    <span className="text-muted-foreground">
                      {event.createdAt.toLocaleDateString("fr-FR")}{" "}
                      {event.createdAt.toLocaleTimeString("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="font-medium">
                      {event.oldStatus
                        ? `${TRANSMISSION_STATUS_LABELS[event.oldStatus]} → `
                        : ""}
                      {TRANSMISSION_STATUS_LABELS[event.newStatus]}
                    </span>
                    <span className="text-muted-foreground">
                      {event.user
                        ? `par ${event.user.firstName} ${event.user.lastName}`
                        : "(soumission externe)"}
                    </span>
                    {event.comment ? <span>— {event.comment}</span> : null}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {manage ? (
            <Card>
              <CardHeader>
                <CardTitle>Traitement</CardTitle>
              </CardHeader>
              <CardContent>
                <StatusForm
                  transmissionId={transmission.id}
                  currentStatus={transmission.status}
                />
              </CardContent>
            </Card>
          ) : null}
          {canConvert ? (
            <Card data-testid="convert-card">
              <CardHeader>
                <CardTitle>Convertir en facture</CardTitle>
              </CardHeader>
              <CardContent>
                <ConvertForm
                  transmissionId={transmission.id}
                  structures={structures.map((s) => ({
                    id: s.id,
                    label: `${s.code} — ${s.name}`,
                  }))}
                  defaults={{
                    structureId: transmission.structureId,
                    amount: transmission.amount,
                    date: todayParis(),
                  }}
                />
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
