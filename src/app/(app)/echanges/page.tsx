import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { EXCHANGE_STATUS_LABELS, EXCHANGE_TYPE_LABELS } from "@/lib/labels";
import { listExchanges } from "@/services/exchanges.service";
import { listStores } from "@/services/stores.service";
import { AccessDenied } from "@/components/access-denied";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { ExchangeListFilters } from "./exchange-list-filters";
import { NewExchangeDialog } from "./new-exchange-dialog";
import { exchangeStatusVariant } from "./status-variant";

export const metadata: Metadata = { title: "Échanges franchisés" };

const TYPE_VALUES = ["DEMANDE", "LITIGE", "DECISION", "INFORMATION"] as const;
const STATUS_VALUES = ["OUVERT", "EN_COURS", "RESOLU", "CLOS"] as const;

export default async function EchangesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!can(user, "exchange:read")) return <AccessDenied />;

  const params = await searchParams;
  const type = TYPE_VALUES.find((t) => t === params.type);
  const status = STATUS_VALUES.find((s) => s === params.statut);

  const rows = await listExchanges(user, { type, status });
  const canWrite = can(user, "exchange:write");
  // Boutiques du dialog de création — listStores est déjà scopé : un
  // franchisé ne reçoit que les boutiques de sa société.
  const storeOptions = canWrite
    ? (await listStores(user)).map((s) => ({ id: s.id, code: s.code, name: s.name }))
    : [];

  const dateFormat = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Échanges franchisés</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} échange{rows.length > 1 ? "s" : ""} — demandes, litiges et
            décisions du réseau.
          </p>
        </div>
        {canWrite ? <NewExchangeDialog stores={storeOptions} /> : null}
      </div>

      <ExchangeListFilters current={{ type, statut: status }} />

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sujet</TableHead>
              <TableHead>Boutique</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Messages</TableHead>
              <TableHead>Dernier message</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-10 text-center text-muted-foreground"
                >
                  Aucun échange.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((exchange) => (
                <TableRow
                  key={exchange.id}
                  data-testid={`exchange-row-${exchange.subject}`}
                >
                  <TableCell className="font-medium">
                    <Link
                      href={`/echanges/${exchange.id}`}
                      className="text-brand hover:underline"
                    >
                      {exchange.subject}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {exchange.store.code} — {exchange.store.name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {EXCHANGE_TYPE_LABELS[exchange.type]}
                  </TableCell>
                  <TableCell>
                    <Badge variant={exchangeStatusVariant(exchange.status)}>
                      {EXCHANGE_STATUS_LABELS[exchange.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {exchange.messageCount}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {exchange.lastMessageAt
                      ? dateFormat.format(exchange.lastMessageAt)
                      : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
