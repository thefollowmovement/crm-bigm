# Cartographie de l'application — CRM/ERP Big M

> Document de référence : où est chaque module, qui y a droit, comment tout
> s'articule. Complète le `CLAUDE.md` (état du projet + process de dev).
> Mise à jour : feuille de route client (phases 0 à 5, étapes 1 à 27)
> + améliorations post-V1 (étapes 28 à 33, 34 à 40, 41 à 43, 44, 45 :
> vitrine publique + administration masquée) + module comptabilité
> (étapes 46 à 50 : structures, journal factures, transmissions, accès
> externe sécurisé, imports calés sur les exports réels du client)
> + étapes 51 à 54 : le journal comptable devient LA source des stats
> (le module Finances historique est supprimé), espace prestataires
> (rôle PRESTATAIRE), notes de frais des visites, éditeur de texte riche.

## Vue d'ensemble

- **Stack** : Next.js 15 (App Router, TypeScript strict) · PostgreSQL 16 ·
  Drizzle ORM · Tailwind v4 · composants shadcn maison · recharts (graphiques).
- **Volumétrie** : 73 tables · 60 enums · 33 migrations · 45 services ·
  70 pages · 67 permissions · 10 rôles (+ rôles personnalisés dynamiques) ·
  8 jobs cron · 182 tests unitaires · 157 tests d'intégration ·
  98 parcours e2e Playwright.
