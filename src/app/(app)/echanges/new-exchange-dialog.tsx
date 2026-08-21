"use client";

import { useActionState, useEffect, useState } from "react";
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
import { EXCHANGE_TYPE_LABELS } from "@/lib/labels";
import type { ActionState } from "@/lib/actions/safe-action";

import { createExchangeAction } from "./actions";

export type StoreOption = { id: string; code: string; name: string };

// Dialog de création : la liste des boutiques est déjà scopée côté serveur
// (un franchisé ne reçoit que ses boutiques via listStores).
export function NewExchangeDialog({ stores }: { stores: StoreOption[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createExchangeAction,
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
        <Button data-testid="new-exchange-button">
          <Plus /> Nouvel échange
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nouvel échange</DialogTitle>
          <DialogDescription>
            L&apos;animateur de la boutique et la direction seront notifiés.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Boutique</Label>
            <Select name="storeId" defaultValue={stores[0]?.id}>
              <SelectTrigger data-testid="exchange-store-select">
                <SelectValue placeholder="Choisir une boutique" />
              </SelectTrigger>
              <SelectContent>
                {stores.map((store) => (
                  <SelectItem key={store.id} value={store.id}>
                    {store.code} — {store.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select name="type" defaultValue="DEMANDE">
              <SelectTrigger data-testid="exchange-type-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(EXCHANGE_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="exchange-subject">Sujet</Label>
            <Input id="exchange-subject" name="subject" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="exchange-body">Message</Label>
            <Textarea id="exchange-body" name="body" rows={4} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="exchange-files">Pièces jointes</Label>
            <Input id="exchange-files" name="files" type="file" multiple />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Création…" : "Créer l'échange"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
