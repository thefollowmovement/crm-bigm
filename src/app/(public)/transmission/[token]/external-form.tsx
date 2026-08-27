"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
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

import { submitExternalAction } from "./actions";

const CASE_OPTIONS: [string, string][] = [
  ["FACTURE_FOURNISSEUR", "Facture fournisseur"],
  ["FACTURE_INFLUENCEUR", "Facture influenceur / partenariat"],
  ["QUITTANCE", "Quittance"],
  ["AUTRE", "Autre"],
];

export function ExternalTransmissionForm({
  token,
  defaultName,
}: {
  token: string;
  defaultName: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    submitExternalAction,
    {}
  );

  if (state.success) {
    return (
      <div
        className="rounded-xl border border-green-200 bg-green-50 p-6 text-center"
        data-testid="external-success"
      >
        <p className="text-lg font-semibold text-green-800">Document transmis ✓</p>
        <p className="mt-2 text-sm text-green-700">{state.success}</p>
        <p className="mt-2 text-xs text-green-700">
          Ce lien était à usage unique : il n&apos;est plus actif. Pour un
          nouvel envoi, demandez un nouveau lien à votre contact.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div className="space-y-1.5">
        <Label htmlFor="ext-name">Votre nom / société *</Label>
        <Input
          id="ext-name"
          name="externalName"
          required
          defaultValue={defaultName}
          data-testid="external-name"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="ext-type">Nature de l&apos;envoi</Label>
          <Select name="type" defaultValue="FACTURE">
            <SelectTrigger id="ext-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="FACTURE">Facture</SelectItem>
              <SelectItem value="DEMANDE">Demande</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ext-case">Type de document</Label>
          <Select name="caseType" defaultValue="FACTURE_FOURNISSEUR">
            <SelectTrigger id="ext-case">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CASE_OPTIONS.map(([v, l]) => (
                <SelectItem key={v} value={v}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ext-subject">Objet *</Label>
        <Input
          id="ext-subject"
          name="subject"
          required
          placeholder="Facture n° 2026-042 — prestation juillet"
          data-testid="external-subject"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ext-amount">Montant TTC (€, optionnel)</Label>
        <Input
          id="ext-amount"
          name="amount"
          inputMode="decimal"
          placeholder="1234,56"
          data-testid="external-amount"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ext-message">Message (optionnel)</Label>
        <Textarea id="ext-message" name="message" rows={3} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ext-files">
          Documents * (PDF ou image, 10 Mo max, 5 fichiers max)
        </Label>
        <Input
          id="ext-files"
          name="files"
          type="file"
          multiple
          required
          accept=".pdf,.png,.jpg,.jpeg,.webp"
          data-testid="external-files"
        />
      </div>
      {state.error ? (
        <p className="text-sm font-medium text-destructive" data-testid="external-error">
          {state.error}
        </p>
      ) : null}
      <Button
        type="submit"
        className="w-full"
        disabled={pending}
        data-testid="external-submit"
      >
        {pending ? "Envoi en cours…" : "Transmettre le document"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Lien sécurisé à usage unique. Votre envoi sera examiné par la
        comptabilité avant toute intégration.
      </p>
    </form>
  );
}
