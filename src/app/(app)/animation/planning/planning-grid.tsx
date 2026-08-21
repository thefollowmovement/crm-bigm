"use client";

import { useActionState, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PLAN_ACTIVITY_LABELS, PLAN_PERIOD_LABELS } from "@/lib/labels";
import type { ActionState } from "@/lib/actions/safe-action";

import { deleteEntryAction, upsertEntryAction } from "./actions";

type Entry = {
  id: string;
  animateurId: string;
  date: string;
  period: "MATIN" | "APRES_MIDI" | "JOURNEE";
  activity: string;
  storeId: string | null;
  storeLabel: string | null;
  label: string | null;
  kmEstimated: string | null;
  notes: string | null;
};

type Animateur = { id: string; name: string; canEdit: boolean };
type Day = { date: string; label: string };
type Option = { id: string; label: string };

type DialogState = {
  animateurId: string;
  date: string;
  entry: Entry | null;
} | null;

export function PlanningGrid({
  days,
  animateurs,
  entries,
  stores,
}: {
  days: Day[];
  animateurs: Animateur[];
  entries: Entry[];
  stores: Option[];
}) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const [upsertState, upsertAction, upserting] = useActionState<
    ActionState,
    FormData
  >(upsertEntryAction, {});
  const [deleteState, deleteAction, deleting] = useActionState<
    ActionState,
    FormData
  >(deleteEntryAction, {});

  useEffect(() => {
    if (upsertState.error) toast.error(upsertState.error);
    if (upsertState.success) {
      toast.success(upsertState.success);
      setDialog(null);
    }
  }, [upsertState]);

  useEffect(() => {
    if (deleteState.error) toast.error(deleteState.error);
    if (deleteState.success) {
      toast.success(deleteState.success);
      setDialog(null);
    }
  }, [deleteState]);

  function cellEntries(animateurId: string, date: string) {
    return entries.filter((e) => e.animateurId === animateurId && e.date === date);
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[900px] text-sm" data-testid="planning-grid">
          <thead>
            <tr className="border-b">
              <th className="p-2 text-left font-medium text-muted-foreground">
                Animateur
              </th>
              {days.map((day) => (
                <th
                  key={day.date}
                  className="p-2 text-left text-xs font-medium uppercase text-muted-foreground"
                >
                  {day.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {animateurs.map((animateur) => (
              <tr key={animateur.id} className="border-b last:border-0">
                <td className="p-2 font-medium">{animateur.name}</td>
                {days.map((day) => {
                  const list = cellEntries(animateur.id, day.date);
                  return (
                    <td key={day.date} className="min-w-32 p-1.5 align-top">
                      <div className="space-y-1">
                        {list.map((entry) => (
                          <button
                            key={entry.id}
                            type="button"
                            disabled={!animateur.canEdit}
                            onClick={() =>
                              setDialog({
                                animateurId: animateur.id,
                                date: day.date,
                                entry,
                              })
                            }
                            className="block w-full rounded-md border bg-background p-1.5 text-left text-xs hover:border-brand disabled:cursor-default"
                            data-testid="planning-entry"
                          >
                            <div className="flex items-center gap-1">
                              <Badge variant="secondary" className="px-1 text-[10px]">
                                {PLAN_PERIOD_LABELS[entry.period]}
                              </Badge>
                              <span className="font-medium">
                                {PLAN_ACTIVITY_LABELS[entry.activity]}
                              </span>
                              {animateur.canEdit ? (
                                <Pencil className="ml-auto size-3 opacity-40" />
                              ) : null}
                            </div>
                            <div className="truncate text-muted-foreground">
                              {entry.storeLabel ?? entry.label ?? ""}
                            </div>
                          </button>
                        ))}
                        {animateur.canEdit ? (
                          <button
                            type="button"
                            onClick={() =>
                              setDialog({
                                animateurId: animateur.id,
                                date: day.date,
                                entry: null,
                              })
                            }
                            className="flex w-full items-center justify-center rounded-md border border-dashed p-1 text-muted-foreground hover:border-brand hover:text-brand"
                            aria-label={`Ajouter un créneau le ${day.label}`}
                            data-testid={`add-entry-${animateur.id}-${day.date}`}
                          >
                            <Plus className="size-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog?.entry ? "Modifier le créneau" : "Nouveau créneau"}
            </DialogTitle>
            <DialogDescription>
              {dialog
                ? `${animateurs.find((a) => a.id === dialog.animateurId)?.name} — ${dialog.date}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {dialog ? (
            <form action={upsertAction} className="space-y-4" key={dialog.entry?.id ?? "new"}>
              <input type="hidden" name="animateurId" value={dialog.animateurId} />
              <input type="hidden" name="date" value={dialog.date} />
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Créneau</Label>
                  <Select
                    name="period"
                    defaultValue={dialog.entry?.period ?? "MATIN"}
                  >
                    <SelectTrigger data-testid="entry-period">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PLAN_PERIOD_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Activité</Label>
                  <Select
                    name="activity"
                    defaultValue={dialog.entry?.activity ?? "VISITE"}
                  >
                    <SelectTrigger data-testid="entry-activity">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PLAN_ACTIVITY_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Boutique (facultatif)</Label>
                <Select name="storeId" defaultValue={dialog.entry?.storeId ?? "none"}>
                  <SelectTrigger data-testid="entry-store">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {stores.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="entry-label">Libellé</Label>
                  <Input
                    id="entry-label"
                    name="label"
                    defaultValue={dialog.entry?.label ?? ""}
                    placeholder="Réunion réseau…"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="entry-km">Km estimés</Label>
                  <Input
                    id="entry-km"
                    name="kmEstimated"
                    inputMode="decimal"
                    defaultValue={dialog.entry?.kmEstimated ?? ""}
                    placeholder="42,5"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="entry-notes">Notes</Label>
                <Input
                  id="entry-notes"
                  name="notes"
                  defaultValue={dialog.entry?.notes ?? ""}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={upserting}
                  data-testid="entry-submit"
                >
                  {upserting ? "Enregistrement…" : "Enregistrer"}
                </Button>
                {dialog.entry ? (
                  <Button
                    type="submit"
                    variant="destructive"
                    formAction={(formData) => {
                      formData.set("entryId", dialog.entry!.id);
                      deleteAction(formData);
                    }}
                    disabled={deleting}
                    data-testid="entry-delete"
                  >
                    <Trash2 />
                  </Button>
                ) : null}
              </div>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
