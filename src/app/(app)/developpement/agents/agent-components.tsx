"use client";

import { useActionState, useEffect, useState } from "react";
import { Pencil, Plus } from "lucide-react";
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
import type { ActionState } from "@/lib/actions/safe-action";

import { createAgentAction, updateAgentAction } from "./actions";

export type AgentFormValues = {
  name: string;
  agency: string | null;
  email: string | null;
  phone: string | null;
  zone: string | null;
  notes: string | null;
};

function useToasted(state: ActionState, onSuccess?: () => void) {
  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) {
      toast.success(state.success);
      onSuccess?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}

function AgentFields({ values }: { values?: AgentFormValues }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="agent-name">Nom</Label>
          <Input id="agent-name" name="name" required defaultValue={values?.name ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="agent-agency">Agence</Label>
          <Input id="agent-agency" name="agency" defaultValue={values?.agency ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="agent-email">E-mail</Label>
          <Input
            id="agent-email"
            name="email"
            type="email"
            defaultValue={values?.email ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="agent-phone">Téléphone</Label>
          <Input id="agent-phone" name="phone" defaultValue={values?.phone ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="agent-zone">Zone</Label>
          <Input id="agent-zone" name="zone" defaultValue={values?.zone ?? ""} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="agent-notes">Notes</Label>
        <Textarea
          id="agent-notes"
          name="notes"
          rows={2}
          defaultValue={values?.notes ?? ""}
        />
      </div>
    </>
  );
}

export function CreateAgentDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createAgentAction,
    {}
  );
  useToasted(state, () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="new-agent-button">
          <Plus /> Nouvel agent
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agent immobilier</DialogTitle>
          <DialogDescription>Partenaire de la recherche de locaux.</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <AgentFields />
          <Button
            type="submit"
            className="w-full"
            disabled={pending}
            data-testid="agent-submit"
          >
            {pending ? "Création…" : "Créer"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditAgentDialog({
  agentId,
  isActive,
  values,
}: {
  agentId: string;
  isActive: boolean;
  values: AgentFormValues;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateAgentAction,
    {}
  );
  useToasted(state, () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Modifier l'agent">
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifier l&apos;agent</DialogTitle>
          <DialogDescription>{values.name}</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="agentId" value={agentId} />
          <AgentFields values={values} />
          <div className="space-y-1.5">
            <Label>Statut</Label>
            <Select name="isActive" defaultValue={isActive ? "true" : "false"}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Actif</SelectItem>
                <SelectItem value="false">Inactif</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
