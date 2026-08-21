import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { formatEUR } from "@/lib/money";
import {
  RESALE_STATUS_LABELS,
  RESALE_WISH_LABELS,
  TICKET_PRIORITY_LABELS,
} from "@/lib/labels";
import { listResales } from "@/services/resales.service";
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

import { CreateResaleDialog } from "./resale-components";

export const metadata: Metadata = { title: "Cessions" };

export default async function ResalesPage() {
  const user = await requireUser();
  if (!can(user, "resale:read")) return <AccessDenied />;

  const canWrite = can(user, "resale:write");
  const [resales, stores] = await Promise.all([
    listResales(user),
    canWrite ? listStores(user) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Franchisés vendeurs</h1>
          <p className="text-sm text-muted-foreground">
            Suivi confidentiel des souhaits de cession — visible uniquement du
            développement et de la direction.
          </p>
        </div>
        {canWrite ? (
          <CreateResaleDialog
            stores={stores
              .filter((s) => s.type === "FRANCHISE")
              .map((s) => ({ id: s.id, label: `${s.code} — ${s.name}` }))}
          />
        ) : null}
      </div>

      <div className="rounded-xl border bg-card">
        <Table data-testid="resales-table">
          <TableHeader>
            <TableRow>
              <TableHead>Boutique</TableHead>
              <TableHead>Franchisé</TableHead>
              <TableHead>Souhait</TableHead>
              <TableHead>Prix demandé</TableHead>
              <TableHead>Urgence</TableHead>
              <TableHead>Statut</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {resales.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  Aucune cession en cours.
                </TableCell>
              </TableRow>
            ) : (
              resales.map((resale) => (
                <TableRow key={resale.id}>
                  <TableCell>
                    <Link
                      href={`/developpement/cessions/${resale.id}`}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {resale.store.code} — {resale.store.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {resale.store.franchisee?.companyName ?? "—"}
                  </TableCell>
                  <TableCell>{RESALE_WISH_LABELS[resale.wish]}</TableCell>
                  <TableCell>
                    {resale.askingPrice ? formatEUR(resale.askingPrice) : "—"}
                  </TableCell>
                  <TableCell>{TICKET_PRIORITY_LABELS[resale.urgency]}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        resale.status === "ACTIVE"
                          ? "secondary"
                          : resale.status === "CONCLUE"
                            ? "success"
                            : "outline"
                      }
                    >
                      {RESALE_STATUS_LABELS[resale.status]}
                    </Badge>
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
