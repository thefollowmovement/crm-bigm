// Libellés français des énumérations — source unique pour toute l'UI.

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrateur",
  DIRECTION: "Direction",
  COMPTABILITE: "Comptabilité",
  RH: "Ressources humaines",
  ANIMATION: "Animation réseau",
  COMMUNICATION: "Communication",
  DEVELOPPEMENT: "Développement",
  FRANCHISE: "Franchisé",
  SALARIE: "Salarié",
};

export const POLE_LABELS: Record<string, string> = {
  DIRECTION: "Direction",
  COMPTABILITE: "Comptabilité",
  RH: "Ressources humaines",
  ANIMATION: "Animation réseau",
  COMMUNICATION: "Communication",
  DEVELOPPEMENT: "Développement",
};

export const STORE_TYPE_LABELS: Record<string, string> = {
  FRANCHISE: "Franchise",
  SUCCURSALE: "Succursale",
};

export const STORE_STATUS_LABELS: Record<string, string> = {
  EN_PROJET: "En projet",
  OUVERTE: "Ouverte",
  FERMEE_TEMPORAIREMENT: "Fermée temporairement",
  FERMEE: "Fermée",
};

export const PLATFORM_LABELS: Record<string, string> = {
  UBER_EATS: "Uber Eats",
  DELIVEROO: "Deliveroo",
  JUST_EAT: "Just Eat",
  AUTRE: "Autre",
};

export const CONTRACT_TYPE_LABELS: Record<string, string> = {
  CONTRAT_FRANCHISE: "Contrat de franchise",
  DIP: "DIP",
  AVENANT: "Avenant",
  BAIL: "Bail",
  AUTRE: "Autre",
};

export const CONTRACT_STATUS_LABELS: Record<string, string> = {
  BROUILLON: "Brouillon",
  ACTIF: "Actif",
  EXPIRE: "Expiré",
  RESILIE: "Résilié",
  RENOUVELE: "Renouvelé",
};

export const DOCUMENT_CATEGORY_LABELS: Record<string, string> = {
  JURIDIQUE: "Juridique",
  PROCEDURE: "Procédure",
  RH: "RH",
  COMPTABILITE: "Comptabilité",
  COMMUNICATION: "Communication",
  FORMATION: "Formation",
  MARKETING: "Marketing",
  AUTRE: "Autre",
};

export const EXCHANGE_TYPE_LABELS: Record<string, string> = {
  DEMANDE: "Demande",
  LITIGE: "Litige",
  DECISION: "Décision",
  INFORMATION: "Information",
};

export const EXCHANGE_STATUS_LABELS: Record<string, string> = {
  OUVERT: "Ouvert",
  EN_COURS: "En cours",
  RESOLU: "Résolu",
  CLOS: "Clos",
};

export const REVENUE_CHANNEL_LABELS: Record<string, string> = {
  SUR_PLACE: "Sur place",
  EMPORTE: "À emporter",
  TABLETTE: "Tablette Big M",
  UBER_EATS: "Uber Eats",
  DELIVEROO: "Deliveroo",
  AUTRE: "Autre",
};

export const INVOICE_TYPE_LABELS: Record<string, string> = {
  DROIT_ENTREE: "Droit d'entrée",
  REDEVANCE: "Redevance",
  REDEVANCE_COMMUNICATION: "Redevance communication",
  AUTRE: "Autre",
};

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  EMISE: "Émise",
  PARTIELLEMENT_PAYEE: "Partiellement payée",
  PAYEE: "Payée",
  ANNULEE: "Annulée",
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  VIREMENT: "Virement",
  PRELEVEMENT: "Prélèvement",
  CHEQUE: "Chèque",
  CB: "Carte bancaire",
  ESPECES: "Espèces",
  AUTRE: "Autre",
};

export const REMINDER_CHANNEL_LABELS: Record<string, string> = {
  EMAIL: "E-mail",
  TELEPHONE: "Téléphone",
  COURRIER: "Courrier",
  LRAR: "LRAR",
  AUTRE: "Autre",
};

export const TICKET_STATUS_LABELS: Record<string, string> = {
  NOUVEAU: "Nouveau",
  AFFECTE: "Affecté",
  EN_COURS: "En cours",
  EN_ATTENTE: "En attente",
  TERMINE: "Terminé",
  VALIDE: "Validé",
};

export const TICKET_PRIORITY_LABELS: Record<string, string> = {
  BASSE: "Basse",
  NORMALE: "Normale",
  HAUTE: "Haute",
  CRITIQUE: "Critique",
};

export const VISIT_TYPE_LABELS: Record<string, string> = {
  AUDIT: "Audit",
  VISITE_COURTOISIE: "Visite de courtoisie",
  OUVERTURE: "Ouverture",
  FORMATION: "Formation",
  NOUVEAU_PRODUIT: "Nouveau produit",
  INTERVENTION: "Intervention",
};

export const VISIT_STATUS_LABELS: Record<string, string> = {
  BROUILLON: "Brouillon",
  FINALISEE: "Finalisée",
};

