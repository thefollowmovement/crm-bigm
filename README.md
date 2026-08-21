# CRM Big M

CRM / ERP interne du réseau de franchise Big M : fiche boutique unique, contrats
et alertes d'échéance, échanges franchisés tracés, factures / redevances /
relances, chiffre d'affaires par canal, tickets inter-pôles, bibliothèque
documentaire versionnée — avec droits par rôle et traçabilité complète.

**Stack** : Next.js 15 (App Router, TypeScript) · PostgreSQL 16 · Drizzle ORM ·
Tailwind CSS · Docker + Caddy (HTTPS automatique).

---

## Déploiement sur un VPS (production)

Prérequis : un VPS Linux avec Docker + le plugin compose, et un nom de domaine
pointant vers l'IP du VPS (enregistrement A).

```bash
# 1. Récupérer le projet
git clone https://github.com/thefollowmovement/crm-bigm.git /opt/crm-bigm
cd /opt/crm-bigm

# 2. Configurer l'environnement
cp .env.example .env
nano .env
#   → POSTGRES_PASSWORD : un mot de passe fort
#   → APP_DOMAIN        : votre domaine (ex. crm.bigm.fr)
#   → SESSION_SECRET    : openssl rand -hex 32
#   → SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD : votre compte administrateur

# 3. Construire et démarrer
docker compose -f docker-compose.prod.yml up -d --build

# 4. Vérifier
docker compose -f docker-compose.prod.yml ps        # tous les services "healthy"
docker compose -f docker-compose.prod.yml logs app  # migrations + admin créés
```

Ouvrez ensuite `https://votre-domaine` et connectez-vous avec le compte
administrateur du `.env`. **Changez ce mot de passe** après la première
connexion (Administration → Utilisateurs), puis créez les comptes de l'équipe.

Au démarrage, le conteneur applique automatiquement les migrations de base de
données et crée le compte admin si la base est vide — une mise à jour se déploie
donc simplement :

```bash
git pull && docker compose -f docker-compose.prod.yml up -d --build
```

### Sauvegardes

`./scripts/backup.sh` sauvegarde la base **et** les fichiers uploadés de façon
cohérente (rotation 30 jours). À planifier dans le cron du VPS :

```
0 3 * * * /opt/crm-bigm/scripts/backup.sh /opt/backups-crm >> /var/log/crm-backup.log 2>&1
```

### Données persistantes

| Volume Docker  | Contenu                                    |
| -------------- | ------------------------------------------ |
| `pg_data`      | Base PostgreSQL                            |
| `uploads_data` | Fichiers uploadés (contrats, PJ, imports)  |
| `caddy_data`   | Certificats TLS Let's Encrypt              |

---

## Développement local

```bash
npm install
docker compose up -d db        # Postgres de dev sur 5432
node scripts/db.mjs migrate    # applique les migrations
SEED_DEMO=true npm run db:seed # admin + jeu de démonstration
npm run dev                    # http://localhost:3000
```

Comptes de démonstration (`SEED_DEMO=true`) : `admin@bigm.fr` (mot de passe du
`.env`), puis `direction@`, `compta@`, `animateur@`, `communication@`, `rh@`,
`developpement@`, `franchise@bigm.fr` — mot de passe commun `Test1234!`.

### Qualité : les « gates »

Chaque étape de développement doit passer le gate avant validation :

```bash
npm run gate       # lint → typecheck → tests unit → tests intégration → build
npm run gate:full  # gate + tests e2e Playwright
```

- **Unit** (`tests/unit`) : logique pure (permissions, diff d'audit, parseur CSV, dates, montants).
- **Intégration** (`tests/integration`) : services contre un Postgres réel
  éphémère (Docker, ou repli Postgres local automatique).
- **E2E** (`e2e/`) : parcours complets dans Chromium contre l'app buildée et une
  base seedée.

Sans Docker (CI restreinte), les scripts basculent automatiquement sur un
Postgres local (`scripts/local-pg.sh`).

### Architecture

Voir `CLAUDE.md` pour les règles détaillées. En résumé :

- `src/db/schema.ts` — schéma Drizzle (19 tables) ; migrations SQL générées par
  `npm run db:generate`, appliquées par `node scripts/db.mjs migrate` (aussi au
  boot du conteneur).
- `src/services/*.service.ts` — logique métier, seul endroit qui écrit en base,
  via les helpers audités (`src/lib/db/audited.ts`) : chaque écriture trace
  qui / quand / anciennes / nouvelles valeurs dans le journal d'audit.
- `src/lib/authz/permissions.ts` — matrice unique des permissions par rôle ;
  le rôle Franchisé est de plus restreint à ses boutiques et ne reçoit jamais
  les champs internes (`field-visibility.ts`).
- `src/lib/jobs/` — tâches planifiées idempotentes (alerte fin de contrat,
  retards de paiement), cron in-app à 06h00/06h15 Europe/Paris, déclenchables
  manuellement via `POST /api/admin/jobs/run`.
- Fichiers uploadés servis uniquement par `/api/files/[id]` (session +
  permission de l'entité parente), stockés sous `/data/uploads`.
