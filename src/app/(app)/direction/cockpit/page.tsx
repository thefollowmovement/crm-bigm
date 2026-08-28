import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { addMonthsIso, monthEndIso, todayParis } from "@/lib/dates";
import { formatMonthFr, percentChange } from "@/lib/analytics";
import { formatEUR } from "@/lib/money";
import { getDirectionCockpit } from "@/services/dashboard.service";
import {
  getMonthlyResults,
  getYearComparison,
} from "@/services/acct-analytics.service";
import {
  getFamilyBreakdown,
  getTopProducts,
} from "@/services/product-sales.service";
import { AccessDenied } from "@/components/access-denied";
import { InfoHint } from "@/components/info-hint";
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
import {
  BreakdownChart,
  ComparisonBarChart,
  TimeSeriesChart,
} from "@/components/charts/charts";

export const metadata: Metadata = { title: "Cockpit Direction" };

function Kpi({
  label,
  value,
  href,
  extra,
  testId,
}: {
  label: string;
  value: React.ReactNode;
  href: string;
  extra?: React.ReactNode;
  testId?: string;
}) {
  return (
    <Link href={href} className="block">
      <Card className="h-full transition-colors hover:bg-accent/50" data-testid={testId}>
        <CardContent className="pt-6">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {label}
          </div>
          <div className="mt-1 text-2xl font-semibold">{value}</div>
          {extra ? <div className="mt-1 text-xs text-muted-foreground">{extra}</div> : null}
        </CardContent>
      </Card>
    </Link>
  );
}