export const ACTION_PLAN_STATUS_LABELS: Record<string, string> = {
  A_FAIRE: "À faire",
  EN_COURS: "En cours",
  TERMINE: "Terminé",
  VALIDE: "Validé",
  ANNULE: "Annulé",
};

export const COMM_TASK_TYPE_LABELS: Record<string, string> = {
  DEMANDE: "Demande boutique",
  CREATION: "Création graphique",
  CAMPAGNE: "Campagne",
  VIDEO: "Vidéo",
  RESEAUX_SOCIAUX: "Réseaux sociaux",
  ADS: "Publicité (Ads)",
  AUTRE: "Autre",
};

export const TRAINING_TYPE_LABELS: Record<string, string> = {
  INITIALE: "Formation initiale",
  CONTINUE: "Formation continue",
  OUVERTURE: "Ouverture",
  NOUVEAU_PRODUIT: "Nouveau produit",
  HYGIENE: "Hygiène",
  AUTRE: "Autre",
};

export const TRAINING_STATUS_LABELS: Record<string, string> = {
  PLANIFIEE: "Planifiée",
  REALISEE: "Réalisée",
  VALIDEE: "Validée",
  ANNULEE: "Annulée",
};

export const TRAINING_DOC_KIND_LABELS: Record<string, string> = {
  REMIS: "Document remis",
  SIGNE: "Document signé",
};

export const PLAN_PERIOD_LABELS: Record<string, string> = {
  MATIN: "Matin",
  APRES_MIDI: "Après-midi",
  JOURNEE: "Journée",
};

export const PLAN_ACTIVITY_LABELS: Record<string, string> = {
  VISITE: "Visite",
  AUDIT: "Audit",
  FORMATION: "Formation",
  OUVERTURE: "Ouverture",
  REUNION: "Réunion",
  TRAJET: "Trajet",
  AUTRE: "Autre",
};

export const EMPLOYEE_CONTRACT_TYPE_LABELS: Record<string, string> = {
  CDI: "CDI",
  CDD: "CDD",
  APPRENTISSAGE: "Apprentissage",
  STAGE: "Stage",
  EXTRA: "Extra",
};

export const LEAVE_TYPE_LABELS: Record<string, string> = {
  CONGES_PAYES: "Congés payés",
  SANS_SOLDE: "Sans solde",
  MALADIE: "Maladie",
  FAMILIAL: "Événement familial",
  AUTRE: "Autre",
};

export const LEAVE_STATUS_LABELS: Record<string, string> = {
  DEMANDEE: "Demandée",
  VALIDEE: "Validée",
  REFUSEE: "Refusée",
  ANNULEE: "Annulée",
};

export const OPENING_STEP_TYPE_LABELS: Record<string, string> = {
  DIP: "Remise du DIP",
  CONTRAT: "Signature du contrat",
  TRAVAUX: "Travaux & aménagement",
  FORMATION: "Formation initiale",
  COMMANDES: "Commandes fournisseurs",
  INSTALLATION: "Installation & tests",
  OUVERTURE: "Ouverture",
  SUIVI_J30: "Suivi J+30",
};

export const OPENING_STEP_STATUS_LABELS: Record<string, string> = {
  A_VENIR: "À venir",
  EN_COURS: "En cours",
  TERMINEE: "Terminée",
  BLOQUEE: "Bloquée",
};

export const OPENING_PROJECT_STATUS_LABELS: Record<string, string> = {
  EN_COURS: "En cours",
  TERMINE: "Terminé",
  ABANDONNE: "Abandonné",
};

export const CHECKLIST_STATUS_LABELS: Record<string, string> = {
  A_FAIRE: "À faire",
  EN_ATTENTE: "En attente",
  BLOQUE: "Bloqué",
  TERMINE: "Terminé",
};

export const PROSPECT_STATUS_LABELS: Record<string, string> = {
  NOUVEAU: "Nouveau",
  CONTACTE: "Contacté",
  QUALIFIE: "Qualifié",
  RDV: "RDV réalisé",
  DIP: "DIP remis",
  RECHERCHE_LOCAL: "Recherche de local",
  CONTRAT: "Contrat signé",
  OUVERTURE: "Ouverture",
  ABANDONNE: "Abandonné",
};

export const INTEREST_LEVEL_LABELS: Record<string, string> = {
  FAIBLE: "Faible",
  MOYEN: "Moyen",
  FORT: "Fort",
};

export const PROSPECT_EVENT_TYPE_LABELS: Record<string, string> = {
  APPEL: "Appel",
  EMAIL: "E-mail",
  RDV: "Rendez-vous",
  COURRIER: "Courrier",
  STATUT: "Changement de statut",
  NOTE: "Note",
};

export const PREMISES_STATUS_LABELS: Record<string, string> = {
  DISPONIBLE: "Disponible",
  EN_NEGOCIATION: "En négociation",
  RETENU: "Retenu",
  ECARTE: "Écarté",
};

export const RESALE_WISH_LABELS: Record<string, string> = {
  VENTE_TOTALE: "Vente totale",
  VENTE_PARTIELLE: "Vente partielle",
  RECHERCHE_ASSOCIE: "Recherche d'associé",
};

