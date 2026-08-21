import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { listFranchisees } from "@/services/franchisees.service";
import { AccessDenied } from "@/components/access-denied";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "Franchisés" };

export default async function FranchisesPage() {
  const user = await requireUser();
  if (!can(user, "franchisee:read")) return <AccessDenied />;

  const rows = await listFranchisees(user);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Franchisés</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} société{rows.length > 1 ? "s" : ""} franchisée
            {rows.length > 1 ? "s" : ""} du réseau.
          </p>
        </div>
        {can(user, "franchisee:write") ? (
          <Button asChild data-testid="new-franchisee-button">
            <Link href="/franchises/nouveau">
              <Plus /> Nouveau franchisé
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Société</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Ville</TableHead>
              <TableHead>SIREN</TableHead>
              <TableHead>Boutiques</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Aucun franchisé.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((f) => (
                <TableRow key={f.id}>
                  <TableCell>
                    <Link
                      href={`/franchises/${f.id}`}
                      className="font-medium text-brand hover:underline"
                    >
                      {f.companyName}
                    </Link>
                    {f.legalForm ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {f.legalForm}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {f.contactFirstName} {f.contactLastName}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{f.city ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{f.siren ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {f.stores.map((s) => (
                        <Badge key={s.id} variant="secondary">
                          {s.code}
                        </Badge>
                      ))}
                      {f.stores.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : null}
                    </div>
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
