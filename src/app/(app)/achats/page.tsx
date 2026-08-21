import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { addMonthsIso, formatDateFr, todayParis } from "@/lib/dates";
import { formatMonthFr } from "@/lib/analytics";
import { formatEUR } from "@/lib/money";
import {
  getDepotSummary,
  getPurchasesVsRevenue,
  getStorePurchases,
  listDepots,
} from "@/services/purchases.service";
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
import { TimeSeriesChart } from "@/components/charts/charts";

import {
  PurchaseCsvImportCard,
  PurchaseDialog,
  PurchaseFilters,
} from "./purchase-components";

export const metadata: Metadata = { title: "Achats DPS" };

export default async function AchatsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!can(user, "purchase:read")) return <AccessDenied />;

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

  const today = todayParis();
  const ratioFrom = `${addMonthsIso(today, -11).slice(0, 7)}-01`;

  const [depots, purchases, ratio, depotSummary] = await Promise.all([
    listDepots(user),
    getStorePurchases(user, storeId, month),
    getPurchasesVsRevenue(user, { from: ratioFrom, to: today }),
    getDepotSummary(user, { from: `${month}-01`, to: `${month}-31` }),
  ]);

  const canWrite = can(user, "purchase:write");
  const canImport = can(user, "purchase:import");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Achats DPS</h1>
          <p className="text-sm text-muted-foreground">
            Approvisionnements par dépôt, comparés au chiffre d&apos;affaires.
            {canWrite ? (
              <>
                {" "}
                <Link
                  href="/achats/depots"
                  className="font-medium underline-offset-2 hover:underline"
                >
                  Gérer les dépôts
                </Link>
              </>
            ) : null}
          </p>
        </div>
        {canWrite && depots.length > 0 ? (
          <PurchaseDialog
            storeId={storeId}
            storeLabel={`${store.code} — ${store.name}`}
            depots={depots.map((d) => ({ id: d.id, label: `${d.code} — ${d.name}` }))}
          />
        ) : null}
      </div>

      <PurchaseFilters
        stores={stores.map((s) => ({ id: s.id, label: `${s.code} — ${s.name}` }))}
        current={{ boutique: storeId, mois: month }}
      />

      <Card>
        <CardHeader>
          <CardTitle>
            {store.code} — achats de {formatMonthFr(month)}
            <span
              className="ml-3 text-base font-semibold text-brand"
              data-testid="purchase-total"
            >
              {formatEUR(purchases.total)}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table data-testid="purchase-table">
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Dépôt</TableHead>
                <TableHead>Référence</TableHead>
                <TableHead className="text-right">Montant</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchases.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    Aucun achat ce mois-ci.
                  </TableCell>
                </TableRow>
              ) : (
                purchases.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{formatDateFr(row.date)}</TableCell>
                    <TableCell>{row.depot.code}</TableCell>
                    <TableCell className="font-mono text-sm">{row.reference}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatEUR(row.amount)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.source === "IMPORT_CSV" ? "info" : "secondary"}>
                        {row.source === "IMPORT_CSV" ? "Import" : "Saisie"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Achats vs CA (12 derniers mois, périmètre accessible)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {ratio.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune donnée.</p>
          ) : (
            <>
              <TimeSeriesChart
                data={ratio.map((r) => ({
                  label: formatMonthFr(r.period),
                  gross: r.ratioPct ?? "0",
                }))}
                seriesLabel="Achats / CA"
                unit="percent"
                height={240}
                testId="purchase-ratio-chart"
              />
              <Table data-testid="purchase-ratio-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Mois</TableHead>
                    <TableHead className="text-right">Achats</TableHead>
                    <TableHead className="text-right">CA</TableHead>
                    <TableHead className="text-right">Ratio</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ratio.map((row) => (
                    <TableRow key={row.period}>
                      <TableCell>{formatMonthFr(row.period)}</TableCell>
                      <TableCell className="text-right">
                        {formatEUR(row.purchases)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatEUR(row.revenue)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {row.ratioPct !== null
                          ? `${row.ratioPct.replace(".", ",")} %`
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      {depotSummary.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Par dépôt — {formatMonthFr(month)}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table data-testid="depot-summary">
              <TableBody>
                {depotSummary.map((d) => (
                  <TableRow key={d.depotId}>
                    <TableCell className="font-medium">
                      {d.code} — {d.name}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {d.purchaseCount} livraison{d.purchaseCount > 1 ? "s" : ""}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatEUR(d.total)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {canImport ? <PurchaseCsvImportCard /> : null}
    </div>
  );
}