- **Branche de travail** : `claude/crm-interne-plan-docker-s3neyk`
  (commits « Étape 1 » à « Étape 54 », un commit par étape, gate complet vert
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
ℹ posée sur les valeurs pilotées par un réglage hors page ou dérivées) ·
`src/lib/html/sanitize.ts` (HTML riche nettoyé par liste blanche, appliqué à
l'écriture ET avant tout `dangerouslySetInnerHTML`) +
`src/components/rich-text-editor.tsx` (éditeur contenteditable sans
dépendance, images uniquement par référence `/api/files/…`).

## Cartographie fonctionnelle (navigation → pages → accès)

### Site public — vitrine « 321 Chicken » (étape 45)
| Page | Rôle(s) | Contenu |
|---|---|---|
| `/` (anonyme) | public | Vitrine one-page loufoque « 321 Chicken — la légende du poulet » : 4 chapitres illustrés (images manga générées par IA dans `public/vitrine/`), animations au défilement, bandeau défilant, chiffres loufoques. AUCUNE mention du CRM. Servie par un rewrite du middleware (`src/app/(vitrine)/vitrine/`, l'URL reste `/`). |
| `/connexion` | public (URL non révélée) | Page de connexion du CRM. Le middleware n'y redirige JAMAIS un anonyme (toute URL interne renvoie vers la vitrine) ; on y accède par le lien discret **« La recette secrète »** dans le pied de page de la vitrine, ou en connaissant l'URL. |

> **Administration masquée** : l'ancien préfixe `/admin` est renommé en
> `/hq-18b8ba` (slug aléatoire, étape 45). Seule exception :
> `POST /api/admin/jobs/run` conservé tel quel (répond 401/403 sans session,
> et le cron de prod y fait référence).

### Accueil
| Page | Rôle(s) | Contenu |
|---|---|---|
| `/` (connecté) | tous | Dashboard par rôle : boutique (franchisé), animateur, réseau+régions (siège), espace salarié. `data-testid="dashboard-title"` obligatoire partout. Bloc « Agenda — 30 prochains jours » (`agenda.service.ts` : visites, formations, contrats, factures, plans, jalons, tâches com, congés — filtré par permissions et périmètre ; absent du rôle SALARIE). |
| `/notifications` | tous | Cloche de notifications (dedupeKey anti-doublons). |
| `/mon-espace` | SALARIE (+ADMIN/DIRECTION) | Pointeuse Début/Pause/Reprise/Fin, feuille de temps, demandes de congés. |
| `/mon-compte` | tous | Coordonnées (téléphone), changement d'e-mail et de mot de passe (mdp actuel exigé, autres appareils déconnectés). |

### Réseau
| Page | Permission | Contenu |
|---|---|---|
| `/boutiques` (+fiche à onglets) | `store:read` | Photo (vignette en liste) + carte/lien OpenStreetMap (GPS). Fiche : infos, plateformes, contrats, échanges, comptabilité (pièces du journal de la structure liée), animation, achats, rentabilité (succursales), historique + bandeau ouverture. |
| `/franchises` (+fiche) | `franchisee:read` | Fiche franchisé, docs signés de formation. |
| `/succursales` (+P&L) | `branch:read` (compta+dir) | Rentabilité mensuelle CA − achats DPS − dépenses. |
| `/contrats` | `contract:read` | Contrats + alerte échéance J-180. |
| `/echanges` | `exchange:read` | Échanges franchisés (notes internes invisibles du franchisé). |

### Animation
| Page | Permission | Contenu |
|---|---|---|
| `/animation/visites` (+grille) | `visit:read` (siège) | Audits/visites, grille de critères paramétrable, note % dérivée. Compte rendu en TEXTE RICHE (étape 54 : gras/listes/titres/images par référence `/api/files/…`, HTML nettoyé par liste blanche `src/lib/html/sanitize.ts` à l'écriture ET à la lecture), pièces jointes TITRÉES, notes de frais (titre, prix TTC, justificatifs, note) validées par la direction puis transmises à la file compta. |
| `/animation/plans-action` | `actionplan:read` (siège+franchisé scopé) | Plans « PA-… », machine à états, validation créateur/direction. |
| `/animation/planning` | `planning:read` (siège) | Créneaux animateurs (unique animateur+jour+période), vues jour/semaine/mois (`?vue=`), glisser-déposer vers un autre jour (conflits refusés, animateur notifié si tiers). |
| `/animation/animateurs` | `planning:read` | Fiches animateurs : zone, coût/km, stats km/visites. |
| `/animation/formations` | `training:read` (tous, franchisé scopé) | Formations, REALISEE exige compte rendu, docs REMIS/SIGNE. |

### Communication
| Page | Permission | Contenu |
|---|---|---|
| `/communication` | `commtask:read` | Tâches « COM-… » ; tout rôle dépose une DEMANDE, le demandeur valide. |
| `/partenaires` | `partner:read` (pas franchisé) | Fiches partenaires, notes internes réservées à `partner:write`. |

### Achats & Food Cost
| Page | Permission | Contenu |
|---|---|---|
| `/achats` (+dépôts) | `purchase:read` | Achats DPS, ratio achats/CA (CA = journal comptable classe 7 de la structure liée à la boutique), import CSV. |
| `/foodcost` | `foodcost:read` (siège sauf franchisé) | Ingrédients, tarifs par dépôt à date (dépôt créable à la volée depuis le formulaire de tarif avec `purchase:write`), recettes, synthèse, MENUS (formules produits × qté + emballages/ingrédients directs, coût et % du PV par dépôt), écart matière. |

> **Module Finances supprimé (étape 52)** : les anciennes pages `/finances`
> (factures réseau `F<année>-XXXX`, paiements, relances) et `/ca` (saisie du
> CA par canal) n'existent plus. Le CA et les charges viennent du **journal
> comptable** (classe 7 / classe 6, annulées exclues), rattaché aux boutiques
> par `acctStructures.storeId`. L'import des ventes PRODUITS (nécessaire au
> Food Cost et à l'écart matière) est conservé et déplacé sur
> `/hq-18b8ba/produits` (`revenue:import`).

### Comptabilité (étapes 46-54 — cdc « Transmission comptable & Factures »)
| Page | Permission | Contenu |
|---|---|---|
| `/compta/structures` (+fiche) | `accounting:read` (compta+dir) | Liste des CLIENTS COMPTABLES : référentiel (code 411…, encours, TVA/SIRET, type, actif, lien boutique) + agrégats calculés en base sur la période choisie (nb pièces, CA HT, charges HT, résultat, restant dû TTC, dernière pièce), tri/recherche/filtre impayés, export CSV, import multi-formats **xlsx/xls/xlsb/csv** détecté par signature binaire avec rapport détaillé persistant et fichier original conservé — lecture par VALEUR de cellule (montants « x EUR », dates américaines en serial, lignes de totaux ignorées : étape 50, calée sur les exports réels). Fiche client `/compta/structures/[id]` (étape 51) : infos, agrégats, pièces du journal, création d'un compte PRESTATAIRE (étape 53). |
| `/compta/factures` (+fiche) | `accounting:read` | Journal factures/avoirs : pièce unique, Facture/Avoir signé, Standard/RFA, classe 6 charge / 7 produit (choisie à l'import), échéance, source ; **statut saisi à la main par la compta** (jamais écrasé par un réimport, l'import peut aussi fournir la colonne STATUT — étape 51) ; résultat = Σ HT classe 7 − Σ HT classe 6 (annulées exclues) ; import du journal avec structure inconnue nommée par son code ; documents joints par pièce (étape 51) ; relance par e-mail (modèles de niveau 1-3, SMTP de /hq-18b8ba/emails, destinataire tracé) ; fiche `/compta/factures/[id]` avec discussion interne/prestataire (étape 53). |
| `/compta/notes-de-frais` | `accounting:read` | File des notes de frais VALIDÉES à rembourser (étape 54) — pastille de compteur dans la navigation, marquage « remboursée » (`accounting:write`), historique filtrable par statut. |
| `/prestataire` (+fiche facture) | `provider:portal` (rôle PRESTATAIRE seul) | Espace client comptable externe (étape 53), scopé sur SA structure (`users.acctStructureId`) : ses factures du journal (statut de paiement, SANS notes internes), discussion par facture (notifications croisées avec la compta), dépôt de factures/notes de frais (transmissions vers la compta), tickets de demande au pôle comptabilité. Compte créé depuis la fiche structure (`user:manage`). |
| `/compta/transmissions` (+fiche) | `transmission:create` (tous sauf SALARIE) | Transmissions « TR-… » : Demande ou Facture, cas d'usage (influenceur, ticket, achat succursale, note de frais, quittance, fournisseur…), PJ multiples, historique des statuts, notifications ; hors `transmission:manage` chacun ne voit que LES SIENNES (franchisé : sa boutique uniquement) ; la compta valide/rejette/traite et convertit une Facture validée en pièce du journal (source « Transmission »). Génération de liens externes + suivi (actif/utilisé/expiré/révoqué). |
| `/transmission/[jeton]` | public (lien à usage unique) | Formulaire externe SANS compte : jeton 32 octets stocké haché, expiration ≤ 90 j, usage unique atomique, limitation de débit par IP, fichiers restreints (pdf/images ≤ 10 Mo, 5 max), IP tracée, notification compta ; rien n'entre en comptabilité sans validation manuelle. |

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
| `/direction/cockpit` | `direction:cockpit` (admin+dir) | KPI cliquables assis sur le JOURNAL COMPTABLE (étape 52) : CA classe 7, charges classe 6, résultat mois/année, restant dû ; onglets « Par mois » (évolution), « N vs N-1 » (comparaison mensuelle), « Produits & familles » (ventes produits) ; écart matière M-1, top/flop boutiques. |
| `/direction/finances-cie` | `company-finance:read` (compta+dir) | Flux Big M CIE (12 catégories), réel vs budget, ventilation. |

### Organisation & Administration
| Page | Permission | Contenu |
|---|---|---|
| `/tickets` | `ticket:read` (ou tickets « à moi ») | Tickets inter-pôles, plusieurs pôles destinataires (`extraPoles`) et plusieurs responsables (`ticketAssignees`, premier = principal) — TOUT utilisateur actif est assignable ; un salarié/franchisé assigné accède à SES tickets sans `ticket:read` (liste forcée « les miens »). |
| `/documents` | `document:read` | Bibliothèque versionnée, visibilité par rôle, dossiers de classement (création `document:folder`, délégable). |
| `/hq-18b8ba/utilisateurs` | `user:manage` | Comptes + rôles + « Se connecter en tant que » (ADMIN seul, audité). |
| `/hq-18b8ba/permissions` | `permission:manage` (ADMIN seul) | Matrice des droits modifiable à chaud par rôle (écarts stockés, ADMIN immunisé) + rôles PERSONNALISÉS : base ≠ ADMIN, chaque droit épinglé explicitement (un pin bat matrice et écarts du rôle de base), assignables aux utilisateurs, suppression bloquée tant qu'assignés. |
| `/hq-18b8ba/sauvegardes` | `backup:manage` | Sauvegardes pg_dump : quotidienne 05h30 + manuelle, téléchargement audité, rétention, envoi FTP optionnel. |
| `/hq-18b8ba/emails` | `email:manage` (admin+dir) | Paramètres SMTP (mot de passe chiffré VAULT_KEY), header/signature/footer HTML, e-mail de test, modèles de relance 1-3 avec variables `{{…}}` et aperçu. |
| `/hq-18b8ba/produits` | `product:manage` | Référentiel produits/familles. |
| `/hq-18b8ba/logiciels` | `software:read` (siège) / write dir | Registre des logiciels + personnes autorisées. |
| `/hq-18b8ba/coffre` | `vault:read` (admin+dir SEULS) | Secrets AES-256-GCM, révélation à l'unité auditée REVEAL. |
| `/hq-18b8ba/audit` | `audit:read` | Journal d'audit complet (qui, quoi, avant/après). |

## Rôles (10)

ADMIN et DIRECTION : tout — sauf « se connecter en tant que »
(`user:impersonate`) et la gestion des droits (`permission:manage`), réservés
au SEUL ADMIN. COMPTABILITE : comptabilité (structures, journal, transmissions,
notes de frais), achats, food cost, produits, succursales, Big M CIE.
ANIMATION : visites, plans, planning, formations. COMMUNICATION : tâches com +
partenaires (écriture). RH : dossiers salariés + congés + formations.
DEVELOPPEMENT : boutiques/franchisés/contrats (écriture), ouvertures,
prospection, cessions. FRANCHISE : scopé à SES boutiques (contrats, docs
partagés, plans d'action, achats, formations, demandes com, son projet
d'ouverture). SALARIE : `self:clock` + `self:leave` uniquement (pointeuse +
congés). PRESTATAIRE (étape 53) : `provider:portal` uniquement — espace
`/prestataire` scopé sur sa structure comptable, hors de tout autre module
(la permission est volontairement ABSENTE de la matrice des rôles internes).

Ces droits par défaut sont modifiables À CHAUD par l'admin via
`/hq-18b8ba/permissions` (table `permissionOverrides` : seuls les écarts sont
stockés ; le rôle ADMIN n'est jamais restreint). S'y ajoutent des **rôles
personnalisés** (`customRoles` + `customRolePermissions` : rôle de base +
droits épinglés un à un — un pin l'emporte sur la matrice ET sur les écarts
du rôle de base) et l'**entité FRANCHISEUR** : `users.franchisorMember`
(ADMIN inclus d'office) réserve les dossiers RH/congés/fichiers des salariés
du siège Big M CIE (`employees.storeId` NULL).

## Données (73 tables, par domaine)

- **Socle** : users (franchisorMember, customRoleId, acctStructureId), sessions,
  franchisees, stores, storePlatforms, contracts, documents, documentVersions,
  documentFolders, fileAttachments (title), notifications, auditLogs,
  permissionOverrides, customRoles, customRolePermissions, backups.
- **Échanges & tickets** : exchanges, exchangeMessages, tickets (extraPoles),
  ticketComments, ticketAssignees.
- **E-mails** : emailSettings (SMTP, mot de passe chiffré), emailTemplates
  (modèles de relance par niveau).
- **Ventes produits** (Food Cost / écart matière) : productFamilies, products,
  productSales. *(Les tables invoices/payments/reminders/revenueEntries de
  l'ancien module Finances ont été SUPPRIMÉES à l'étape 52 — le journal
  comptable les remplace.)*
- **Animation** : auditCriteria, storeVisits, auditItems, actionPlans,
  actionPlanComments, animatorProfiles, animatorPlanEntries, trainings,
  trainingParticipants, trainingDocuments, expenseClaims (notes de frais,
  étape 54).
- **Achats & food cost** : depots, dpsPurchases, ingredients, ingredientPrices,
  recipes, recipeItems, menus, menuItems.
- **Communication** : partners, partnerStores, commTasks, commTaskComments.
- **RH** : employees, leaveRequests, clockEntries (index unique partiel « un
  badge ouvert »).
- **Développement** : openingProjects, openingSteps, openingChecklistItems,
  agents, prospects, prospectEvents, premises, resaleListings.
- **Succursales & CIE** : storeExpenses, companyFlows, companyBudgets.
- **Logiciels & coffre** : softwareRegistry, softwareUsers, vaultSecrets.
- **Comptabilité (étapes 46-53)** : acctStructures, acctImports, acctInvoices
  (lastReminderLevel/At), acctInvoiceMessages (discussion compta ↔
  prestataire), transmissions, transmissionEvents, transmissionInvites.

Dérivés jamais stockés : statuts « en retard », note % d'audit, panier moyen,
P&L, ratio achats/CA, coût matière, écart matière, sens des flux CIE.

## Jobs cron (8, Europe/Paris, rejouables via POST /api/admin/jobs/run)

| Heure | Job | Rôle |
|---|---|---|
| 05h30 | db-backup | Sauvegarde pg_dump + rétention + envoi FTP optionnel |
| 06h00 | contract-expiry | Échéances de contrats J-180 |
| 06h25 | action-plan-overdue | Plans d'action en retard |
| 06h40 | audit-overdue | Boutiques sans audit (`AUDIT_MAX_DAYS`) |
| 06h50 | comm-task-overdue | Tâches communication en retard |
| 07h00 | opening-late | Jalons d'ouverture en retard |
| 07h10 | prospect-followup | Relances prospects (quotidien, dedupe/jour) |
| 07h20 | purchase-anomaly | Ratio achats/CA hors bornes ou écart matière (mensuel) |

> Les jobs `invoice-overdue` et `revenue-drop` ont disparu avec le module
> Finances (étape 52) : l'échéance dépassée d'une pièce du journal est un
> statut DÉRIVÉ signalé visuellement, pas une notification.

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
- ✅ **Améliorations post-V1, 3ᵉ vague** — étapes 41 à 43 : saisie du CA en
  tableau multi-canaux · menus Food Cost (formules + emballages, coût par
  dépôt) · e-mails (SMTP chiffré, modèles de relance avec variables,
  header/signature/footer, envoi réel des relances — nodemailer).
- ✅ **Étape 44 — refonte UI/UX** : design system revu sur maquettes client
  (fond gris chaud, cartes blanches très arrondies, boutons/badges pill,
  sidebar claire à pastille active, onglets segmentés, graphiques
  monochromes) — porté par les tokens `globals.css` + composants partagés,
  sans changement de logique.
- ✅ **Étape 45 — vitrine publique + administration masquée** : site vitrine
  one-page « 321 Chicken » servi aux visiteurs non connectés sur `/` (récit
  loufoque en 4 chapitres, images manga IA, animations de défilement) ·
  lien de connexion caché dans le pied de page (« La recette secrète ») ·
  le middleware ne redirige plus jamais vers `/connexion` (les URLs internes
  anonymes ramènent à la vitrine) · `/admin` renommé en `/hq-18b8ba`
  (`/api/admin/jobs/run` conservé).
- ✅ **Module comptabilité** — étapes 46 à 49 (cdc « Transmission comptable
  & Factures ») : référentiel des structures comptables + imports
  xlsx/xls/xlsb/csv par signature binaire avec rapports détaillés · journal
  factures/avoirs classes 6/7 à statut manuel + résultat CA − charges ·
  liste des clients comptables avec agrégats SQL et export · transmissions
  internes (demandes/factures, PJ, historique, conversion en facture) ·
  accès externe par lien sécurisé à usage unique (formulaire public, rate
  limiting, validation stricte, IP tracée) · étape 50 : lecture Excel par
  valeur de cellule, calée et validée sur les exports réels du client.
- ✅ **Améliorations post-V1, 4ᵉ vague** — étapes 51 à 54 : statut des pièces
  à l'import + fiche client comptable + documents joints aux pièces + relance
  par e-mail (51) · le journal comptable devient LA source du CA/charges —
  suppression des modules `/finances` et `/ca`, cockpit refondu (par mois,
  N vs N-1, produits & familles), ratio achats, P&L succursales, dashboards
  et agenda repointés (52) · espace prestataires : rôle PRESTATAIRE scopé sur
  sa structure, factures + discussion + transmissions + tickets compta (53) ·
  notes de frais des visites (validation direction → file
  `/compta/notes-de-frais` avec pastille de compteur → remboursement compta),
  compte rendu de visite en texte riche (sanitizer maison) et pièces jointes
  titrées (54).
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
