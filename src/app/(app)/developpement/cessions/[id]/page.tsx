import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { RESALE_STATUS_LABELS, RESALE_WISH_LABELS } from "@/lib/labels";
import { getResale } from "@/services/resales.service";
import { AccessDenied } from "@/components/access-denied";
import { EntityHistory } from "@/components/entity-history";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { EditResaleForm } from "../resale-components";

export const metadata: Metadata = { title: "Fiche cession" };

export default async function ResaleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!can(user, "resale:read")) return <AccessDenied />;

  const { id } = await params;
  const resale = await getResale(user, id);
  if (!resale) notFound();

  const canWrite = can(user, "resale:write");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold" data-testid="resale-title">
          Cession {resale.store.code} — {resale.store.name}
        </h1>
        <Badge variant="secondary">{RESALE_WISH_LABELS[resale.wish]}</Badge>
        <Badge variant={resale.status === "ACTIVE" ? "secondary" : "outline"}>
          {RESALE_STATUS_LABELS[resale.status]}
        </Badge>
        <Link
          href={`/boutiques/${resale.store.id}`}
          className="text-sm underline-offset-2 hover:underline"
        >
          Fiche boutique
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Suivi</CardTitle>
          </CardHeader>
          <CardContent>
            {canWrite ? (
              <EditResaleForm
                resaleId={resale.id}
                values={{
                  wish: resale.wish,
                  askingPrice: resale.askingPrice,
                  urgency: resale.urgency,
                  status: resale.status,
                  notes: resale.notes,
                }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {resale.notes ?? "Aucune note."}
              </p>
            )}
          </CardContent>
        </Card>

        <EntityHistory user={user} tableName="resale_listings" recordId={resale.id} />
      </div>
    </div>
  );
}
