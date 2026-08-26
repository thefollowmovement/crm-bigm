"use client";

import { useActionState, useEffect } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionState } from "@/lib/actions/safe-action";

import {
  saveEmailSettingsAction,
  saveEmailTemplateAction,
  sendTestEmailAction,
} from "./actions";

function useToasted(state: ActionState) {
  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) toast.success(state.success);
  }, [state]);
}

export type SettingsValues = {
  host: string;
  port: number;
  secure: boolean;
  username: string | null;
  hasPassword: boolean;
  fromName: string;
  fromEmail: string;
  headerHtml: string | null;
  footerHtml: string | null;
  signatureHtml: string | null;
} | null;

export function EmailSettingsForm({ settings }: { settings: SettingsValues }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveEmailSettingsAction,
    {}
  );
  useToasted(state);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="smtp-host">Hôte SMTP</Label>
          <Input
            id="smtp-host"
            name="host"
            required
            defaultValue={settings?.host ?? ""}
            placeholder="smtp.hostinger.com"
            data-testid="smtp-host"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="smtp-port">Port</Label>
          <Input
            id="smtp-port"
            name="port"
            required
            inputMode="numeric"
            defaultValue={settings?.port ?? 587}
            placeholder="587"
            data-testid="smtp-port"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="smtp-username">Utilisateur (facultatif)</Label>
          <Input
            id="smtp-username"
            name="username"
            defaultValue={settings?.username ?? ""}
            placeholder="crm@321chicken.cloud"
            data-testid="smtp-username"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="smtp-password">Mot de passe</Label>
          <Input
            id="smtp-password"
            name="password"
            type="password"
            placeholder={
              settings?.hasPassword
                ? "défini — laisser vide pour conserver"
                : "mot de passe SMTP"
            }
            data-testid="smtp-password"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="smtp-from-name">Nom d&apos;expéditeur</Label>
          <Input
            id="smtp-from-name"
            name="fromName"
            required
            defaultValue={settings?.fromName ?? "CRM Big M"}
            data-testid="smtp-from-name"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="smtp-from-email">Adresse d&apos;expéditeur</Label>
          <Input
            id="smtp-from-email"
            name="fromEmail"
            type="email"
            required
            defaultValue={settings?.fromEmail ?? ""}
            placeholder="crm@321chicken.cloud"
            data-testid="smtp-from-email"
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="secure"
          value="true"
          defaultChecked={settings?.secure ?? false}
          className="size-4 accent-primary"
          data-testid="smtp-secure"
        />
        TLS implicite (port 465) — décoché : STARTTLS (port 587) ou aucun
      </label>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="smtp-header">Header HTML (haut de chaque e-mail)</Label>
          <Textarea
            id="smtp-header"
            name="headerHtml"
            rows={4}
            defaultValue={settings?.headerHtml ?? ""}
            placeholder={'<h2 style="color:#b91c1c;">Big M</h2>'}
            className="font-mono text-xs"
            data-testid="smtp-header"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="smtp-signature">Signature HTML</Label>
          <Textarea
            id="smtp-signature"
            name="signatureHtml"
            rows={4}
            defaultValue={settings?.signatureHtml ?? ""}
            placeholder="<p>Le service comptabilité<br>Big M CIE</p>"
            className="font-mono text-xs"
            data-testid="smtp-signature"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="smtp-footer">Footer HTML (bas de page grisé)</Label>
          <Textarea
            id="smtp-footer"
            name="footerHtml"
            rows={4}
            defaultValue={settings?.footerHtml ?? ""}
            placeholder="<p>Big M CIE — 12 rue Exemple, Lyon</p>"
            className="font-mono text-xs"
            data-testid="smtp-footer"
          />
        </div>
      </div>

      <Button type="submit" disabled={pending} data-testid="smtp-save">
        {pending ? "Enregistrement…" : "Enregistrer les paramètres"}
      </Button>
    </form>
  );
}

export function TestEmailForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    sendTestEmailAction,
    {}
  );
  useToasted(state);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div className="space-y-1.5">
        <Label htmlFor="test-email-to">Envoyer un e-mail de test à</Label>
        <Input
          id="test-email-to"
          name="to"
          type="email"
          required
          placeholder="vous@exemple.fr"
          className="w-72"
          data-testid="test-email-to"
        />
      </div>
      <Button
        type="submit"
        variant="outline"
        disabled={pending}
        data-testid="test-email-send"
      >
        <Send /> {pending ? "Envoi…" : "Envoyer le test"}
      </Button>
    </form>
  );
}

export function EmailTemplateForm({
  level,
  subject,
  bodyHtml,
}: {
  level: number;
  subject: string;
  bodyHtml: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveEmailTemplateAction,
    {}
  );
  useToasted(state);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="level" value={level} />
      <div className="space-y-1.5">
        <Label htmlFor={`template-${level}-subject`}>Sujet</Label>
        <Input
          id={`template-${level}-subject`}
          name="subject"
          required
          defaultValue={subject}
          data-testid={`template-${level}-subject`}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`template-${level}-body`}>Corps du message (HTML)</Label>
        <Textarea
          id={`template-${level}-body`}
          name="bodyHtml"
          required
          rows={8}
          defaultValue={bodyHtml}
          className="font-mono text-xs"
          data-testid={`template-${level}-body`}
        />
      </div>
      <Button
        type="submit"
        variant="outline"
        disabled={pending}
        data-testid={`template-${level}-save`}
      >
        {pending ? "Enregistrement…" : "Enregistrer le modèle"}
      </Button>
    </form>
  );
}
