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

## État du projet (source de vérité pour reprendre le dev, même sans contexte)

> Cartographie complète de l'application (pages, permissions, tables, jobs,
> rôles) : `docs/CARTOGRAPHIE.md`.

**V1 LIVRÉE** (backlog « Phase 0 Socle + Phase 1 Cœur d'usage » du cahier des
charges, cf. commits « Étape 1 » à « Étape 11 ») : auth sessions DB + admin
utilisateurs · RBAC (matrice `authz/permissions.ts`, rôle FRANCHISE scopé à ses
boutiques) · audit trail complet + `/admin/audit` · boutiques & franchisés
(fiche à onglets) · bibliothèque documentaire versionnée · fichiers via
`/api/files/[id]` · contrats + job `contract-expiry` (J-180) · échanges
franchisés (notes internes/décisions) · finances (factures `F<année>-XXXX`,
paiements, relances 1-3, job `invoice-overdue`) · CA par canal + import CSV
(`lib/csv/revenue-import.ts`) · tickets inter-pôles (machine à états dans
`services/tickets.service.ts`) · notifications (cloche, `dedupeKey`) ·
packaging prod (`docker/`, `docker-compose.prod.yml`, Caddy HTTPS, entrypoint
= migrations + admin initial ; guide dans README).

**PHASE 2 « Pilotage réseau » LIVRÉE** (commits « Étape 12 » à « Étape 16 ») :
analytics CA via recharts derrière les wrappers uniques
`src/components/charts/` (évolution jour/semaine/mois, N vs N-1, régions,
animateurs — `services/revenue-analytics.service.ts`) · data ventes enrichie
(`revenueEntries.orderCount`, panier moyen dérivé en SQL, référentiel
produits/familles `/admin/produits` + import CSV ventes produits idempotent) ·
audits & visites terrain (grille paramétrable `auditCriteria`, note % dérivée,
`/animation/visites`) · plans d'action « PA-… » (machine à états + validation
créateur/direction, job `action-plan-overdue`) · plannings hebdo
(`/animation/planning`, créneau unique animateur+jour+période, notification si
modifié par un tiers) + fiches animateurs (zone, coût/km, stats) · page
d'accueil = dashboards par rôle (boutique/animateur/réseau+région, blocs
présents SEULEMENT si permission — garder `data-testid="dashboard-title"`
partout) · alertes `revenue-drop` (7 j vs N-1, seuil env
`REVENUE_DROP_THRESHOLD_PCT`) et `audit-overdue` (`AUDIT_MAX_DAYS`), dedupeKey
hebdo/mensuel sans marqueur. 5 jobs cron au total (06h00→06h40).

**PHASE 3 « Métier spécialisé » LIVRÉE** (commits « Étape 17 » à « Étape 21 ») :
achats DPS (`depots` + `stores.depotId`, import CSV, ratio achats/CA en SQL,
`/achats`) · Food Cost (`lib/foodcost.ts` en micro-euros BigInt, prix par
dépôt à date via DISTINCT ON, recettes/grammages, `/foodcost` — invisible du
franchisé) · formations (`/animation/formations`, machine à états REALISEE
exige compte rendu, docs REMIS/SIGNE remontés sur fiche franchisé) · tâches
communication « COM-… » (`/communication`, DEMANDE ouverte à tous, validation
par le demandeur, job `comm-task-overdue`) + partenaires (`/partenaires`,
`internalNotes` sensibles hors pôle) · RH (`/rh/salaries` + `/rh/conges` +
`/mon-espace`, rôle **SALARIE** = `self:clock`+`self:leave` uniquement,
salaire/notes RH absents des DTO hors `hr:read`, pointeuse à index unique
partiel « un badge ouvert », congés avec anti-chevauchement et notifications).
6 jobs cron (06h00→06h50).

**PHASE 4 « Croissance réseau » LIVRÉE** (commits « Étape 22 » à « Étape 24 ») :
workflow d'ouverture (`openingProjects` un par franchise EN_PROJET, 8 jalons
générés DIP→…→J+30, checklist collaborative « chaque pôle coche ses items »,
job `opening-late` 07h00, `/developpement/ouvertures`, bandeau fiche
boutique) · prospection (`/developpement/prospects` pipeline à statuts libres
mais événement STATUT journalisé, relance `prospect-followup` 07h10 dedupeKey
par jour, agents immobiliers, base de locaux avec photos PJ) · cessions
(`resale:*` — module invisible hors développement/direction, nav comprise) ·
succursales (`storeExpenses`, P&L mensuel dérivé CA−achats−dépenses en
centimes entiers via `branches.service.ts`, `/succursales`, onglet
Rentabilité, permissions `branch:*` compta+direction). 8 jobs cron
(06h00→07h10).

