import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { formatDateFr } from "@/lib/dates";
import {
  formatTransmissionNumber,
  listStructureOptionsForEmitter,
  listTransmissions,
  type Transmission,
} from "@/services/transmissions.service";
import { listInvites } from "@/services/transmission-invites.service";
import { listStores } from "@/services/stores.service";
import { AccessDenied } from "@/components/access-denied";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  EXTERNAL_CATEGORY_LABELS,
  TRANSMISSION_CASE_LABELS,
  TRANSMISSION_STATUS_LABELS,
  TRANSMISSION_TYPE_LABELS,
} from "@/lib/labels";
import { formatEUR } from "@/lib/money";

import {
  CreateTransmissionDialog,
  InviteDialog,
  RevokeInviteButton,
} from "./transmission-components";

export const metadata: Metadata = { title: "Transmissions comptables" };

const STATUS_BADGES: Record<string, "success" | "secondary" | "destructive" | "outline"> = {
  EN_ATTENTE: "secondary",
  VALIDEE: "success",
  REJETEE: "destructive",
  TRAITEE: "outline",
};

export default async function TransmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string; type?: string; origine?: string }>;
}) {
  const user = await requireUser();
  const manage = can(user, "transmission:manage");
  if (!manage && !can(user, "transmission:create")) return <AccessDenied />;
  const params = await searchParams;

  const status =
    params.statut && params.statut in TRANSMISSION_STATUS_LABELS
      ? (params.statut as Transmission["status"])
      : null;
  const type =
    params.type === "DEMANDE" || params.type === "FACTURE"
      ? (params.type as Transmission["type"])
      : null;
  const origin =
    params.origine === "INTERNE" || params.origine === "EXTERNE"
      ? (params.origine as Transmission["origin"])
      : null;

  const canCreate = can(user, "transmission:create");
  const [rows, structures, stores, invites] = await Promise.all([
    listTransmissions(user, { status, type, origin }),
    canCreate ? listStructureOptionsForEmitter(user) : Promise.resolve([]),
    canCreate && can(user, "store:read") ? listStores(user) : Promise.resolve([]),
    manage ? listInvites(user) : Promise.resolve([]),
  ]);
  const structureOptions = structures.map((s) => ({
    id: s.id,
    label: `${s.code} — ${s.name}`,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Transmissions comptables</h1>
          <p className="text-sm text-muted-foreground">
            {manage
              ? "Demandes et factures transmises par les équipes, les franchisés et les contacts externes."
              : "Vos demandes et factures transmises à la comptabilité, avec leur suivi."}
          </p>
        </div>
        <div className="flex gap-2">
          {manage ? <InviteDialog structures={structureOptions} /> : null}
          {canCreate ? (
            <CreateTransmissionDialog
              structures={structureOptions}
              stores={stores.map((s) => ({ id: s.id, label: s.name }))}
              isFranchise={user.role === "FRANCHISE"}
            />
          ) : null}
        </div>
      </div>

      {manage ? (
        <form className="flex flex-wrap items-end gap-3" method="get">
          <select
            name="statut"
            defaultValue={status ?? ""}
            className="h-9 rounded-full border border-input bg-transparent px-3 text-sm"
          >
            <option value="">Tous les statuts</option>
            {Object.entries(TRANSMISSION_STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <select
            name="type"
            defaultValue={type ?? ""}
            className="h-9 rounded-full border border-input bg-transparent px-3 text-sm"
          >
            <option value="">Demandes et factures</option>
            {Object.entries(TRANSMISSION_TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <select
            name="origine"
            defaultValue={origin ?? ""}
            className="h-9 rounded-full border border-input bg-transparent px-3 text-sm"
          >
            <option value="">Interne et externe</option>
            <option value="INTERNE">Interne</option>
            <option value="EXTERNE">Externe</option>
          </select>
          <Button type="submit" variant="outline" size="sm">
            Filtrer
          </Button>
        </form>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>
            {rows.length} transmission{rows.length > 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table data-testid="transmissions-table">
            <TableHeader>
              <TableRow>
                <TableHead>N°</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Cas d&apos;usage</TableHead>
                <TableHead>Objet</TableHead>
                <TableHead>Émetteur</TableHead>
                <TableHead className="text-right">Montant</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-8 text-center text-muted-foreground"
                  >
                    Aucune transmission pour l&apos;instant.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-sm">
                      <Link
                        className="underline-offset-2 hover:underline"
                        href={`/compta/transmissions/${t.id}`}
                      >
                        {formatTransmissionNumber(t.number)}
                      </Link>
                    </TableCell>
                    <TableCell>{TRANSMISSION_TYPE_LABELS[t.type]}</TableCell>
                    <TableCell>{TRANSMISSION_CASE_LABELS[t.caseType]}</TableCell>
                    <TableCell className="max-w-64 truncate font-medium">
                      {t.subject}
                    </TableCell>
                    <TableCell>
                      {t.origin === "EXTERNE" ? (
                        <span>
                          <Badge variant="outline">Externe</Badge>{" "}
                          {t.externalName ?? "—"}
                          {t.externalCategory ? (
                            <span className="block text-xs text-muted-foreground">
                              {EXTERNAL_CATEGORY_LABELS[t.externalCategory]}
                            </span>
                          ) : null}
                        </span>
                      ) : t.emitter ? (
                        `${t.emitter.firstName} ${t.emitter.lastName}`
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {t.amount ? formatEUR(t.amount) : "—"}
                    </TableCell>
                    <TableCell>
                      {formatDateFr(t.createdAt.toISOString().slice(0, 10))}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGES[t.status] ?? "secondary"}>
                        {TRANSMISSION_STATUS_LABELS[t.status]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {manage && invites.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Liens externes générés</CardTitle>
          </CardHeader>
          <CardContent>
            <Table data-testid="invites-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Contact</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead>Structure</TableHead>
                  <TableHead>Expire le</TableHead>
                  <TableHead>État</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invites.map((invite) => {
                  const state = invite.usedAt
                    ? { label: "Utilisé", variant: "outline" as const }
                    : invite.revokedAt
                      ? { label: "Révoqué", variant: "destructive" as const }
                      : invite.expiresAt.getTime() < Date.now()
                        ? { label: "Expiré", variant: "secondary" as const }
                        : { label: "Actif", variant: "success" as const };
                  return (
                    <TableRow key={invite.id}>
                      <TableCell>
                        {invite.email}
                        {invite.externalName ? (
                          <span className="block text-xs text-muted-foreground">
                            {invite.externalName}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {EXTERNAL_CATEGORY_LABELS[invite.category]}
                      </TableCell>
                      <TableCell>
                        {invite.structure
                          ? `${invite.structure.code} — ${invite.structure.name}`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {formatDateFr(invite.expiresAt.toISOString().slice(0, 10))}
                      </TableCell>
                      <TableCell>
                        <Badge variant={state.variant}>{state.label}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {state.label === "Actif" ? (
                          <RevokeInviteButton id={invite.id} />
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
