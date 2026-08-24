# Cartographie de l'application — CRM/ERP Big M

> Document de référence : où est chaque module, qui y a droit, comment tout
> s'articule. Complète le `CLAUDE.md` (état du projet + process de dev).
> Mise à jour : feuille de route client (phases 0 à 5, étapes 1 à 27)
> + améliorations post-V1 (étapes 28 à 33, puis 34 à 40).

## Vue d'ensemble

- **Stack** : Next.js 15 (App Router, TypeScript strict) · PostgreSQL 16 ·
  Drizzle ORM · Tailwind v4 · composants shadcn maison · recharts (graphiques).
- **Volumétrie** : 65 tables · 50 enums · 23 migrations · 40 services ·
  61 pages · 63 permissions · 9 rôles (+ rôles personnalisés dynamiques) ·
  10 jobs cron · 151 tests unitaires · 143 tests d'intégration ·
  89 parcours e2e Playwright.
- **Branche de travail** : `claude/crm-interne-plan-docker-s3neyk`
  (commits « Étape 1 » à « Étape 40 », un commit par étape, gate complet vert
  avant chacun).

## Architecture en couches (règles non négociables du CLAUDE.md)

```
UI (src/app/(app)/…)            pages serveur + composants client "use client"
  │  formulaires → server actions (actions.ts, safeFormAction)
  ▼
safeAction (src/lib/actions)    session + permission + validation Zod
  ▼
Services (src/services/*.service.ts)   SEULE couche qui écrit en base
  │  écritures via auditedInsert/Update/Delete (src/lib/db/audited.ts)
  ▼
Drizzle (src/db/schema.ts)      PostgreSQL — migrations générées, jamais de SQL manuel
```

Transverses : `src/lib/authz/permissions.ts` (matrice unique `can(user, perm)`
+ écarts dynamiques `permissionOverrides` chargés dans la session — ADMIN
immunisé) · `accessibleStoreIds`/`assertStoreAccess` (scoping du rôle
FRANCHISE) · `src/lib/money.ts` (centimes entiers, jamais de float) ·
`src/lib/foodcost.ts` (10^-8 € en BigInt) · `src/lib/dates.ts` (jours civils
Europe/Paris) · `src/lib/files/` (fichiers servis uniquement via
`/api/files/[id]`) · `src/lib/vault/crypto.ts` (AES-256-GCM, clé env
`VAULT_KEY`) · `src/lib/backup/` (pg_dump quotidien + manuel, rétention,
envoi FTP optionnel) · `src/components/calendar-month.tsx` (grille mensuelle
partagée : planning, congés, agenda) · `src/components/info-hint.tsx` (icône
ℹ posée sur les valeurs pilotées par un réglage hors page ou dérivées).

## Cartographie fonctionnelle (navigation → pages → accès)

### Accueil
| Page | Rôle(s) | Contenu |
|---|---|---|
| `/` | tous | Dashboard par rôle : boutique (franchisé), animateur, réseau+régions (siège), espace salarié. `data-testid="dashboard-title"` obligatoire partout. Bloc « Agenda — 30 prochains jours » (`agenda.service.ts` : visites, formations, contrats, factures, plans, jalons, tâches com, congés — filtré par permissions et périmètre ; absent du rôle SALARIE). |
| `/notifications` | tous | Cloche de notifications (dedupeKey anti-doublons). |
| `/mon-espace` | SALARIE (+ADMIN/DIRECTION) | Pointeuse Début/Pause/Reprise/Fin, feuille de temps, demandes de congés. |
| `/mon-compte` | tous | Coordonnées (téléphone), changement d'e-mail et de mot de passe (mdp actuel exigé, autres appareils déconnectés). |

