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
  INTEREST_LEVEL_LABELS,
  PROSPECT_EVENT_TYPE_LABELS,
  PROSPECT_STATUS_LABELS,
} from "@/lib/labels";
import type { ActionState } from "@/lib/actions/safe-action";

import {
  addProspectEventAction,
  changeProspectStatusAction,
  createProspectAction,
  updateProspectAction,
  uploadProspectFilesAction,
} from "./actions";

type Option = { id: string; label: string };

export type ProspectFormValues = {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  targetZone: string | null;
  budget: string | null;
  personalContribution: string | null;
  leadSource: string | null;
  interestLevel: string | null;
  agentId: string | null;
  assigneeId: string | null;
  nextFollowUpDate: string | null;
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

export function ProspectStatusFilter({ current }: { current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(value: string) {
    const params = new URLSearchParams(searchParams);
    if (value === "tous") params.delete("statut");
    else params.set("statut", value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Select value={current || "tous"} onValueChange={setParam}>
      <SelectTrigger className="w-52" data-testid="prospect-status-filter">
        <SelectValue placeholder="Tous les statuts" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="tous">Tous les statuts</SelectItem>
        {Object.entries(PROSPECT_STATUS_LABELS).map(([value, label]) => (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ProspectFields({
  agents,
  devMembers,
  values,
}: {
  agents: Option[];
  devMembers: Option[];
  values?: ProspectFormValues;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="pr-firstname">Prénom</Label>
          <Input
            id="pr-firstname"
            name="firstName"
            required
            defaultValue={values?.firstName ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pr-lastname">Nom</Label>
          <Input
            id="pr-lastname"
            name="lastName"
            required
            defaultValue={values?.lastName ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pr-email">E-mail</Label>
          <Input
            id="pr-email"
            name="email"
            type="email"
            defaultValue={values?.email ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pr-phone">Téléphone</Label>
          <Input id="pr-phone" name="phone" defaultValue={values?.phone ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pr-city">Ville</Label>
          <Input id="pr-city" name="city" defaultValue={values?.city ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pr-zone">Zone visée</Label>
          <Input
            id="pr-zone"
            name="targetZone"
            defaultValue={values?.targetZone ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pr-budget">Budget (€)</Label>
          <Input
            id="pr-budget"
            name="budget"
            inputMode="decimal"
            defaultValue={values?.budget ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pr-contribution">Apport personnel (€)</Label>
          <Input
            id="pr-contribution"
            name="personalContribution"
            inputMode="decimal"
            defaultValue={values?.personalContribution ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pr-source">Origine du lead</Label>
          <Input
            id="pr-source"
            name="leadSource"
            placeholder="Salon, site web, parrainage…"
            defaultValue={values?.leadSource ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Intérêt</Label>
          <Select name="interestLevel" defaultValue={values?.interestLevel ?? "none"}>
            <SelectTrigger data-testid="prospect-interest-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              {Object.entries(INTEREST_LEVEL_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Agent immobilier</Label>
          <Select name="agentId" defaultValue={values?.agentId ?? "none"}>
            <SelectTrigger data-testid="prospect-agent-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Suivi par</Label>
          <Select name="assigneeId" defaultValue={values?.assigneeId ?? "none"}>
            <SelectTrigger data-testid="prospect-assignee-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              {devMembers.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pr-followup">Prochaine relance</Label>
          <Input
            id="pr-followup"
            name="nextFollowUpDate"
            type="date"
            defaultValue={values?.nextFollowUpDate ?? ""}
            data-testid="prospect-followup-input"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pr-notes">Notes internes</Label>
        <Textarea
          id="pr-notes"
          name="notes"
          rows={2}
          defaultValue={values?.notes ?? ""}
        />
      </div>
    </>
  );
}

export function CreateProspectDialog({
  agents,
  devMembers,
}: {
  agents: Option[];
  devMembers: Option[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createProspectAction,
    {}
  );
  useToasted(state, () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="new-prospect-button">
          <Plus /> Nouveau prospect
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nouveau prospect</DialogTitle>
          <DialogDescription>
            Candidat franchisé : contact, budget, zone, suivi.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <ProspectFields agents={agents} devMembers={devMembers} />
          <Button
            type="submit"
            className="w-full"
            disabled={pending}
            data-testid="prospect-submit"
          >
            {pending ? "Création…" : "Créer le prospect"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditProspectForm({
  prospectId,
  agents,
  devMembers,
  values,
}: {
  prospectId: string;
  agents: Option[];
  devMembers: Option[];
  values: ProspectFormValues;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateProspectAction,
    {}
  );
  useToasted(state);
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="prospectId" value={prospectId} />
      <ProspectFields agents={agents} devMembers={devMembers} values={values} />
      <Button type="submit" disabled={pending} data-testid="prospect-update">
        {pending ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </form>
  );
}

export function ProspectStatusForm({
  prospectId,
  current,
}: {
  prospectId: string;
  current: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    changeProspectStatusAction,
    {}
  );
  useToasted(state);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="prospectId" value={prospectId} />
      <div className="space-y-1">
        <Label className="text-xs">Statut</Label>
        <Select name="status" defaultValue={current}>
          <SelectTrigger className="w-48" data-testid="prospect-status-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(PROSPECT_STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="min-w-48 flex-1 space-y-1">
        <Label className="text-xs">Commentaire (facultatif)</Label>
        <Input name="note" className="h-9" data-testid="prospect-status-note" />
      </div>
      <Button
        type="submit"
        variant="outline"
        disabled={pending}
        data-testid="prospect-status-submit"
      >
        Changer
      </Button>
    </form>
  );
}

export function AddProspectEventForm({
  prospectId,
  today,
}: {
  prospectId: string;
  today: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    addProspectEventAction,
    {}
  );
  useToasted(state);
  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-2"
      key={state.success}
    >
      <input type="hidden" name="prospectId" value={prospectId} />
      <div className="space-y-1">
        <Label className="text-xs">Type</Label>
        <Select name="type" defaultValue="APPEL">
          <SelectTrigger className="w-40" data-testid="event-type-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(PROSPECT_EVENT_TYPE_LABELS)
              .filter(([value]) => value !== "STATUT")
              .map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Date</Label>
        <Input
          name="eventDate"
          type="date"
          defaultValue={today}
          className="h-9 w-40"
          required
        />
      </div>
      <div className="min-w-48 flex-1 space-y-1">
        <Label className="text-xs">Notes</Label>
        <Input name="notes" className="h-9" data-testid="event-notes-input" />
      </div>
      <Button type="submit" disabled={pending} data-testid="event-submit">
        <Plus /> Ajouter
      </Button>
    </form>
  );
}

export function ProspectFilesForm({ prospectId }: { prospectId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    uploadProspectFilesAction,
    {}
  );
  useToasted(state);
  return (
    <form action={formAction} className="flex items-center gap-2" key={state.success}>
      <input type="hidden" name="prospectId" value={prospectId} />
      <Input name="files" type="file" multiple className="h-9 max-w-64" />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "Envoi…" : "Joindre"}
      </Button>
    </form>
  );
}
