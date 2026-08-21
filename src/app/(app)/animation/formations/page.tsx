import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { formatDateFr } from "@/lib/dates";
import { TRAINING_STATUS_LABELS, TRAINING_TYPE_LABELS } from "@/lib/labels";
import { listTrainings } from "@/services/trainings.service";
import { listAssignableUsers } from "@/services/action-plans.service";
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

import { CreateTrainingDialog } from "./training-components";

export const metadata: Metadata = { title: "Formations" };

function statusVariant(status: string) {
  switch (status) {
    case "VALIDEE":
      return "success" as const;
    case "REALISEE":
      return "info" as const;
    case "ANNULEE":
      return "outline" as const;
    default:
      return "secondary" as const;
  }
}

export default async function FormationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!can(user, "training:read")) return <AccessDenied />;

  const params = await searchParams;
  const canWrite = can(user, "training:write");
  const stores = await listStores(user);
  const storeId =
    typeof params.boutique === "string" &&
    stores.some((s) => s.id === params.boutique)
      ? params.boutique
      : undefined;

  const [trainingList, trainers] = await Promise.all([
    listTrainings(user, { storeId }),
    canWrite ? listAssignableUsers(user) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Formations</h1>
          <p className="text-sm text-muted-foreground">
            Formations par boutique : participants, compte rendu, documents
            remis et signés, validation.
          </p>
        </div>
        {canWrite ? (
          <CreateTrainingDialog
            stores={stores.map((s) => ({ id: s.id, label: `${s.code} — ${s.name}` }))}
            trainers={trainers.map((t) => ({
              id: t.id,
              label: `${t.firstName} ${t.lastName}`,
            }))}
          />
        ) : null}
      </div>

      <div className="rounded-xl border bg-card">
        <Table data-testid="trainings-table">
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Boutique</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Formateur</TableHead>
              <TableHead className="text-right">Participants</TableHead>
              <TableHead>Statut</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {trainingList.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  Aucune formation.
                </TableCell>
              </TableRow>
            ) : (
              trainingList.map((training) => (
                <TableRow key={training.id}>
                  <TableCell>
                    <Link
                      href={`/animation/formations/${training.id}`}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {formatDateFr(training.trainingDate)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {training.store.code} — {training.store.name}
                  </TableCell>
                  <TableCell>{TRAINING_TYPE_LABELS[training.type]}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {training.trainer.firstName} {training.trainer.lastName}
                  </TableCell>
                  <TableCell className="text-right">
                    {training.participants.length}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(training.status)}>
                      {TRAINING_STATUS_LABELS[training.status]}
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