export default async function CockpitPage({
  searchParams,
}: {
  searchParams: Promise<{ vue?: string; annee?: string }>;
}) {
  const user = await requireUser();
  if (!can(user, "direction:cockpit")) return <AccessDenied />;
  const params = await searchParams;

  const today = todayParis();
  const month = today.slice(0, 7);
  const currentYear = Number(today.slice(0, 4));
  const annee =
    typeof params.annee === "string" && /^\d{4}$/.test(params.annee)
      ? Number(params.annee)
      : currentYear;
  const vue =
    typeof params.vue === "string" &&
    ["mois", "comparaison", "produits"].includes(params.vue)
      ? params.vue
      : "mois";

  const monthPeriod = { from: `${month}-01`, to: monthEndIso(month) };
  const [cockpit, monthly, comparison, topProducts, familyBreakdown] =
    await Promise.all([
      getDirectionCockpit(user),
      getMonthlyResults(user, {
        from: `${addMonthsIso(today, -11).slice(0, 7)}-01`,
        to: today,
      }),
      getYearComparison(user, { year: annee }),
      getTopProducts(user, monthPeriod),
      getFamilyBreakdown(user, monthPeriod),
    ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="cockpit-title">
          Cockpit Direction
        </h1>
        <p className="text-sm text-muted-foreground">
          Indicateurs du réseau — {formatMonthFr(cockpit.month)}. CA, charges et
          résultat viennent du journal comptable (classes 6/7, montants HT).
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="CA HT (mois)"
          value={formatEUR(cockpit.revenue.current)}
          href="/compta/factures"
          testId="kpi-network-revenue"
          extra={
            cockpit.revenue.deltaPct === null
              ? "N-1 : —"
              : `${cockpit.revenue.deltaPct >= 0 ? "+" : ""}${String(
                  cockpit.revenue.deltaPct
                ).replace(".", ",")} % vs N-1`
          }
        />
        <Kpi
          label="Charges HT (mois)"
          value={formatEUR(cockpit.expensesMonth)}
          href="/compta/factures?classe=CHARGE"
          testId="kpi-expenses"
          extra={`Résultat du mois : ${formatEUR(cockpit.resultMonth)}`}
        />
        <Kpi
          label={`Résultat ${today.slice(0, 4)}`}
          value={formatEUR(cockpit.resultYear.result)}
          href="/compta/factures"
          testId="kpi-result-year"
          extra={`CA ${formatEUR(cockpit.resultYear.revenueHT)} − charges ${formatEUR(
            cockpit.resultYear.expensesHT
          )}`}
        />
        <Kpi
          label="Restant dû (journal)"
          value={formatEUR(cockpit.amountDue.totalTTC)}
          href="/compta/structures?impayes=1"
          testId="kpi-overdue"
          extra={`${cockpit.amountDue.count} pièce${
            cockpit.amountDue.count > 1 ? "s" : ""
          } non soldée${cockpit.amountDue.count > 1 ? "s" : ""}`}
        />
        <Kpi
          label="Achats DPS (mois)"
          value={formatEUR(cockpit.purchasesMonth)}
          href="/achats"
        />
        <Kpi
          label="Plans d'action en retard"
          value={cockpit.latePlans}
          href="/animation/plans-action"
          testId="kpi-late-plans"
        />
        <Kpi
          label="Audits en retard"
          value={cockpit.auditsOverdue}
          href="/animation/visites"
        />
        <Kpi
          label="Tickets ouverts"
          value={cockpit.openTickets}
          href="/tickets"
        />
        <Kpi
          label="Contrats à échéance (180 j)"
          value={cockpit.expiringContracts}
          href="/contrats"
        />
        <Kpi
          label="Ouvertures en cours"
          value={cockpit.openings.active}
          href="/developpement/ouvertures"
          extra={`${cockpit.openings.lateSteps} jalon(s) en retard`}
        />
        <Kpi
          label="Pipeline prospects"
          value={cockpit.prospects.count}
          href="/developpement/prospects"
          extra={`${cockpit.prospects.due} à relancer`}
        />
        <Kpi
          label="Écart matière (M-1)"
          value={
            cockpit.materialVariance.rows.length === 0
              ? "—"
              : formatEUR(cockpit.materialVariance.rows[0].variance)
          }
          href="/foodcost"
          testId="kpi-material-variance"
          extra={
            cockpit.materialVariance.rows.length === 0
              ? "Aucune boutique évaluable"
              : `${cockpit.materialVariance.rows[0].store.code} — le plus fort écart`
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Tabs defaultValue={vue}>
          <TabsList>
            <TabsTrigger value="mois" data-testid="tab-mois">
              Par mois
            </TabsTrigger>
            <TabsTrigger value="comparaison" data-testid="tab-comparaison">
              N vs N-1
            </TabsTrigger>
            <TabsTrigger value="produits" data-testid="tab-produits">
              Produits &amp; familles
            </TabsTrigger>
          </TabsList>

          <TabsContent value="mois" className="mt-4 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>
                  Évolution — 12 derniers mois
                  <InfoHint text="CA HT (classe 7) et charges HT (classe 6) des pièces non annulées du journal comptable, mois par mois." />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {monthly.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Aucune pièce dans le journal — importez vos exports
                    comptables.
                  </p>
                ) : (
                  <>
                    <TimeSeriesChart
                      data={monthly.map((p) => ({
                        label: formatMonthFr(p.month),
                        gross: p.revenueHT,
                      }))}
                      seriesLabel="CA HT"
                      height={280}
                      testId="cockpit-chart"
                    />
                    <Table data-testid="cockpit-months">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Mois</TableHead>
                          <TableHead className="text-right">CA HT</TableHead>
                          <TableHead className="text-right">Charges HT</TableHead>
                          <TableHead className="text-right">Résultat</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {monthly.map((p) => (
                          <TableRow key={p.month}>
                            <TableCell>{formatMonthFr(p.month)}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatEUR(p.revenueHT)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatEUR(p.expensesHT)}
                            </TableCell>
                            <TableCell className="text-right font-medium tabular-nums">
                              {formatEUR(p.result)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="comparaison" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>
                  CA mensuel {annee} vs {annee - 1}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <form className="flex items-end gap-2" method="get">
                  <input type="hidden" name="vue" value="comparaison" />
                  <select
                    name="annee"
                    defaultValue={String(annee)}
                    className="h-9 rounded-full border border-input bg-transparent px-3 text-sm"
                  >
                    {Array.from({ length: 5 }, (_, i) => currentYear - i).map(
                      (y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      )
                    )}
                  </select>
                  <button
                    type="submit"
                    className="h-9 rounded-full border border-input px-3 text-sm"
                  >
                    Afficher
                  </button>
                </form>
                <ComparisonBarChart
                  data={comparison.map((row) => ({
                    label: formatMonthFr(row.month).replace(` ${annee}`, ""),
                    current: row.current,
                    previous: row.previous,
                  }))}
                  currentLabel={String(annee)}
                  previousLabel={String(annee - 1)}
                  testId="cockpit-comparison"
                />
                <Table data-testid="cockpit-comparison-table">
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
                          <TableCell className="text-right font-medium tabular-nums">
                            {formatEUR(row.current)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
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

          <TabsContent value="produits" className="mt-4 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Meilleures ventes — {month}</CardTitle>
              </CardHeader>
              <CardContent>
                {topProducts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Aucune vente produit sur la période. Importez un fichier CSV
                    depuis Administration → Produits &amp; familles.
                  </p>
                ) : (
                  <Table data-testid="top-products">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produit</TableHead>
                        <TableHead>Famille</TableHead>
                        <TableHead className="text-right">Quantité</TableHead>
                        <TableHead className="text-right">CA</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topProducts.map((row) => (
                        <TableRow key={row.productId}>
                          <TableCell className="font-medium">
                            {row.name}{" "}
                            <span className="text-xs text-muted-foreground">
                              ({row.code})
                            </span>
                          </TableCell>
                          <TableCell>{row.familyName}</TableCell>
                          <TableCell className="text-right">{row.quantity}</TableCell>
                          <TableCell className="text-right">
                            {row.amount === "0" ? "—" : formatEUR(row.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {familyBreakdown.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Répartition par famille — {month}</CardTitle>
                </CardHeader>
                <CardContent>
                  <BreakdownChart
                    data={familyBreakdown.map((f) => ({
                      label: f.familyName,
                      value: f.quantity,
                    }))}
                    valueLabel="Quantité vendue"
                    testId="family-breakdown"
                  />
                </CardContent>
              </Card>
            ) : null}
          </TabsContent>
        </Tabs>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>
              Top / flop boutiques ({formatMonthFr(cockpit.month)})
              <InfoHint text="CA HT facturé sur le mois aux structures rattachées à chaque boutique (fiche client comptable → champ « Boutique liée »)." />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {cockpit.topStores.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucune structure comptable n&apos;est rattachée à une boutique —
                faites le lien depuis les fiches clients comptables.
              </p>
            ) : (
              <>
                <div>
                  <div className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                    Top
                  </div>
                  <ul className="space-y-1" data-testid="cockpit-top">
                    {cockpit.topStores.map((s) => (
                      <li key={s.storeId} className="flex justify-between gap-2">
                        <Link
                          href={`/boutiques/${s.storeId}`}
                          className="underline-offset-2 hover:underline"
                        >
                          {s.code} — {s.name}
                        </Link>
                        <span className="font-medium">{formatEUR(s.total)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                    Flop
                  </div>
                  <ul className="space-y-1" data-testid="cockpit-flop">
                    {cockpit.flopStores.map((s) => (
                      <li key={s.storeId} className="flex justify-between gap-2">
                        <Link
                          href={`/boutiques/${s.storeId}`}
                          className="underline-offset-2 hover:underline"
                        >
                          {s.code} — {s.name}
                        </Link>
                        <span>{formatEUR(s.total)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
            {cockpit.materialVariance.rows.length > 0 ? (
              <div>
                <div className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                  Écart matière {formatMonthFr(cockpit.materialVariance.month)}
                </div>
                <ul className="space-y-1" data-testid="cockpit-variance">
                  {cockpit.materialVariance.rows.map((row) => (
                    <li key={row.store.id} className="flex justify-between gap-2">
                      <span>{row.store.code}</span>
                      <span className="flex items-center gap-2">
                        {formatEUR(row.variance)}
                        {row.variancePct !== null ? (
                          <Badge
                            variant={
                              Math.abs(row.variancePct) > 15
                                ? "destructive"
                                : "secondary"
                            }
                          >
                            {String(row.variancePct).replace(".", ",")} %
                          </Badge>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
