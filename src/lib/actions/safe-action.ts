import "server-only";

import { z } from "zod";

import { requireUser } from "@/lib/auth/current-user";
import { ForbiddenError, assertCan } from "@/lib/authz/guards";
import type { Permission } from "@/lib/authz/permissions";
import type { SessionUser } from "@/lib/auth/session";

export type ActionState = { error?: string; success?: string };

// Wrapper standard des server actions de formulaire :
// 1. session obligatoire (requireUser)
// 2. permission de la matrice (optionnelle mais recommandée)
// 3. validation Zod du FormData
// 4. exécution du handler (couche service) avec gestion d'erreurs propre
//
// Le handler retourne le message de succès à afficher (toast).
export function safeFormAction<S extends z.ZodTypeAny>(
  opts: {
    permission?: Permission;
    schema: S;
    // Transforme le FormData brut avant validation (valeurs "none" → null…).
    // Par défaut : Object.fromEntries(formData).
    prepare?: (formData: FormData) => unknown;
  },
  handler: (input: z.infer<S>, actor: SessionUser) => Promise<string>
): (prev: ActionState, formData: FormData) => Promise<ActionState> {
  return async (_prev, formData) => {
    const actor = await requireUser();
    try {
      if (opts.permission) assertCan(actor, opts.permission);
      const raw = opts.prepare
        ? opts.prepare(formData)
        : Object.fromEntries(formData);
      const parsed = opts.schema.safeParse(raw);
      if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message ?? "Saisie invalide" };
      }
      const success = await handler(parsed.data, actor);
      return { success };
    } catch (e) {
      if (e instanceof ForbiddenError) return { error: e.message };
      if (e instanceof Error) return { error: e.message };
      return { error: "Une erreur est survenue." };
    }
  };
}

// Convertit les champs de formulaire optionnels ("" ou "none") en null.
export function nullable(value: FormDataEntryValue | null): string | null {
  const v = typeof value === "string" ? value.trim() : "";
  return v === "" || v === "none" ? null : v;
}
