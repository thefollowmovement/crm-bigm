import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { formatDateFr, todayParis } from "@/lib/dates";
import { formatEUR, toCents } from "@/lib/money";
import { getStructure } from "@/services/acct-structures.service";
import {
  listInvoices,
  listStructuresWithAggregates,
} from "@/services/acct-invoices.service";
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
  ACCT_CLASS_LABELS,
  ACCT_INVOICE_STATUS_LABELS,
  ACCT_PIECE_TYPE_LABELS,
  ACCT_STRUCTURE_TYPE_LABELS,
} from "@/lib/labels";

import {
  EditInvoiceDialog,
  InvoiceAttachmentsDialog,
} from "../../factures/invoice-dialogs";
import { EditStructureDialog, ToggleStructureButton } from "../structure-dialogs";
import { CreateProviderAccountDialog } from "../provider-account-dialog";
import { listProviderAccounts } from "@/services/providers.service";

export const metadata: Metadata = { title: "Client comptable" };

const STATUS_BADGES: Record<string, "success" | "secondary" | "destructive" | "outline"> = {
  PAYEE: "success",
  EN_ATTENTE: "secondary",
  EN_RETARD: "destructive",
  IMPAYEE: "destructive",
  ANNULEE: "outline",
};

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm">{value ?? "—"}</dd>
    </div>
  );
}

