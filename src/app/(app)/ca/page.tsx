import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { addDaysIso, addMonthsIso, formatDateFr, todayParis } from "@/lib/dates";
import { formatEUR } from "@/lib/money";
import { formatMonthFr, percentChange } from "@/lib/analytics";
import { REVENUE_CHANNEL_LABELS } from "@/lib/labels";
import { getNetworkSummary, getStoreMonth } from "@/services/revenue.service";
import {
  getSeries,
  getYearComparison,
  listRegions,
  type SeriesGranularity,
} from "@/services/revenue-analytics.service";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ComparisonBarChart, TimeSeriesChart } from "@/components/charts/charts";

import { CaFilters, CsvImportCard, RevenueEntryDialog } from "./ca-components";
import { AnalyticsFilters } from "./analytics-filters";

export const metadata: Metadata = { title: "Chiffre d'affaires" };

type Params = Record<string, string | string[] | undefined>;

const GRANULARITIES: Record<string, SeriesGranularity> = {
  jour: "day",
  semaine: "week",
  mois: "month",
};

// Périmètre des onglets analytiques : réseau entier, boutique courante ou
// région (valeur validée contre la liste des régions accessibles).
function parseScope(
  params: Params,
  storeId: string,
  regions: string[]
): { key: string; filter: { storeId?: string; region?: string } } {
  const raw = typeof params.perimetre === "string" ? params.perimetre : "reseau";
  if (raw === "boutique") return { key: raw, filter: { storeId } };
  if (raw.startsWith("region:")) {
    const region = raw.slice("region:".length);
    if (regions.includes(region)) return { key: raw, filter: { region } };
  }
  return { key: "reseau", filter: {} };
}

export default async function CaPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
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
  const storeLabel = `${store.code} — ${store.name}`;

  const vue =
    typeof params.vue === "string" &&
    ["mois", "evolution", "comparaison"].includes(params.vue)
      ? params.vue
      : "mois";

  const today = todayParis();
  const currentYear = Number(today.slice(0, 4));
  const granularite =
    typeof params.granularite === "string" && params.granularite in GRANULARITIES
      ? params.granularite
      : "jour";
  const annee =
    typeof params.annee === "string" && /^\d{4}$/.test(params.annee)
      ? Number(params.annee)
      : currentYear;
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  const regions = await listRegions(user);
  const scope = parseScope(params, storeId, regions);

  const granularity = GRANULARITIES[granularite];
  const seriesFrom =
    granularity === "day"
      ? addDaysIso(today, -30)
      : granularity === "week"
        ? addDaysIso(today, -7 * 12)
        : `${addMonthsIso(today, -11).slice(0, 7)}-01`;

  const [monthData, summary, series, comparison] = await Promise.all([
    getStoreMonth(user, storeId, month),
    getNetworkSummary(user, { from: `${month}-01`, to: `${month}-31` }),
    getSeries(user, { granularity, from: seriesFrom, to: today, ...scope.filter }),
    getYearComparison(user, { year: annee, ...scope.filter }),
  ]);

  const seriesPoints = series.map((p) => ({
    label:
      granularity === "month"
        ? formatMonthFr(p.period)
        : granularity === "week"
          ? `Sem. du ${formatDateFr(p.period)}`
          : formatDateFr(p.period),
    gross: p.gross,
  }));
  const comparisonPoints = comparison.map((row) => ({
    label: formatMonthFr(row.month).replace(` ${annee}`, ""),
    current: row.current,
    previous: row.previous,
  }));

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
          <RevenueEntryDialog storeId={storeId} storeLabel={storeLabel} />
        ) : null}
      </div>

      <Tabs defaultValue={vue}>
        <TabsList>
          <TabsTrigger value="mois">Mois par mois</TabsTrigger>
          <TabsTrigger value="evolution" data-testid="tab-evolution">
            Évolution
          </TabsTrigger>
          <TabsTrigger value="comparaison" data-testid="tab-comparaison">
            N vs N-1
          </TabsTrigger>
        </TabsList>

        <TabsContent value="mois" className="mt-4 space-y-6">
          <MonthTab
            stores={stores.map((s) => ({ id: s.id, label: `${s.code} — ${s.name}` }))}
            store={{ id: storeId, code: store.code }}
            month={month}
            monthData={monthData}
            summary={summary}
            canImport={canImport}
          />
        </TabsContent>

        <TabsContent value="evolution" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Évolution du CA brut</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <AnalyticsFilters
                vue="evolution"
                perimetre={scope.key}
                storeLabel={storeLabel}
                regions={regions}
                granularite={granularite}
              />
              {seriesPoints.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Aucune donnée sur la période.
                </p>
              ) : (
                <TimeSeriesChart
                  data={seriesPoints}
                  seriesLabel="CA brut"
                  testId="revenue-chart"
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="comparaison" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>
                Comparaison mensuelle {annee} vs {annee - 1}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <AnalyticsFilters
                vue="comparaison"
                perimetre={scope.key}
                storeLabel={storeLabel}
                regions={regions}
                annee={annee}
                years={years}
              />
              <ComparisonBarChart
                data={comparisonPoints}
                currentLabel={String(annee)}
                previousLabel={String(annee - 1)}
                testId="revenue-comparison"
              />
              <Table data-testid="comparison-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Mois</TableHead>
                    <TableHead className="text-right">{annee}</TableHead>
                    <TableHead className="text-right">{annee - 1}</TableHead>
                    <TableHead className="text-right">Écart</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comparison.map((row) => {
                    const delta = percentChange(row.current, row.previous);
                    return (
                      <TableRow key={row.month}>
                        <TableCell>{formatMonthFr(row.month)}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatEUR(row.current)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatEUR(row.previous)}
                        </TableCell>
                        <TableCell className="text-right">
                          {delta === null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <Badge variant={delta >= 0 ? "success" : "destructive"}>
                              {delta >= 0 ? "+" : ""}
                              {String(delta).replace(".", ",")} %
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Onglet « Mois par mois » : contenu historique de la page (saisie, totaux,
// import CSV, comparatif réseau) — les e2e existants s'appuient dessus.
function MonthTab({
  stores,
  store,
  month,
  monthData,
  summary,
  canImport,
}: {
  stores: { id: string; label: string }[];
  store: { id: string; code: string };
  month: string;
  monthData: Awaited<ReturnType<typeof getStoreMonth>>;
  summary: Awaited<ReturnType<typeof getNetworkSummary>>;
  canImport: boolean;
}) {
  return (
    <>
      <CaFilters stores={stores} current={{ boutique: store.id, mois: month }} />

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
    </>
  );
}