### Réseau
| Page | Permission | Contenu |
|---|---|---|
| `/boutiques` (+fiche à onglets) | `store:read` | Photo (vignette en liste) + carte/lien OpenStreetMap (GPS). Fiche : infos, plateformes, contrats, échanges, finances, CA, animation, achats, rentabilité (succursales), historique + bandeau ouverture. |
| `/franchises` (+fiche) | `franchisee:read` | Fiche franchisé, docs signés de formation. |
| `/succursales` (+P&L) | `branch:read` (compta+dir) | Rentabilité mensuelle CA − achats DPS − dépenses. |
| `/contrats` | `contract:read` | Contrats + alerte échéance J-180. |
| `/echanges` | `exchange:read` | Échanges franchisés (notes internes invisibles du franchisé). |

### Animation
| Page | Permission | Contenu |
|---|---|---|
| `/animation/visites` (+grille) | `visit:read` (siège) | Audits/visites, grille de critères paramétrable, note % dérivée. |
| `/animation/plans-action` | `actionplan:read` (siège+franchisé scopé) | Plans « PA-… », machine à états, validation créateur/direction. |
| `/animation/planning` | `planning:read` (siège) | Créneaux animateurs (unique animateur+jour+période), vues jour/semaine/mois (`?vue=`), glisser-déposer vers un autre jour (conflits refusés, animateur notifié si tiers). |
| `/animation/animateurs` | `planning:read` | Fiches animateurs : zone, coût/km, stats km/visites. |
| `/animation/formations` | `training:read` (tous, franchisé scopé) | Formations, REALISEE exige compte rendu, docs REMIS/SIGNE. |

### Communication
| Page | Permission | Contenu |
|---|---|---|
| `/communication` | `commtask:read` | Tâches « COM-… » ; tout rôle dépose une DEMANDE, le demandeur valide. |
| `/partenaires` | `partner:read` (pas franchisé) | Fiches partenaires, notes internes réservées à `partner:write`. |

### Finances
| Page | Permission | Contenu |
|---|---|---|
| `/finances` | `finance:read` (compta+dir) | Factures `F<année>-XXXX`, paiements, relances 1-3. |
| `/ca` | `revenue:read` | Saisie/import CSV, évolution, N vs N-1, produits & familles, panier moyen. |
| `/achats` (+dépôts) | `purchase:read` | Achats DPS, ratio achats/CA, import CSV. |
| `/foodcost` | `foodcost:read` (siège sauf franchisé) | Ingrédients, tarifs par dépôt à date (dépôt créable à la volée depuis le formulaire de tarif avec `purchase:write`), recettes, synthèse, écart matière. |

### Développement
| Page | Permission | Contenu |
|---|---|---|
| `/developpement/ouvertures` | `opening:read` | 8 jalons DIP→J+30, checklist par pôle (`opening:checklist`). |
| `/developpement/prospects` | `development:read` (dév+dir) | Pipeline, événements journalisés, relances. |
| `/developpement/locaux` · `/developpement/agents` | `development:read` | Base de locaux (photos), agents immobiliers. |
| `/developpement/cessions` | `resale:read` (dév+dir) | Franchisés vendeurs — module invisible du reste. |

### Ressources humaines
| Page | Permission | Contenu |
|---|---|---|
| `/rh/salaries` (+fiche) | `hr:read` (RH+dir) | Dossiers salariés (salaire/notes RH absents des DTO hors `hr:read`), congés, temps de travail, documents. Salarié « siège » = `storeId` NULL : dossier visible des seuls membres de l'entité FRANCHISEUR (`users.franchisorMember`, ADMIN toujours membre). |
| `/rh/conges` | `hr:read` | Validation/refus des demandes + vue calendrier mensuelle des absences (`?vue=calendrier`, filtre par boutique / « Siège — Big M CIE », chips Validée/Demandée). |

### Direction
| Page | Permission | Contenu |
|---|---|---|
| `/direction/cockpit` | `direction:cockpit` (admin+dir) | 12 KPI cliquables, CA 12 mois, top/flop, écart matière M-1. |
| `/direction/finances-cie` | `company-finance:read` (compta+dir) | Flux Big M CIE (12 catégories), réel vs budget, ventilation. |

