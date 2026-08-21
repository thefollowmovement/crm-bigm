import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { formatDateFr, todayParis } from "@/lib/dates";
import { formatEUR } from "@/lib/money";
import { REVENUE_CHANNEL_LABELS } from "@/lib/labels";
import { getNetworkSummary, getStoreMonth } from "@/services/revenue.service";
import { listStores } from "@/services/stores.service";
import { AccessDenied } from "@/components/access-denied";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { CaFilters, CsvImportCard, RevenueEntryDialog } from "./ca-components";

export const metadata: Metadata = { title: "Chiffre d'affaires" };

export default async function CaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!can(user, "revenue:read")) return <AccessDenied />;

  const stores = await listStores(user);
  if (stores.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        Aucune boutique accessible.
      </p>
    );
  }

  const params = await searchParams;
  const month =
    typeof params.mois === "string" && /^\d{4}-\d{2}$/.test(params.mois)
      ? params.mois
      : todayParis().slice(0, 7);
  const storeId =
    typeof params.boutique === "string" &&
    stores.some((s) => s.id === params.boutique)
      ? params.boutique
      : stores[0].id;
  const store = stores.find((s) => s.id === storeId)!;

  const [monthData, summary] = await Promise.all([
    getStoreMonth(user, storeId, month),
    getNetworkSummary(user, { from: `${month}-01`, to: `${month}-31` }),
  ]);

  const canWrite = can(user, "revenue:write");
  const canImport = can(user, "revenue:import");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Chiffre d&apos;affaires</h1>
          <p className="text-sm text-muted-foreground">
            Par boutique, par jour et par canal (sur place, emporté, tablette,
            Uber Eats, Deliveroo).
          </p>
        </div>
        {canWrite ? (
          <RevenueEntryDialog
            storeId={storeId}
            storeLabel={`${store.code} — ${store.name}`}
          />
        ) : null}
      </div>

      <CaFilters
        stores={stores.map((s) => ({ id: s.id, label: `${s.code} — ${s.name}` }))}
        current={{ boutique: storeId, mois: month }}
      />

      <Card>
        <CardHeader>
          <CardTitle>
            {store.code} — totaux du mois
            <span
              className="ml-3 text-base font-semibold text-brand"
              data-testid="revenue-total"
            >
              {formatEUR(monthData.grandTotal)}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {monthData.totals.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune donnée pour ce mois.
            </p>
          ) : (
            <div className="flex flex-wrap gap-4" data-testid="channel-totals">
              {monthData.totals.map((t) => (
                <div key={t.channel} className="rounded-lg border p-3 text-sm">
                  <div className="text-xs text-muted-foreground">
                    {REVENUE_CHANNEL_LABELS[t.channel]}
                  </div>
                  <div className="font-semibold">{formatEUR(t.gross)}</div>
                  {t.net !== "0" && t.net !== "0.00" ? (
                    <div className="text-xs text-muted-foreground">
                      net : {formatEUR(t.net)}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Canal</TableHead>
              <TableHead className="text-right">Brut</TableHead>
              <TableHead className="text-right">Net</TableHead>
              <TableHead>Source</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {monthData.entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Aucune saisie ce mois-ci.
                </TableCell>
              </TableRow>
            ) : (
              monthData.entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{formatDateFr(entry.date)}</TableCell>
                  <TableCell>
                    {REVENUE_CHANNEL_LABELS[entry.channel]}
                    {entry.channelLabel ? ` (${entry.channelLabel})` : ""}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatEUR(entry.grossAmount)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {entry.netAmount ? formatEUR(entry.netAmount) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={entry.source === "IMPORT_CSV" ? "info" : "secondary"}>
                      {entry.source === "IMPORT_CSV" ? "Import" : "Saisie"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {canImport ? <CsvImportCard /> : null}

      <Card>
        <CardHeader>
          <CardTitle>Comparatif réseau — {month}</CardTitle>
        </CardHeader>
        <CardContent>
          {summary.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune donnée.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Boutique</TableHead>
                  <TableHead className="text-right">CA brut</TableHead>
                  <TableHead className="text-right">Lignes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody data-testid="network-summary">
                {summary.map((row) => (
                  <TableRow key={row.storeId}>
                    <TableCell className="font-medium">
                      {row.code} — {row.name}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatEUR(row.gross)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {row.entryCount}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