**PHASE 5 « Enrichissement » LIVRÉE** (commits « Étape 25 » à « Étape 27 ») :
finances Big M CIE (`companyFlows`/`companyBudgets`, 12 catégories cdc §5,
sens dérivé par `CATEGORY_DIRECTION`, réel vs budget au centime,
`/direction/finances-cie`, `company-finance:*` compta+direction) · écart
matière (`material-variance.service.ts` : théorique = ventes produits ×
recettes au tarif du dépôt, en 10^-8 € BigInt ; onglet sur `/foodcost`) ·
job `purchase-anomaly` 07h20 (bornes `PURCHASE_RATIO_MIN/MAX_PCT`,
`MATERIAL_VARIANCE_MAX_PCT`) · cockpit Direction (`/direction/cockpit`,
permission `direction:cockpit`, 12 KPI cliquables en Promise.all) · registre
logiciels (`/admin/logiciels`, `software:read` siège / write direction) ·
coffre-fort (`/admin/coffre`, AES-256-GCM `lib/vault/crypto.ts`, clé env
`VAULT_KEY` 32 o base64 SANS fallback, format `v1:iv:tag:cipher`, révélation
à l'unité auditée `REVEAL`, `encrypted` dans SENSITIVE_FIELDS d'audited.ts).
9 jobs cron (06h00→07h20).

**AMÉLIORATIONS POST-V1 LIVRÉES** (commits « Étape 28 » à « Étape 33 »,
demandes client hors feuille de route initiale) : `/mon-compte` (chaque
utilisateur change e-mail/mot de passe/téléphone, mdp actuel exigé, autres
appareils déconnectés) + « Se connecter en tant que » (`user:impersonate`
ADMIN SEUL — hors ALL —, session usurpée avec `impersonatorUserId`, bannière
de retour, audit IMPERSONATE) · boutiques : photo (pièce jointe STORE_PHOTO
unique servie via `/api/files/[id]`, vignette en liste) + latitude/longitude
et carte/lien OpenStreetMap · droits d'accès dynamiques (`/admin/permissions`,
table `permissionOverrides` = écarts seuls, chargés dans la session par
`validateSessionToken`, appliqués par `can()`, ADMIN immunisé,
`permission:manage` ADMIN seul) · tickets confiés à une personne précise
(tous collaborateurs internes actifs, affectation dès la création → statut
AFFECTE + notification) · dossiers documentaires (`documentFolders`
arborescents, `documents.folderId`, suppression à vide uniquement, permission
`document:folder` direction par défaut et délégable via /admin/permissions) ·
sauvegardes BDD (`/admin/sauvegardes`, `backups.service` = pg_dump -Fc dans
`BACKUP_DIR`, job `db-backup` 05h30 + rétention `BACKUP_RETENTION_DAYS` sur
les planifiées, envoi FTP/FTPS optionnel `BACKUP_FTP_*` via basic-ftp,
téléchargement audité `/api/backups/[id]`, permission `backup:manage`,
pg_dump ajouté à l'image Docker + volume `backups_data` ; Google Drive =
client de synchro pointé sur BACKUP_DIR, documenté dans l'UI). 10 jobs cron
(05h30→07h20).

**AMÉLIORATIONS POST-V1, 2ᵉ VAGUE LIVRÉE** (commits « Étape 34 » à
« Étape 40 ») : entité FRANCHISEUR (`users.franchisorMember`, salarié du
siège = `employees.storeId` NULL, guard `isFranchisorMember` — ADMIN toujours
membre — ; dossiers RH/congés/fichiers du siège réservés aux membres,
libellé « Siège — Big M CIE », case dédiée dans /admin/utilisateurs) · rôles
personnalisés (`customRoles`/`customRolePermissions` : base ≠ ADMIN + droits
ÉPINGLÉS explicitement — un pin bat la matrice ET les écarts du rôle de
base —, `users.customRoleId`, colonnes dans /admin/permissions, sélecteur
« custom:<id> » à la création/édition d'utilisateur, suppression bloquée si
assigné) · tickets multi-pôles & multi-personnes (`tickets.extraPoles`
pole[], table `ticketAssignees`, premier assigné = principal, TOUT
utilisateur actif assignable ; un salarié/franchisé assigné voit SES tickets
sans `ticket:read` — listTickets force « les miens », getTicket sinon
Forbidden) · planning en vues jour/semaine/mois (`?vue=`) + glisser-déposer
(`moveEntry`, conflit jour cible `hasDayConflict`, notification si déplacé
par un tiers) via composant partagé `src/components/calendar-month.tsx` +
helpers `monthGridDays`/`startOfMonthIso` · congés en vue calendrier par
boutique (`/rh/conges?vue=calendrier`, filtre boutique/« Siège », chips
Validée verte / Demandée « ? » orange, `listLeaves({overlapping})`) ·
Food Cost : création de dépôt à la volée dans le formulaire de tarif
(sentinelle « NOUVEAU », `purchase:write` vérifié par le service achats) ·
icônes d'information `src/components/info-hint.tsx` (title natif, server
components) sur les seuils env (bornes achats/CA, écart matière, baisse CA,
audit en retard, rétention sauvegardes — valeurs effectives affichées via
`purchaseThresholds()`/`auditMaxDays()`/`dropThresholdPct()`/`retentionDays()`)
et les valeurs dérivées (food cost % du PV, panier moyen) · agenda du
tableau de bord (`services/agenda.service.ts` : 8 sources datées — visites,
formations, contrats, factures, plans, jalons, tâches com, congés — filtrées
par `can()` + périmètre franchisé ; bloc `DashboardAgenda` = mois en cours +
liste 30 jours sur les 3 dashboards, absent du rôle SALARIE).