### Organisation & Administration
| Page | Permission | Contenu |
|---|---|---|
| `/tickets` | `ticket:read` (ou tickets « à moi ») | Tickets inter-pôles, plusieurs pôles destinataires (`extraPoles`) et plusieurs responsables (`ticketAssignees`, premier = principal) — TOUT utilisateur actif est assignable ; un salarié/franchisé assigné accède à SES tickets sans `ticket:read` (liste forcée « les miens »). |
| `/documents` | `document:read` | Bibliothèque versionnée, visibilité par rôle, dossiers de classement (création `document:folder`, délégable). |
| `/admin/utilisateurs` | `user:manage` | Comptes + rôles + « Se connecter en tant que » (ADMIN seul, audité). |
| `/admin/permissions` | `permission:manage` (ADMIN seul) | Matrice des droits modifiable à chaud par rôle (écarts stockés, ADMIN immunisé) + rôles PERSONNALISÉS : base ≠ ADMIN, chaque droit épinglé explicitement (un pin bat matrice et écarts du rôle de base), assignables aux utilisateurs, suppression bloquée tant qu'assignés. |
| `/admin/sauvegardes` | `backup:manage` | Sauvegardes pg_dump : quotidienne 05h30 + manuelle, téléchargement audité, rétention, envoi FTP optionnel. |
| `/admin/produits` | `product:manage` | Référentiel produits/familles. |
| `/admin/logiciels` | `software:read` (siège) / write dir | Registre des logiciels + personnes autorisées. |
| `/admin/coffre` | `vault:read` (admin+dir SEULS) | Secrets AES-256-GCM, révélation à l'unité auditée REVEAL. |
| `/admin/audit` | `audit:read` | Journal d'audit complet (qui, quoi, avant/après). |

## Rôles (9)

