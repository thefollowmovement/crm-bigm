# CRM Big M — règles du projet

CRM/ERP interne du réseau de franchise Big M. Next.js 15 (App Router, TS strict) +
PostgreSQL 16 + **Drizzle ORM** + Tailwind v4 + composants shadcn maison (`src/components/ui`).
**Toute l'interface utilisateur est en français.**

> Pourquoi Drizzle et pas Prisma : le CLI Prisma télécharge des binaires depuis
> binaries.prisma.sh, inaccessible depuis les réseaux restreints (dont cet
> environnement de dev). Drizzle est 100 % npm : schéma TS (`src/db/schema.ts`),
> migrations SQL générées par `npm run db:generate`, appliquées par
> `node scripts/db.mjs migrate` (aussi au boot du conteneur prod).

## Commandes

- `npm run gate` — lint → typecheck → unit → intégration → build. **Obligatoire avant de valider une étape.**
- `npm run gate:full` — gate + e2e Playwright (obligatoire si l'étape livre de l'UI).
- `npm run test:integration` — démarre un Postgres éphémère (port 5433) via Docker, exécute Vitest intégration, détruit la base.
- `npm run e2e` — Postgres éphémère (5434) + schéma + seed, puis Playwright lance l'app buildée sur le port 3100.
- Dev local : `docker compose up -d db` puis `npm run dev` (base sur 5432).

## Architecture — règles non négociables

1. **Écritures en base** : uniquement dans `src/services/*.service.ts`, appelés depuis des
   server actions wrappées par `safeAction` (`src/lib/actions/safe-action.ts`) qui vérifie
   session + permission + Zod et pose le contexte d'audit.
2. **Écritures auditées** : les services écrivent via les helpers de
   `src/lib/db/audited.ts` (`auditedInsert` / `auditedUpdate` / `auditedDelete`, étape 4)
   qui journalisent automatiquement dans AuditLog. Le client brut `db` de
   `src/lib/db/client.ts` est réservé aux lectures, à l'audit lui-même, au seed et aux tests.
3. **Audit** : pas d'update/delete en masse sans trace sur les tables auditées (pas de
   diff possible). Boucler sur les ids ou logger un événement agrégé explicite (ex. IMPORT).
4. **Jamais d'objet Prisma brut sérialisé vers un composant client.** Construire des DTO
   par rôle via `src/lib/authz/field-visibility.ts` (les champs sensibles — notes internes,
   finances — doivent être absents du payload, pas juste masqués en CSS).
5. **Permissions** : matrice unique dans `src/lib/authz/permissions.ts` (`can(user, perm)`).
   L'UI peut masquer des menus avec `can()`, mais la décision autoritaire est côté serveur.
6. **Montants** : `numeric(12,2)` en base (jamais float). Le driver pg renvoie des strings :
   les garder en string dans les DTO et faire l'arithmétique via `src/lib/money.ts`
   (centimes entiers) ou en SQL (SUM), jamais avec `parseFloat`/`===`.
7. **Dates civiles** (échéances, CA journalier) : raisonner en `YYYY-MM-DD` Europe/Paris,
   colonnes `@db.Date`. Ne pas comparer des jours via `new Date()` minuit UTC.
8. **Statuts dérivés** : « en retard » se calcule (`dueDate < aujourd'hui`), ne se stocke pas.
9. **Jobs cron** : idempotents et rejouables (dedupeKey sur Notification, marqueurs type
   `expiryAlertSentAt`). Déclenchables manuellement via `POST /api/admin/jobs/run`.
10. **Fichiers uploadés** : jamais servis statiquement — uniquement via
    `/api/files/[id]` (session + permission du parent). Chemin disque = UUID, jamais le
    nom d'origine.

## Tests

- Unit (`tests/unit`) : logique pure, sans DB.
- Intégration (`tests/integration`) : services contre Postgres réel ; `resetDb()` de
  `tests/integration/setup/reset-db.ts` entre les tests ; factories dans `tests/helpers`.
- E2E (`e2e/`) : parcours utilisateur via Playwright, données du seed e2e.
- Un module sans tests n'est pas terminé.

## Style

- Code et identifiants en anglais, libellés UI et messages d'erreur utilisateur en français.
- Formulaires : server actions + `useActionState` (pas de react-hook-form).
- Pas de nouvelle dépendance sans nécessité réelle.
