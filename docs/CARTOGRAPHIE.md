# Cartographie de l'application — CRM/ERP Big M

> Document de référence : où est chaque module, qui y a droit, comment tout
> s'articule. Complète le `CLAUDE.md` (état du projet + process de dev).
> Mise à jour : fin de la feuille de route client (phases 0 à 5, étapes 1 à 27).

## Vue d'ensemble

- **Stack** : Next.js 15 (App Router, TypeScript strict) · PostgreSQL 16 ·
  Drizzle ORM · Tailwind v4 · composants shadcn maison · recharts (graphiques).
- **Volumétrie** : 59 tables · 47 enums · 15 migrations · 35 services ·
  57 pages · 59 permissions · 9 rôles · 9 jobs cron · 135 tests unitaires ·
  69 parcours e2e Playwright.
- **Branche de travail** : `claude/crm-interne-plan-docker-s3neyk`
  (commits « Étape 1 » à « Étape 27 », un commit par étape, gate complet vert
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

Transverses : `src/lib/authz/permissions.ts` (matrice unique `can(user, perm)`) ·
`accessibleStoreIds`/`assertStoreAccess` (scoping du rôle FRANCHISE) ·
`src/lib/money.ts` (centimes entiers, jamais de float) · `src/lib/foodcost.ts`
(10^-8 € en BigInt) · `src/lib/dates.ts` (jours civils Europe/Paris) ·
`src/lib/files/` (fichiers servis uniquement via `/api/files/[id]`) ·
`src/lib/vault/crypto.ts` (AES-256-GCM, clé env `VAULT_KEY`).

## Cartographie fonctionnelle (navigation → pages → accès)

### Accueil
| Page | Rôle(s) | Contenu |
|---|---|---|
| `/` | tous | Dashboard par rôle : boutique (franchisé), animateur, réseau+régions (siège), espace salarié. `data-testid="dashboard-title"` obligatoire partout. |
| `/notifications` | tous | Cloche de notifications (dedupeKey anti-doublons). |
| `/mon-espace` | SALARIE (+ADMIN/DIRECTION) | Pointeuse Début/Pause/Reprise/Fin, feuille de temps, demandes de congés. |

### Réseau
| Page | Permission | Contenu |
|---|---|---|
| `/boutiques` (+fiche à onglets) | `store:read` | Fiche : infos, plateformes, contrats, échanges, finances, CA, animation, achats, rentabilité (succursales), historique + bandeau ouverture. |
| `/franchises` (+fiche) | `franchisee:read` | Fiche franchisé, docs signés de formation. |
| `/succursales` (+P&L) | `branch:read` (compta+dir) | Rentabilité mensuelle CA − achats DPS − dépenses. |
| `/contrats` | `contract:read` | Contrats + alerte échéance J-180. |
| `/echanges` | `exchange:read` | Échanges franchisés (notes internes invisibles du franchisé). |

### Animation
| Page | Permission | Contenu |
|---|---|---|
| `/animation/visites` (+grille) | `visit:read` (siège) | Audits/visites, grille de critères paramétrable, note % dérivée. |
| `/animation/plans-action` | `actionplan:read` (siège+franchisé scopé) | Plans « PA-… », machine à états, validation créateur/direction. |
| `/animation/planning` | `planning:read` (siège) | Créneaux hebdo animateurs (unique animateur+jour+période). |
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
| `/foodcost` | `foodcost:read` (siège sauf franchisé) | Ingrédients, tarifs par dépôt à date, recettes, synthèse, écart matière. |

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
| `/rh/salaries` (+fiche) | `hr:read` (RH+dir) | Dossiers salariés (salaire/notes RH absents des DTO hors `hr:read`), congés, temps de travail, documents. |
| `/rh/conges` | `hr:read` | Validation/refus des demandes. |

### Direction
| Page | Permission | Contenu |
|---|---|---|
| `/direction/cockpit` | `direction:cockpit` (admin+dir) | 12 KPI cliquables, CA 12 mois, top/flop, écart matière M-1. |
| `/direction/finances-cie` | `company-finance:read` (compta+dir) | Flux Big M CIE (12 catégories), réel vs budget, ventilation. |

### Organisation & Administration
| Page | Permission | Contenu |
|---|---|---|
| `/tickets` | `ticket:read` | Tickets inter-pôles « T-… ». |
| `/documents` | `document:read` | Bibliothèque versionnée, visibilité par rôle. |
| `/admin/utilisateurs` | `user:manage` | Comptes + rôles. |
| `/admin/produits` | `product:manage` | Référentiel produits/familles. |
| `/admin/logiciels` | `software:read` (siège) / write dir | Registre des logiciels + personnes autorisées. |
| `/admin/coffre` | `vault:read` (admin+dir SEULS) | Secrets AES-256-GCM, révélation à l'unité auditée REVEAL. |
| `/admin/audit` | `audit:read` | Journal d'audit complet (qui, quoi, avant/après). |

## Rôles (9)

ADMIN et DIRECTION : tout. COMPTABILITE : finances, CA, achats, food cost,
produits, succursales, Big M CIE. ANIMATION : visites, plans, planning,
formations. COMMUNICATION : tâches com + partenaires (écriture). RH : dossiers
salariés + congés + formations. DEVELOPPEMENT : boutiques/franchisés/contrats
(écriture), ouvertures, prospection, cessions. FRANCHISE : scopé à SES
boutiques (CA, contrats, docs partagés, plans d'action, achats, formations,
demandes com, son projet d'ouverture). SALARIE : `self:clock` + `self:leave`
uniquement (pointeuse + congés).

## Données (59 tables, par domaine)

- **Socle** : users, sessions, franchisees, stores, storePlatforms, contracts,
  documents, documentVersions, fileAttachments, notifications, auditLogs.
- **Échanges & tickets** : exchanges, exchangeMessages, tickets, ticketComments.
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

## Jobs cron (9, Europe/Paris, rejouables via POST /api/admin/jobs/run)

| Heure | Job | Rôle |
|---|---|---|
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