ADMIN et DIRECTION : tout — sauf « se connecter en tant que »
(`user:impersonate`) et la gestion des droits (`permission:manage`), réservés
au SEUL ADMIN. COMPTABILITE : finances, CA, achats, food cost, produits,
succursales, Big M CIE. ANIMATION : visites, plans, planning, formations.
COMMUNICATION : tâches com + partenaires (écriture). RH : dossiers salariés +
congés + formations. DEVELOPPEMENT : boutiques/franchisés/contrats (écriture),
ouvertures, prospection, cessions. FRANCHISE : scopé à SES boutiques (CA,
contrats, docs partagés, plans d'action, achats, formations, demandes com,
son projet d'ouverture). SALARIE : `self:clock` + `self:leave` uniquement
(pointeuse + congés).

Ces droits par défaut sont modifiables À CHAUD par l'admin via
`/admin/permissions` (table `permissionOverrides` : seuls les écarts sont
stockés ; le rôle ADMIN n'est jamais restreint). S'y ajoutent des **rôles
personnalisés** (`customRoles` + `customRolePermissions` : rôle de base +
droits épinglés un à un — un pin l'emporte sur la matrice ET sur les écarts
du rôle de base) et l'**entité FRANCHISEUR** : `users.franchisorMember`
(ADMIN inclus d'office) réserve les dossiers RH/congés/fichiers des salariés
du siège Big M CIE (`employees.storeId` NULL).

## Données (65 tables, par domaine)

- **Socle** : users (franchisorMember, customRoleId), sessions, franchisees,
  stores, storePlatforms, contracts, documents, documentVersions,
  documentFolders, fileAttachments, notifications, auditLogs,
  permissionOverrides, customRoles, customRolePermissions, backups.
- **Échanges & tickets** : exchanges, exchangeMessages, tickets (extraPoles),
  ticketComments, ticketAssignees.
- **Finances réseau** : invoices, payments, reminders.
- **CA & ventes** : revenueEntries (orderCount), productFamilies, products,
  productSales.
- **Animation** : auditCriteria, storeVisits, auditItems, actionPlans,
  actionPlanComments, animatorProfiles, animatorPlanEntries, trainings,
  trainingParticipants, trainingDocuments.
- **Achats & food cost** : depots, dpsPurchases, ingredients, ingredientPrices,
  recipes, recipeItems.
- **Communication** : partners, partnerStores, commTasks, commTaskComments.
- **RH** : employees, leaveRequests, clockEntries (index unique partiel « un
  badge ouvert »).
- **Développement** : openingProjects, openingSteps, openingChecklistItems,
  agents, prospects, prospectEvents, premises, resaleListings.
- **Succursales & CIE** : storeExpenses, companyFlows, companyBudgets.
- **Logiciels & coffre** : softwareRegistry, softwareUsers, vaultSecrets.

Dérivés jamais stockés : statuts « en retard », note % d'audit, panier moyen,
P&L, ratio achats/CA, coût matière, écart matière, sens des flux CIE.

## Jobs cron (10, Europe/Paris, rejouables via POST /api/admin/jobs/run)

| Heure | Job | Rôle |
|---|---|---|
| 05h30 | db-backup | Sauvegarde pg_dump + rétention + envoi FTP optionnel |
| 06h00 | contract-expiry | Échéances de contrats J-180 |
| 06h15 | invoice-overdue | Factures impayées |
| 06h25 | action-plan-overdue | Plans d'action en retard |
| 06h30 | revenue-drop | Baisse de CA 7 j vs N-1 (`REVENUE_DROP_THRESHOLD_PCT`) |
| 06h40 | audit-overdue | Boutiques sans audit (`AUDIT_MAX_DAYS`) |
| 06h50 | comm-task-overdue | Tâches communication en retard |
| 07h00 | opening-late | Jalons d'ouverture en retard |
| 07h10 | prospect-followup | Relances prospects (quotidien, dedupe/jour) |
| 07h20 | purchase-anomaly | Ratio achats/CA hors bornes ou écart matière (mensuel) |

## Feuille de route — état

- ✅ **Phase 0-1 (Socle + Cœur d'usage)** — étapes 1 à 11.
- ✅ **Phase 2 (Pilotage réseau)** — étapes 12 à 16.
- ✅ **Phase 3 (Métier spécialisé)** — étapes 17 à 21.
- ✅ **Phase 4 (Croissance réseau)** — étapes 22 à 24.
- ✅ **Phase 5 (Enrichissement)** — étapes 25 à 27.
- ✅ **Améliorations post-V1** — étapes 28 à 33 : mon compte + connexion
  « en tant que » · photo & GPS des boutiques · droits d'accès modifiables à
  chaud · tickets confiés à une personne · dossiers documentaires ·
  sauvegardes BDD (quotidienne/manuelle/FTP).
- ✅ **Améliorations post-V1, 2ᵉ vague** — étapes 34 à 40 : entité
  FRANCHISEUR (siège Big M CIE) · rôles personnalisés · tickets multi-pôles
  & multi-personnes · planning jour/semaine/mois + glisser-déposer · congés
  en calendrier par boutique · dépôt à la volée + icônes d'information
  (seuils env et valeurs dérivées) · agenda des 30 prochains jours sur les
  tableaux de bord.
- ⬜ **V2 (hors périmètre — nouveau devis)** : HACCP/hygiène, contrôles
  officiels, litiges, assurances/sinistres, maintenance/travaux, parc
  matériel, fournisseurs/ruptures, notes Google/Uber Eats/Deliveroo,
  non-conformités, échéances réglementaires, carnet de santé par boutique
  (cdc §24).

## Reprendre le développement (même sans historique de discussion)

1. Lire `CLAUDE.md` (état du projet, règles, pièges de l'environnement) puis
   ce document.
2. Se placer sur `claude/crm-interne-plan-docker-s3neyk` et suivre le process :
   nouvelle table → `src/db/schema.ts` + `npm run db:generate` →
   `npm run gate:full` vert → commit « Étape N : … » → push.
3. S'inspirer d'un module proche (tickets, finances, formations) : chaque
   module suit le même moule service + actions + pages + seed + 3 niveaux de
   tests.