export const RESALE_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  SUSPENDUE: "Suspendue",
  CONCLUE: "Conclue",
  ANNULEE: "Annulée",
};

export const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  LOYER: "Loyer",
  SALAIRES: "Salaires",
  CHARGES_SOCIALES: "Charges sociales",
  FOURNISSEURS: "Fournisseurs",
  ENERGIE: "Énergie",
  MAINTENANCE: "Maintenance",
  BANQUE: "Frais bancaires",
  IMPOTS: "Impôts & taxes",
  AUTRE: "Autre",
};

export const COMPANY_FLOW_CATEGORY_LABELS: Record<string, string> = {
  DROIT_ENTREE: "Droits d'entrée",
  REDEVANCE: "Redevances",
  REDEVANCE_COMMUNICATION: "Redevances communication",
  PRESTATION: "Prestations & formations",
  AUTRE_ENTREE: "Autres facturations",
  PARTENAIRES: "Partenaires",
  COMMUNICATION: "Communication",
  SALAIRES: "Salariés",
  LOGICIELS: "Logiciels",
  PRESTATAIRES: "Prestataires",
  FRAIS_GENERAUX: "Frais généraux",
  AUTRE_SORTIE: "Autres dépenses",
};

// Libellés des permissions pour /admin/permissions (étape 30), dans l'ordre
// d'ALL_PERMISSIONS (groupées par domaine).
export const PERMISSION_LABELS: Record<string, string> = {
  "store:read": "Boutiques — consulter",
  "store:write": "Boutiques — modifier",
  "store:read_internal_notes": "Boutiques — notes internes",
  "franchisee:read": "Franchisés — consulter",
  "franchisee:write": "Franchisés — modifier",
  "contract:read": "Contrats — consulter",
  "contract:write": "Contrats — modifier",
  "document:read": "Documents — consulter",
  "document:write": "Documents — publier",
  "document:folder": "Documents — gérer les dossiers",
  "exchange:read": "Échanges franchisés — consulter",
  "exchange:write": "Échanges franchisés — participer",
  "finance:read": "Factures & impayés — consulter",
  "finance:write": "Factures & impayés — gérer",
  "revenue:read": "Chiffre d'affaires — consulter",
  "revenue:write": "Chiffre d'affaires — saisir",
  "revenue:import": "Chiffre d'affaires — importer (CSV)",
  "product:manage": "Référentiel produits — gérer",
  "ticket:read": "Tickets — consulter",
  "ticket:write": "Tickets — créer & traiter",
  "visit:read": "Visites & audits — consulter",
  "visit:write": "Visites & audits — réaliser",
  "actionplan:read": "Plans d'action — consulter",
  "actionplan:write": "Plans d'action — gérer",
  "planning:read": "Planning animateurs — consulter",
  "planning:write": "Planning animateurs — modifier",
  "purchase:read": "Achats DPS — consulter",
  "purchase:write": "Achats DPS — saisir",
  "purchase:import": "Achats DPS — importer (CSV)",
  "foodcost:read": "Food Cost — consulter",
  "foodcost:write": "Food Cost — gérer",
  "training:read": "Formations — consulter",
  "training:write": "Formations — gérer",
  "commtask:read": "Tâches communication — consulter",
  "commtask:write": "Tâches communication — traiter",
  "commtask:request": "Tâches communication — demander",
  "partner:read": "Partenaires — consulter",
  "partner:write": "Partenaires — gérer",
  "hr:read": "Dossiers RH — consulter",
  "hr:write": "Dossiers RH — gérer",
  "self:clock": "Mon espace — pointeuse",
  "self:leave": "Mon espace — congés",
  "opening:read": "Ouvertures — consulter",
  "opening:write": "Ouvertures — piloter",
  "opening:checklist": "Ouvertures — checklist de son pôle",
  "development:read": "Prospection — consulter",
  "development:write": "Prospection — gérer",
  "resale:read": "Cessions — consulter",
  "resale:write": "Cessions — gérer",
  "branch:read": "Succursales — rentabilité",
  "branch:write": "Succursales — dépenses",
  "company-finance:read": "Finances Big M CIE — consulter",
  "company-finance:write": "Finances Big M CIE — gérer",
  "direction:cockpit": "Cockpit direction",
  "software:read": "Registre logiciels — consulter",
  "software:write": "Registre logiciels — gérer",
  "vault:read": "Coffre-fort — consulter",
  "vault:write": "Coffre-fort — gérer",
  "user:manage": "Utilisateurs — administrer",
  "user:impersonate": "Se connecter en tant que",
  "permission:manage": "Droits d'accès — administrer",
  "backup:manage": "Sauvegardes de la base — gérer",
  "email:manage": "E-mails — SMTP & modèles de relance",
  "audit:read": "Journal d'audit — consulter",
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  CREATE: "Création",
  UPDATE: "Modification",
  DELETE: "Suppression",
  LOGIN: "Connexion",
  LOGIN_FAILED: "Connexion échouée",
  LOGOUT: "Déconnexion",
  DOWNLOAD: "Téléchargement",
  IMPORT: "Import",
  REVEAL: "Révélation de secret",
  IMPERSONATE: "Connexion en tant que",
};
