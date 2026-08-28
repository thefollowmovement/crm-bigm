import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { formatDateFr, todayParis } from "@/lib/dates";
import { formatMonthFr } from "@/lib/analytics";
import { formatEUR, toCents } from "@/lib/money";
import { COMPANY_FLOW_CATEGORY_LABELS } from "@/lib/labels";
import {
  getExpenseBreakdown,
  getMonthlyStatement,
  getYearSummary,
  listFlows,
} from "@/services/company-finance.service";
import { listInvoices } from "@/services/acct-invoices.service";
import { listPartners } from "@/services/partners.service";
import { AccessDenied } from "@/components/access-denied";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  AddFlowDialog,
  DeleteFlowButton,
  MonthPicker,
  SetBudgetForm,
} from "./cie-components";

export const metadata: Metadata = { title: "Finances Big M CIE" };

function Amount({ value }: { value: string }) {
  return (
    <span className={value.startsWith("-") ? "font-medium text-destructive" : ""}>
      {formatEUR(value)}
    </span>
  );
}

export default async function CompanyFinancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!can(user, "company-finance:read")) return <AccessDenied />;

  const params = await searchParams;
  const today = todayParis();
  const currentYear = Number(today.slice(0, 4));
  const year =
    typeof params.annee === "string" && /^\d{4}$/.test(params.annee)
      ? Number(params.annee)
      : currentYear;
  const month =
    typeof params.mois === "string" && /^([1-9]|1[0-2])$/.test(params.mois)
      ? Number(params.mois)
      : Number(today.slice(5, 7));

  const canWrite = can(user, "company-finance:write");
  const [statement, flows, yearSummary, breakdown, invoices, partners] =
    await Promise.all([
      getMonthlyStatement(user, year, month),
      listFlows(user, { year, month }),
      getYearSummary(user, year),
      getExpenseBreakdown(user, year),
      can(user, "accounting:read") ? listInvoices(user, {}) : Promise.resolve([]),
      can(user, "partner:read") ? listPartners(user) : Promise.resolve([]),
    ]);

  const exitTotalCents = breakdown.reduce((sum, r) => sum + toCents(r.total), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Finances Big M CIE</h1>
          <p className="text-sm text-muted-foreground">
            Tableau financier de la société tête de réseau : réel vs budget,
            résultat et ventilation des dépenses.
          </p>
        </div>
        {canWrite ? (
          <AddFlowDialog
            today={today}
            invoices={invoices.map((i) => ({ id: i.id, label: i.pieceNumber }))}
            partners={partners.map((p) => ({ id: p.id, label: p.companyName }))}
          />
        ) : null}
      </div>

      <Tabs defaultValue="mensuel">
        <TabsList>
          <TabsTrigger value="mensuel">Tableau mensuel</TabsTrigger>
          <TabsTrigger value="annee">Année</TabsTrigger>
          <TabsTrigger value="budget">Budget</TabsTrigger>
        </TabsList>

        <TabsContent value="mensuel" className="space-y-6">
          <MonthPicker year={year} month={month} />

          <div className="grid gap-4 sm:grid-cols-3">
            <Card data-testid="cie-entries">
              <CardContent className="pt-6">
                <div className="text-xs uppercase text-muted-foreground">Entrées</div>
                <div className="mt-1 text-2xl font-semibold">
                  {formatEUR(statement.totals.entries)}
                </div>
                <div className="text-xs text-muted-foreground">
                  Budget : {formatEUR(statement.totals.budgetEntries)}
                </div>
              </CardContent>
            </Card>
            <Card data-testid="cie-exits">
              <CardContent className="pt-6">
                <div className="text-xs uppercase text-muted-foreground">Sorties</div>
                <div className="mt-1 text-2xl font-semibold">
                  {formatEUR(statement.totals.exits)}
                </div>
                <div className="text-xs text-muted-foreground">
                  Budget : {formatEUR(statement.totals.budgetExits)}
                </div>
              </CardContent>
            </Card>
            <Card data-testid="cie-result">
              <CardContent className="pt-6">
                <div className="text-xs uppercase text-muted-foreground">Résultat</div>
                <div className="mt-1 text-2xl font-semibold">
                  <Amount value={statement.totals.result} />
                </div>
                <div className="text-xs text-muted-foreground">
                  Budget : {formatEUR(statement.totals.budgetResult)}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Réel vs budget — {formatMonthFr(`${year}-${String(month).padStart(2, "0")}`)}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table data-testid="cie-statement">
                <TableHeader>
                  <TableRow>
                    <TableHead>Catégorie</TableHead>
                    <TableHead>Sens</TableHead>
                    <TableHead>Réel</TableHead>
                    <TableHead>Budget</TableHead>
                    <TableHead>Écart</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statement.lines.map((line) => (
                    <TableRow key={line.category}>
                      <TableCell className="font-medium">
                        {COMPANY_FLOW_CATEGORY_LABELS[line.category]}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={line.direction === "ENTREE" ? "success" : "secondary"}
                        >
                          {line.direction === "ENTREE" ? "Entrée" : "Sortie"}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatEUR(line.actual)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatEUR(line.budget)}
                      </TableCell>
                      <TableCell>
                        <Amount value={line.variance} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Flux du mois</CardTitle>
            </CardHeader>
            <CardContent>
              {flows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun flux saisi.</p>
              ) : (
                <Table data-testid="cie-flows">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Catégorie</TableHead>
                      <TableHead>Libellé</TableHead>
                      <TableHead>Montant</TableHead>
                      <TableHead>Lien</TableHead>
                      {canWrite ? <TableHead /> : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {flows.map((flow) => (
                      <TableRow key={flow.id}>
                        <TableCell>{formatDateFr(flow.flowDate)}</TableCell>
                        <TableCell>
                          {COMPANY_FLOW_CATEGORY_LABELS[flow.category]}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {flow.label ?? "—"}
                        </TableCell>
                        <TableCell className="font-medium">
                          {formatEUR(flow.amount)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {flow.invoice?.pieceNumber ?? flow.partner?.companyName ?? "—"}
                        </TableCell>
                        {canWrite ? (
                          <TableCell>
                            <DeleteFlowButton flowId={flow.id} />
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="annee" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Résultat mensuel {year}</CardTitle>
              </CardHeader>
              <CardContent>
                {yearSummary.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Aucun flux pour {year}.
                  </p>
                ) : (
                  <Table data-testid="cie-year">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Mois</TableHead>
                        <TableHead>Entrées</TableHead>
                        <TableHead>Sorties</TableHead>
                        <TableHead>Résultat</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {yearSummary.map((m) => (
                        <TableRow key={m.month}>
                          <TableCell className="font-medium">
                            {formatMonthFr(m.month)}
                          </TableCell>
                          <TableCell>{formatEUR(m.entries)}</TableCell>
                          <TableCell>{formatEUR(m.exits)}</TableCell>
                          <TableCell>
                            <Amount value={m.result} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Ventilation des dépenses {year}</CardTitle>
              </CardHeader>
              <CardContent>
                {breakdown.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucune dépense.</p>
                ) : (
                  <Table data-testid="cie-breakdown">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Catégorie</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Part</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {breakdown.map((row) => (
                        <TableRow key={row.category}>
                          <TableCell className="font-medium">
                            {COMPANY_FLOW_CATEGORY_LABELS[row.category]}
                          </TableCell>
                          <TableCell>{formatEUR(row.total)}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {exitTotalCents === 0
                              ? "—"
                              : `${String(
                                  Math.round(
                                    (toCents(row.total) * 1000) / exitTotalCents
                                  ) / 10
                                ).replace(".", ",")} %`}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="budget" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>
                Budget — {formatMonthFr(`${year}-${String(month).padStart(2, "0")}`)}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <MonthPicker year={year} month={month} />
              {canWrite ? <SetBudgetForm year={year} month={month} /> : null}
              <Table data-testid="cie-budgets">
                <TableHeader>
                  <TableRow>
                    <TableHead>Catégorie</TableHead>
                    <TableHead>Budget du mois</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statement.lines.map((line) => (
                    <TableRow key={line.category}>
                      <TableCell className="font-medium">
                        {COMPANY_FLOW_CATEGORY_LABELS[line.category]}
                      </TableCell>
                      <TableCell>{formatEUR(line.budget)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
