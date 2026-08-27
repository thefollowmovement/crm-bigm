import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import {
  listImports,
  listStructures,
  type AcctStructure,
} from "@/services/acct-structures.service";
import { listStores } from "@/services/stores.service";
import { AccessDenied } from "@/components/access-denied";
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
import { formatEUR } from "@/lib/money";

import {
  CreateStructureDialog,
  EditStructureDialog,
  ImportStructuresDialog,
  ToggleStructureButton,
} from "./structure-dialogs";

export const metadata: Metadata = { title: "Structures comptables" };

const TYPE_VALUES = Object.keys(ACCT_STRUCTURE_TYPE_LABELS);

export default async function StructuresPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; statut?: string }>;
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

  const canWrite = can(user, "accounting:write");
  const [structures, imports, stores] = await Promise.all([
    listStructures(user, { q: params.q ?? null, type, active }),
    listImports(user, "STRUCTURES"),
    canWrite ? listStores(user) : Promise.resolve([]),
  ]);
  const storeOptions = stores.map((s) => ({ id: s.id, name: s.name }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Structures comptables</h1>
          <p className="text-sm text-muted-foreground">
            Référentiel des clients comptables du groupe (boutiques, entités
            internes, fournisseurs, partenaires). Le code est la clé de
            rapprochement des imports de factures.
          </p>
        </div>
        {canWrite ? (
          <div className="flex gap-2">
            {can(user, "accounting:import") ? <ImportStructuresDialog /> : null}
            <CreateStructureDialog stores={storeOptions} />
          </div>
        ) : null}
      </div>

      <form className="flex flex-wrap items-end gap-3" method="get">
        <div className="w-64">
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
        <Button type="submit" variant="outline" size="sm">
          Filtrer
        </Button>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>
            {structures.length} structure{structures.length > 1 ? "s" : ""}
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
                <TableHead className="text-right">Encours</TableHead>
                <TableHead>Statut</TableHead>
                {canWrite ? <TableHead /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {structures.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={canWrite ? 7 : 6}
                    className="py-8 text-center text-muted-foreground"
                  >
                    Aucune structure — importez le référentiel du logiciel
                    comptable ou créez la première.
                  </TableCell>
                </TableRow>
              ) : (
                structures.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-sm">{s.code}</TableCell>
                    <TableCell className="font-medium">
                      {s.name}
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
                      {s.creditAvailable ? formatEUR(s.creditAvailable) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={s.isActive ? "success" : "secondary"}>
                        {s.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    {canWrite ? (
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <EditStructureDialog
                            structure={{
                              id: s.id,
                              code: s.code,
                              name: s.name,
                              company: s.company,
                              contactName: s.contactName,
                              phone: s.phone,
                              email: s.email,
                              creditAvailable: s.creditAvailable,
                              address: s.address,
                              postalCode: s.postalCode,
                              city: s.city,
                              vatNumber: s.vatNumber,
                              siret: s.siret,
                              type: s.type,
                              storeId: s.storeId,
                              notes: s.notes,
                              isActive: s.isActive,
                            }}
                            stores={storeOptions}
                          />
                          <ToggleStructureButton id={s.id} isActive={s.isActive} />
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))
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
