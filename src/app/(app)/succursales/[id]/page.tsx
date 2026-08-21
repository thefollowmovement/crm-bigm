import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { formatDateFr, todayParis } from "@/lib/dates";
import { formatMonthFr } from "@/lib/analytics";
import { formatEUR } from "@/lib/money";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/labels";
import {
  getBranchPnL,
  listBranches,
  listExpenses,
} from "@/services/branches.service";
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

import { AddExpenseDialog, DeleteExpenseButton } from "../expense-components";

export const metadata: Metadata = { title: "Rentabilité succursale" };

export default async function BranchDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!can(user, "branch:read")) return <AccessDenied />;

  const { id } = await params;
  const search = await searchParams;
  const today = todayParis();
  const currentYear = Number(today.slice(0, 4));
  const year =
    typeof search.annee === "string" && /^\d{4}$/.test(search.annee)
      ? Number(search.annee)
      : currentYear;

  const branches = await listBranches(user);
  const branch = branches.find((b) => b.id === id);
  if (!branch) notFound();

  const canWrite = can(user, "branch:write");
  const [months, expenses] = await Promise.all([
    getBranchPnL(user, id, year),
    listExpenses(user, id, year),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold" data-testid="branch-title">
            {branch.code} — {branch.name}
          </h1>
          <Badge variant="secondary">Succursale</Badge>
          <Link
            href={`/boutiques/${branch.id}`}
            className="text-sm underline-offset-2 hover:underline"
          >
            Fiche boutique
          </Link>
        </div>
        {canWrite ? <AddExpenseDialog storeId={branch.id} today={today} /> : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>P&L mensuel {year}</CardTitle>
        </CardHeader>
        <CardContent>
          {months.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune donnée pour {year}.
            </p>
          ) : (
            <Table data-testid="branch-pnl">
              <TableHeader>
                <TableRow>
                  <TableHead>Mois</TableHead>
                  <TableHead>CA brut</TableHead>
                  <TableHead>Achats DPS</TableHead>
                  <TableHead>Dépenses</TableHead>
                  <TableHead>Résultat</TableHead>
                  <TableHead>Marge</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {months.map((m) => (
                  <TableRow key={m.month}>
                    <TableCell className="font-medium">
                      {formatMonthFr(m.month)}
                    </TableCell>
                    <TableCell>{formatEUR(m.revenue)}</TableCell>
                    <TableCell>{formatEUR(m.purchases)}</TableCell>
                    <TableCell>{formatEUR(m.expenses)}</TableCell>
                    <TableCell
                      className={
                        m.result.startsWith("-")
                          ? "font-medium text-destructive"
                          : "font-medium"
                      }
                      data-testid={`pnl-result-${m.month}`}
                    >
                      {formatEUR(m.result)}
                    </TableCell>
                    <TableCell>
                      {m.marginPct === null
                        ? "—"
                        : `${String(m.marginPct).replace(".", ",")} %`}
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
          <CardTitle>Dépenses {year}</CardTitle>
        </CardHeader>
        <CardContent>
          {expenses.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune dépense saisie.</p>
          ) : (
            <Table data-testid="branch-expenses">
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead>Libellé</TableHead>
                  <TableHead>Montant</TableHead>
                  <TableHead>Saisie par</TableHead>
                  {canWrite ? <TableHead /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((expense) => (
                  <TableRow key={expense.id}>
                    <TableCell>{formatDateFr(expense.expenseDate)}</TableCell>
                    <TableCell>{EXPENSE_CATEGORY_LABELS[expense.category]}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {expense.label ?? "—"}
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatEUR(expense.amount)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {expense.enteredBy.firstName} {expense.enteredBy.lastName}
                    </TableCell>
                    {canWrite ? (
                      <TableCell>
                        <DeleteExpenseButton
                          storeId={branch.id}
                          expenseId={expense.id}
                        />
                      </TableCell>
                    ) : null}
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