**AMÉLIORATIONS POST-V1, 3ᵉ VAGUE LIVRÉE** (commits « Étape 41 » à
« Étape 43 ») : saisie du CA en tableau (dialogue unique : une ligne par
canal — brut/net/commandes —, seuls les canaux renseignés sont écrits,
service `upsertDayEntries` en boucle auditée) · menus Food Cost (`menus` +
`menuItems` : produits du référentiel × quantité ET/OU ingrédients directs
type emballage, contrainte un-seul-référent ; coût matière du menu dérivé =
Σ coût produit × qté + emballages au tarif du dépôt, % du PV du menu,
onglet « Menus » sur /foodcost, helper pur `scaleAmount`) · e-mails
(`/admin/emails`, permission `email:manage` ADMIN+DIRECTION : SMTP en base
avec mot de passe chiffré VAULT_KEY — `passwordEncrypted` dans
SENSITIVE_FIELDS —, header/signature/footer HTML, e-mail de test, modèles
de relance par niveau 1-3 avec variables `{{…}}` (`lib/email/render.ts`
pur : valeurs échappées, variables inconnues visibles), aperçu iframe
sandbox ; relance facture canal EMAIL = case « envoyer l'e-mail » →
nodemailer (SEULE nouvelle dépendance), envoi AVANT enregistrement (échec →
aucune trace), destinataire dans `reminders.emailSentTo`).

**ÉTAPE 44 LIVRÉE — refonte UI/UX** (modèle des maquettes client) : tokens
dans `globals.css` (fond gris chaud, cartes 16 px, primaire quasi-noir,
sidebar claire à pastille active, rouge Big M en accent) + composants
partagés (boutons/badges pill, onglets segmentés, tableaux aérés, dialogues
arrondis, graphiques monochromes via `--chart-1`). Aucune logique ni
testid modifiés : tout style passe par tokens + `src/components/ui`.

**FEUILLE DE ROUTE CLIENT TERMINÉE (phases 0 à 5 + améliorations 28-44).**
Reste hors périmètre : la « V2 » (pôle 15 « Modules complémentaires » du cdc
§24 : HACCP, litiges, assurances, maintenance, parc matériel, notes
plateformes…) — nouveau devis.

**Process par étape (non négociable)** : implémenter (nouvelle table = ajout
dans `src/db/schema.ts` + `npm run db:generate`, jamais de SQL à la main) →
`npm run gate` (ou `gate:full` si UI) vert → commit en français « Étape N : … »
→ push sur la branche de travail. S'inspirer d'un module existant proche
(ex. tickets ou finances) pour les patterns.

## Pièges connus de l'environnement

- **Prisma est banni** (binaires bloqués) — Drizzle uniquement, cf. plus haut.
- Environnements sans Docker (sandbox CI) : les scripts de test basculent
  automatiquement sur un Postgres local (`scripts/local-pg.sh`) ; les registres
  d'images peuvent être bloqués → `docker build`/`pull` impossibles, valider le
  compose avec `docker compose config`.
- Playwright : si le navigateur téléchargé manque, exporter
  `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium` (géré par `scripts/e2e.sh`).
- Ports : dev 5432 · tests intégration 5433 · e2e 5434 (app e2e sur 3100).
- Pas de Google Fonts ni d'appel réseau au build (doit builder hors ligne).
- Fichier « use server » : jamais d'arrow inline dans un schéma Zod au niveau
  d'un export (`z.custom()`, `.transform()`, etc.) — hisser le schéma en const
  module (« Server Actions must be async functions » au build Next sinon).
- Comptes seed démo (`SEED_DEMO=true`) : `admin@bigm.fr` (mdp du .env) ;
  `direction@ / compta@ / animateur@ / communication@ / rh@ / developpement@ /
  franchise@ / salarie@bigm.fr`, mdp commun `Test1234!` ; `inactif@bigm.fr`
  désactivé ; `profil@bigm.fr` réservé au parcours e2e « Mon compte » (son
  e-mail/mdp changent en test — ne pas l'utiliser ailleurs).
