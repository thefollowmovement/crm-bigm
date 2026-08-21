import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { STORE_STATUS_LABELS, STORE_TYPE_LABELS } from "@/lib/labels";
import { listStores } from "@/services/stores.service";
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

import { StoreListFilters } from "./store-list-filters";

export const metadata: Metadata = { title: "Boutiques" };

function statusVariant(status: string) {
  switch (status) {
    case "OUVERTE":
      return "success" as const;
    case "EN_PROJET":
      return "info" as const;
    case "FERMEE_TEMPORAIREMENT":
      return "warning" as const;
    default:
      return "destructive" as const;
  }
}

export default async function BoutiquesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!can(user, "store:read")) return <AccessDenied />;

  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q : undefined;
  const type =
    params.type === "FRANCHISE" || params.type === "SUCCURSALE"
      ? params.type
      : undefined;
  const STATUS_VALUES = [
    "EN_PROJET",
    "OUVERTE",
    "FERMEE_TEMPORAIREMENT",
    "FERMEE",
  ] as const;
  const status = STATUS_VALUES.find((s) => s === params.statut);

  const rows = await listStores(user, { search, type, status });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Boutiques</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} boutique{rows.length > 1 ? "s" : ""} — fiches centrales du
            réseau.
          </p>
        </div>
        {can(user, "store:write") ? (
          <Button asChild data-testid="new-store-button">
            <Link href="/boutiques/nouvelle">
              <Plus /> Nouvelle boutique
            </Link>
          </Button>
        ) : null}
      </div>

      <StoreListFilters current={{ q: search, type, statut: status }} />

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Nom</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Ville</TableHead>
              <TableHead>Franchisé</TableHead>
              <TableHead>Animateur</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  Aucune boutique.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((store) => (
                <TableRow key={store.id} data-testid={`store-row-${store.code}`}>
                  <TableCell>
                    <Link
                      href={`/boutiques/${store.id}`}
                      className="font-medium text-brand hover:underline"
                    >
                      {store.code}
                    </Link>
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/boutiques/${store.id}`} className="hover:underline">
                      {store.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {STORE_TYPE_LABELS[store.type]}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(store.status)}>
                      {STORE_STATUS_LABELS[store.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {store.city ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {store.franchisee?.companyName ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {store.animateur
                      ? `${store.animateur.firstName} ${store.animateur.lastName}`
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
