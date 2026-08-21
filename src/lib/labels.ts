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

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  CREATE: "Création",
  UPDATE: "Modification",
  DELETE: "Suppression",
  LOGIN: "Connexion",
  LOGIN_FAILED: "Connexion échouée",
  LOGOUT: "Déconnexion",
  DOWNLOAD: "Téléchargement",
  IMPORT: "Import",
};
