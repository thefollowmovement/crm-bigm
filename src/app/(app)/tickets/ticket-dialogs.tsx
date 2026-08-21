"use client";

import { useActionState, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Textarea } from "@/components/ui/textarea";
import {
  POLE_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
} from "@/lib/labels";
import type { ActionState } from "@/lib/actions/safe-action";

import { createTicketAction } from "./actions";

export function TicketFilters({
  current,
}: {
  current: { vue: string; statut?: string; priorite?: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams);
    if (value === null || value === "all") params.delete(key);
    else params.set(key, value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={current.vue} onValueChange={(v) => setParam("vue", v)}>
        <SelectTrigger className="w-44" data-testid="ticket-view-filter">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tous les tickets</SelectItem>
          <SelectItem value="pole">Mon pôle</SelectItem>
          <SelectItem value="mine">Mes tickets</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={current.statut ?? "all"}
        onValueChange={(v) => setParam("statut", v)}
      >
        <SelectTrigger className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tous les statuts</SelectItem>
          {Object.entries(TICKET_STATUS_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={current.priorite ?? "all"}
        onValueChange={(v) => setParam("priorite", v)}
      >
        <SelectTrigger className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Toutes les priorités</SelectItem>
          {Object.entries(TICKET_PRIORITY_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function CreateTicketDialog({
  stores,
}: {
  stores: { id: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createTicketAction,
    {}
  );

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) {
      toast.success(state.success);
      setOpen(false);
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="new-ticket-button">
          <Plus /> Nouveau ticket
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nouveau ticket</DialogTitle>
          <DialogDescription>
            Le pôle destinataire est notifié immédiatement.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ticket-title">Objet</Label>
            <Input id="ticket-title" name="title" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ticket-description">Description</Label>
            <Textarea id="ticket-description" name="description" rows={4} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Pôle destinataire</Label>
              <Select name="toPole" defaultValue="DIRECTION">
                <SelectTrigger data-testid="ticket-topole">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(POLE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priorité</Label>
              <Select name="priority" defaultValue="NORMALE">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TICKET_PRIORITY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Boutique concernée</Label>
              <Select name="storeId" defaultValue="none">
                <SelectTrigger>
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
            <div className="space-y-1.5">
              <Label htmlFor="ticket-due">Échéance</Label>
              <Input id="ticket-due" name="dueDate" type="date" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ticket-files">Pièces jointes</Label>
            <Input id="ticket-files" name="files" type="file" multiple />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Création…" : "Créer le ticket"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
