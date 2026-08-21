import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { todayParis } from "@/lib/dates";
import { formatEUR } from "@/lib/money";
import { getBranchesOverview } from "@/services/branches.service";
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

export const metadata: Metadata = { title: "Succursales" };

export default async function BranchesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!can(user, "branch:read")) return <AccessDenied />;

  const params = await searchParams;
  const currentYear = Number(todayParis().slice(0, 4));
  const year =
    typeof params.annee === "string" && /^\d{4}$/.test(params.annee)
      ? Number(params.annee)
      : currentYear;

  const overview = await getBranchesOverview(user, year);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Succursales — rentabilité {year}</h1>
          <p className="text-sm text-muted-foreground">
            CA brut − achats DPS − dépenses saisies = résultat (année civile).
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          {[currentYear - 1, currentYear].map((y) => (
            <Link
              key={y}
              href={`/succursales?annee=${y}`}
              className={
                y === year
                  ? "font-semibold underline underline-offset-4"
                  : "text-muted-foreground underline-offset-4 hover:underline"
              }
            >
              {y}
            </Link>
          ))}
        </div>
      </div>

      <div className="rounded-xl border bg-card">
        <Table data-testid="branches-table">
          <TableHeader>
            <TableRow>
              <TableHead>Succursale</TableHead>
              <TableHead>CA brut</TableHead>
              <TableHead>Achats DPS</TableHead>
              <TableHead>Dépenses</TableHead>
              <TableHead>Résultat</TableHead>
              <TableHead>Marge</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {overview.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  Aucune succursale.
                </TableCell>
              </TableRow>
            ) : (
              overview.map((branch) => (
                <TableRow key={branch.id}>
                  <TableCell>
                    <Link
                      href={`/succursales/${branch.id}?annee=${year}`}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {branch.code} — {branch.name}
                    </Link>
                  </TableCell>
                  <TableCell>{formatEUR(branch.revenue)}</TableCell>
                  <TableCell>{formatEUR(branch.purchases)}</TableCell>
                  <TableCell>{formatEUR(branch.expenses)}</TableCell>
                  <TableCell
                    className={
                      branch.result.startsWith("-")
                        ? "font-medium text-destructive"
                        : "font-medium"
                    }
                  >
                    {formatEUR(branch.result)}
                  </TableCell>
                  <TableCell>
                    {branch.marginPct === null ? (
                      "—"
                    ) : (
                      <Badge variant={branch.marginPct >= 0 ? "success" : "destructive"}>
                        {String(branch.marginPct).replace(".", ",")} %
                      </Badge>
                    )}
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
