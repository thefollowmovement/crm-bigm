import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { todayParis } from "@/lib/dates";
import {
  listImports,
  listStructures,
  type AcctStructure,
} from "@/services/acct-structures.service";
import { listStructuresWithAggregates } from "@/services/acct-invoices.service";
import { listStores } from "@/services/stores.service";
import { AccessDenied } from "@/components/access-denied";
import { InfoHint } from "@/components/info-hint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ACCT_IMPORT_STATUS_LABELS,
  ACCT_STRUCTURE_TYPE_LABELS,
} from "@/lib/labels";
import { formatDateFr } from "@/lib/dates";
import { formatEUR, toCents } from "@/lib/money";

import {
  CreateStructureDialog,
  EditStructureDialog,
  ImportStructuresDialog,
  ToggleStructureButton,
} from "./structure-dialogs";

export const metadata: Metadata = { title: "Structures comptables" };

const TYPE_VALUES = Object.keys(ACCT_STRUCTURE_TYPE_LABELS);
const SORTS = ["code", "nom", "ca", "resultat", "du"] as const;

export default async function StructuresPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    type?: string;
    statut?: string;
    du?: string;
    au?: string;
    impayes?: string;
    tri?: string;
  }>;
}) {
  const user = await requireUser();
  if (!can(user, "accounting:read")) return <AccessDenied />;
  const params = await searchParams;

  const type = TYPE_VALUES.includes(params.type ?? "")
    ? (params.type as AcctStructure["type"])
    : null;
  const active =
    params.statut === "actives" || params.statut === "inactives"
      ? params.statut
      : null;
  const year = todayParis().slice(0, 4);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(params.du ?? "")
    ? params.du!
    : `${year}-01-01`;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(params.au ?? "")
    ? params.au!
    : `${year}-12-31`;
  const impayes = params.impayes === "1";
  const tri = SORTS.includes(params.tri as (typeof SORTS)[number])
    ? (params.tri as (typeof SORTS)[number])
    : "code";

  const canWrite = can(user, "accounting:write");
  const [aggregates, fullStructures, imports, stores] = await Promise.all([
    listStructuresWithAggregates(user, {
      from,
      to,
      q: params.q ?? null,
      type,
      active,
      impayes,
    }),
    canWrite ? listStructures(user) : Promise.resolve([]),
    listImports(user, "STRUCTURES"),
    canWrite ? listStores(user) : Promise.resolve([]),
  ]);
  const storeOptions = stores.map((s) => ({ id: s.id, name: s.name }));
  const detailsById = new Map(fullStructures.map((s) => [s.id, s]));

  const rows = [...aggregates].sort((a, b) => {
    switch (tri) {
      case "nom":
        return a.name.localeCompare(b.name, "fr");
      case "ca":
        return toCents(b.revenueHT) - toCents(a.revenueHT);
      case "resultat":
        return toCents(b.result) - toCents(a.result);
      case "du":
        return toCents(b.amountDue) - toCents(a.amountDue);
      default:
        return a.code.localeCompare(b.code, "fr");
    }
  });

  const exportQuery = new URLSearchParams({
    ...(params.q ? { q: params.q } : {}),
    ...(type ? { type } : {}),
    ...(active ? { statut: active } : {}),
    ...(impayes ? { impayes: "1" } : {}),
    du: from,
    au: to,
  }).toString();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Clients comptables</h1>
          <p className="text-sm text-muted-foreground">
            Référentiel des structures du groupe avec leurs agrégats (CA,
            charges, résultat, restant dû) calculés en base sur la période
            choisie.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={`/api/compta/structures-export?${exportQuery}`}>
              Exporter (CSV)
            </a>
          </Button>
          {canWrite ? (
            <>
              {can(user, "accounting:import") ? <ImportStructuresDialog /> : null}
              <CreateStructureDialog stores={storeOptions} />
            </>
          ) : null}
        </div>
      </div>

      <form className="flex flex-wrap items-end gap-3" method="get">
        <div className="w-56">
          <Input
            name="q"
            placeholder="Rechercher (nom, code, société)…"
            defaultValue={params.q ?? ""}
            data-testid="structures-search"
          />
        </div>
        <select
          name="type"
          defaultValue={type ?? ""}
          className="h-9 rounded-full border border-input bg-transparent px-3 text-sm"
        >
          <option value="">Tous les types</option>
          {Object.entries(ACCT_STRUCTURE_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          name="statut"
          defaultValue={active ?? ""}
          className="h-9 rounded-full border border-input bg-transparent px-3 text-sm"
        >
          <option value="">Actives et inactives</option>
          <option value="actives">Actives</option>
          <option value="inactives">Inactives</option>
        </select>
        <select
          name="tri"
          defaultValue={tri}
          className="h-9 rounded-full border border-input bg-transparent px-3 text-sm"
        >
          <option value="code">Tri : code</option>
          <option value="nom">Tri : nom</option>
          <option value="ca">Tri : CA décroissant</option>
          <option value="resultat">Tri : résultat décroissant</option>
          <option value="du">Tri : montant dû décroissant</option>
        </select>
        <Input name="du" type="date" defaultValue={from} className="w-38" />
        <Input name="au" type="date" defaultValue={to} className="w-38" />
        <label className="flex h-9 items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="impayes"
            value="1"
            defaultChecked={impayes}
          />
          Impayés en cours
        </label>
        <Button type="submit" variant="outline" size="sm">
          Filtrer
        </Button>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>
            {rows.length} structure{rows.length > 1 ? "s" : ""}
            <InfoHint text="CA et charges : montants HT des pièces non annulées de la période. Restant dû : TTC des pièces En attente / En retard / Impayée, toutes périodes confondues." />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table data-testid="structures-table">
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Nom</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Ville</TableHead>
                <TableHead className="text-right">Pièces</TableHead>
                <TableHead className="text-right">CA HT</TableHead>
                <TableHead className="text-right">Charges HT</TableHead>
                <TableHead className="text-right">Résultat</TableHead>
                <TableHead className="text-right">Restant dû</TableHead>
                <TableHead>Dernière pièce</TableHead>
                <TableHead>Statut</TableHead>
                {canWrite ? <TableHead /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={canWrite ? 12 : 11}
                    className="py-8 text-center text-muted-foreground"
                  >
                    Aucune structure — importez le référentiel du logiciel
                    comptable ou créez la première.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((s) => {
                  const details = detailsById.get(s.id);
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-sm">
                        <Link
                          href={`/compta/structures/${s.id}`}
                          className="underline-offset-2 hover:underline"
                          data-testid={`structure-link-${s.code}`}
                        >
                          {s.code}
                        </Link>
                      </TableCell>
                      <TableCell className="font-medium">
                        <Link
                          href={`/compta/structures/${s.id}`}
                          className="underline-offset-2 hover:underline"
                        >
                          {s.name}
                        </Link>
                        {s.company ? (
                          <span className="block text-xs text-muted-foreground">
                            {s.company}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {ACCT_STRUCTURE_TYPE_LABELS[s.type] ?? s.type}
                        </Badge>
                      </TableCell>
                      <TableCell>{s.city ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.pieceCount}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatEUR(s.revenueHT)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatEUR(s.expensesHT)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatEUR(s.result)}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${
                          toCents(s.amountDue) > 0 ? "text-destructive" : ""
                        }`}
                      >
                        {formatEUR(s.amountDue)}
                      </TableCell>
                      <TableCell>
                        {s.lastPieceDate ? formatDateFr(s.lastPieceDate) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={s.isActive ? "success" : "secondary"}>
                          {s.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      {canWrite ? (
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {details ? (
                              <EditStructureDialog
                                structure={{
                                  id: details.id,
                                  code: details.code,
                                  name: details.name,
                                  company: details.company,
                                  contactName: details.contactName,
                                  phone: details.phone,
                                  email: details.email,
                                  creditAvailable: details.creditAvailable,
                                  address: details.address,
                                  postalCode: details.postalCode,
                                  city: details.city,
                                  vatNumber: details.vatNumber,
                                  siret: details.siret,
                                  type: details.type,
                                  storeId: details.storeId,
                                  notes: details.notes,
                                  isActive: details.isActive,
                                }}
                                stores={storeOptions}
                              />
                            ) : null}
                            <ToggleStructureButton id={s.id} isActive={s.isActive} />
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {imports.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Derniers imports du référentiel</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Fichier</TableHead>
                  <TableHead>Par</TableHead>
                  <TableHead className="text-right">Créées / MAJ / Ignorées</TableHead>
                  <TableHead className="text-right">Erreurs</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {imports.map((imp) => (
                  <TableRow key={imp.id}>
                    <TableCell>
                      {imp.createdAt.toLocaleDateString("fr-FR")}{" "}
                      {imp.createdAt.toLocaleTimeString("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {imp.fileName}{" "}
                      <Badge variant="outline">{imp.format.toUpperCase()}</Badge>
                    </TableCell>
                    <TableCell>
                      {imp.createdBy.firstName} {imp.createdBy.lastName}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {imp.createdRows} / {imp.updatedRows} / {imp.skippedRows}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {(imp.errors as unknown[]).length}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          imp.status === "TERMINE"
                            ? "success"
                            : imp.status === "ERREUR"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {ACCT_IMPORT_STATUS_LABELS[imp.status]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