export default async function StructureDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ du?: string; au?: string }>;
}) {
  const user = await requireUser();
  if (!can(user, "accounting:read")) return <AccessDenied />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const query = await searchParams;

  const today = todayParis();
  const year = today.slice(0, 4);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(query.du ?? "")
    ? query.du!
    : `${year}-01-01`;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(query.au ?? "")
    ? query.au!
    : `${year}-12-31`;

  const structure = await getStructure(user, id);
  if (!structure) notFound();

  const canWrite = can(user, "accounting:write");
  const canManageUsers = can(user, "user:manage");
  const [aggregates, invoices, stores, providerAccounts] = await Promise.all([
    listStructuresWithAggregates(user, { from, to, structureId: id }),
    listInvoices(user, { structureId: id, from, to }),
    canWrite ? listStores(user) : Promise.resolve([]),
    canManageUsers ? listProviderAccounts(user, id) : Promise.resolve([]),
  ]);
  const agg = aggregates[0] ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href="/compta/structures" className="hover:underline">
              Clients comptables
            </Link>{" "}
            / <span className="font-mono">{structure.code}</span>
          </p>
          <h1
            className="flex flex-wrap items-center gap-2 text-2xl font-semibold"
            data-testid="structure-title"
          >
            {structure.name}
            <Badge variant="outline">
              {ACCT_STRUCTURE_TYPE_LABELS[structure.type] ?? structure.type}
            </Badge>
            <Badge variant={structure.isActive ? "success" : "secondary"}>
              {structure.isActive ? "Active" : "Inactive"}
            </Badge>
          </h1>
          {structure.company ? (
            <p className="text-sm text-muted-foreground">{structure.company}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/compta/factures?structure=${structure.id}`}>
              Journal complet
            </Link>
          </Button>
          {canWrite ? (
            <>
              <EditStructureDialog
                structure={{
                  id: structure.id,
                  code: structure.code,
                  name: structure.name,
                  company: structure.company,
                  contactName: structure.contactName,
                  phone: structure.phone,
                  email: structure.email,
                  creditAvailable: structure.creditAvailable,
                  address: structure.address,
                  postalCode: structure.postalCode,
                  city: structure.city,
                  vatNumber: structure.vatNumber,
                  siret: structure.siret,
                  type: structure.type,
                  storeId: structure.storeId,
                  notes: structure.notes,
                  isActive: structure.isActive,
                }}
                stores={stores.map((s) => ({ id: s.id, name: s.name }))}
              />
              <ToggleStructureButton
                id={structure.id}
                isActive={structure.isActive}
              />
            </>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Pièces (période)
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {agg?.pieceCount ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card data-testid="structure-revenue">
          <CardContent className="pt-6">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              CA HT (période)
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {formatEUR(agg?.revenueHT ?? "0")}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Charges HT (période)
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {formatEUR(agg?.expensesHT ?? "0")}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Résultat (période)
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {formatEUR(agg?.result ?? "0")}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Restant dû (toutes périodes)
            </div>
            <div
              className={`mt-1 text-2xl font-semibold tabular-nums ${
                toCents(agg?.amountDue ?? "0") > 0 ? "text-destructive" : ""
              }`}
            >
              {formatEUR(agg?.amountDue ?? "0")}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Coordonnées &amp; informations comptables</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <InfoRow label="Contact" value={structure.contactName} />
            <InfoRow label="Téléphone" value={structure.phone} />
            <InfoRow label="E-mail" value={structure.email} />
            <InfoRow
              label="Encours disponible"
              value={
                structure.creditAvailable !== null
                  ? formatEUR(structure.creditAvailable)
                  : null
              }
            />
            <InfoRow
              label="Adresse"
              value={
                structure.address || structure.postalCode || structure.city
                  ? [structure.address, structure.postalCode, structure.city]
                      .filter(Boolean)
                      .join(", ")
                  : null
              }
            />
            <InfoRow label="N° TVA intracom" value={structure.vatNumber} />
            <InfoRow label="SIRET" value={structure.siret} />
            <InfoRow
              label="Dernière commande"
              value={
                structure.lastOrderDate
                  ? formatDateFr(structure.lastOrderDate)
                  : null
              }
            />
            <InfoRow
              label="Boutique liée"
              value={
                structure.store ? (
                  <Link
                    href={`/boutiques/${structure.store.id}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {structure.store.name}
                  </Link>
                ) : null
              }
            />
            <InfoRow label="Notes" value={structure.notes} />
          </dl>
        </CardContent>
      </Card>

      {canManageUsers ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center justify-between gap-2">
              Accès CRM du prestataire
              <CreateProviderAccountDialog
                structureId={structure.id}
                structureName={structure.name}
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {providerAccounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucun compte — créez un accès pour que ce client dépose ses
                factures et suive ses paiements dans son espace /prestataire.
              </p>
            ) : (
              <ul className="space-y-1 text-sm" data-testid="provider-accounts">
                {providerAccounts.map((account) => (
                  <li key={account.id} className="flex items-center gap-2">
                    <span className="font-medium">
                      {account.firstName} {account.lastName}
                    </span>
                    <span className="text-muted-foreground">{account.email}</span>
                    <Badge
                      className="ml-auto"
                      variant={account.isActive ? "success" : "secondary"}
                    >
                      {account.isActive ? "Actif" : "Désactivé"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>
            Pièces du journal — {invoices.length} sur la période
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="flex flex-wrap items-end gap-3" method="get">
            <Input name="du" type="date" defaultValue={from} className="w-38" />
            <Input name="au" type="date" defaultValue={to} className="w-38" />
            <Button type="submit" variant="outline" size="sm">
              Filtrer
            </Button>
          </form>
          <Table data-testid="structure-invoices">
            <TableHeader>
              <TableRow>
                <TableHead>N° pièce</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Classe</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Échéance</TableHead>
                <TableHead className="text-right">HT</TableHead>
                <TableHead className="text-right">TTC</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>PJ</TableHead>
                {canWrite ? <TableHead /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={canWrite ? 10 : 9}
                    className="py-8 text-center text-muted-foreground"
                  >
                    Aucune pièce sur la période.
                  </TableCell>
                </TableRow>
              ) : (
                invoices.map((invoice) => {
                  const overdue =
                    invoice.dueDate !== null &&
                    invoice.dueDate < today &&
                    (invoice.status === "EN_ATTENTE" ||
                      invoice.status === "EN_RETARD" ||
                      invoice.status === "IMPAYEE");
                  return (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-mono text-sm">
                        <Link
                          href={`/compta/factures/${invoice.id}`}
                          className="underline-offset-2 hover:underline"
                        >
                          {invoice.pieceNumber}
                        </Link>
                        {invoice.invoiceType === "RFA" ? (
                          <Badge variant="outline" className="ml-1">
                            RFA
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {ACCT_PIECE_TYPE_LABELS[invoice.pieceType]}
                      </TableCell>
                      <TableCell>
                        {ACCT_CLASS_LABELS[invoice.accountClass]}
                      </TableCell>
                      <TableCell>{formatDateFr(invoice.pieceDate)}</TableCell>
                      <TableCell className={overdue ? "text-destructive" : ""}>
                        {invoice.dueDate ? formatDateFr(invoice.dueDate) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatEUR(invoice.amountHT)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatEUR(invoice.amountTTC)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={STATUS_BADGES[invoice.status] ?? "secondary"}
                        >
                          {ACCT_INVOICE_STATUS_LABELS[invoice.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <InvoiceAttachmentsDialog
                          invoice={{
                            id: invoice.id,
                            pieceNumber: invoice.pieceNumber,
                          }}
                          attachments={invoice.attachments}
                          canWrite={canWrite}
                        />
                      </TableCell>
                      {canWrite ? (
                        <TableCell className="text-right">
                          <EditInvoiceDialog
                            invoice={{
                              id: invoice.id,
                              pieceNumber: invoice.pieceNumber,
                              status: invoice.status,
                              invoiceType: invoice.invoiceType,
                              accountClass: invoice.accountClass,
                              dueDate: invoice.dueDate,
                              notes: invoice.notes,
                            }}
                          />
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
    </div>
  );
}
