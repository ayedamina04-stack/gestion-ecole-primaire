-- Schéma PostgreSQL (v1 : socle MVP). Montants en centimes (entiers).
CREATE TABLE IF NOT EXISTS annees_scolaires (
  code TEXT PRIMARY KEY CHECK (code ~ '^[0-9]{4}-[0-9]{4}$'),
  debut DATE NOT NULL, fin DATE NOT NULL, active BOOLEAN NOT NULL DEFAULT false
);
CREATE TYPE role_utilisateur AS ENUM ('admin','enseignant','parent','eleve','comptable');
CREATE TABLE utilisateurs (
  id SERIAL PRIMARY KEY, email TEXT NOT NULL UNIQUE, mot_de_passe_hash TEXT NOT NULL,
  role role_utilisateur NOT NULL, nom TEXT NOT NULL, prenom TEXT NOT NULL, telephone TEXT,
  actif BOOLEAN NOT NULL DEFAULT true, cree_le TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE enseignants (id SERIAL PRIMARY KEY, utilisateur_id INT NOT NULL UNIQUE REFERENCES utilisateurs(id));
CREATE TABLE parents (id SERIAL PRIMARY KEY, utilisateur_id INT NOT NULL UNIQUE REFERENCES utilisateurs(id));
CREATE TABLE eleves (
  id SERIAL PRIMARY KEY, utilisateur_id INT UNIQUE REFERENCES utilisateurs(id),
  nom TEXT NOT NULL, prenom TEXT NOT NULL, date_naissance DATE NOT NULL,
  photo_chemin TEXT, adresse TEXT, infos_medicales TEXT,
  annee_entree TEXT REFERENCES annees_scolaires(code), supprime_le TIMESTAMPTZ
);
CREATE TABLE parents_eleves (
  parent_id INT NOT NULL REFERENCES parents(id), eleve_id INT NOT NULL REFERENCES eleves(id),
  lien TEXT NOT NULL DEFAULT 'parent', PRIMARY KEY (parent_id, eleve_id)
);
CREATE TABLE preinscriptions (
  id SERIAL PRIMARY KEY, annee_scolaire TEXT NOT NULL REFERENCES annees_scolaires(code),
  nom_eleve TEXT NOT NULL, prenom_eleve TEXT NOT NULL, date_naissance DATE NOT NULL,
  nom_parent TEXT NOT NULL, email_parent TEXT NOT NULL, telephone_parent TEXT NOT NULL,
  niveau_souhaite TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente','acceptee','refusee')),
  cree_le TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE classes (
  id SERIAL PRIMARY KEY, annee_scolaire TEXT NOT NULL REFERENCES annees_scolaires(code),
  niveau TEXT NOT NULL, section TEXT NOT NULL DEFAULT 'A', capacite INT NOT NULL CHECK (capacite > 0),
  titulaire_id INT REFERENCES enseignants(id), UNIQUE (annee_scolaire, niveau, section)
);
CREATE TABLE affectations_eleves (
  id SERIAL PRIMARY KEY, annee_scolaire TEXT NOT NULL REFERENCES annees_scolaires(code),
  eleve_id INT NOT NULL REFERENCES eleves(id), classe_id INT NOT NULL REFERENCES classes(id),
  UNIQUE (annee_scolaire, eleve_id)
);
CREATE TABLE matieres (
  id SERIAL PRIMARY KEY, nom TEXT NOT NULL, niveau TEXT NOT NULL,
  coefficient NUMERIC(4,2) NOT NULL CHECK (coefficient > 0), UNIQUE (nom, niveau)
);
CREATE TABLE affectations_enseignants (
  id SERIAL PRIMARY KEY, annee_scolaire TEXT NOT NULL REFERENCES annees_scolaires(code),
  enseignant_id INT NOT NULL REFERENCES enseignants(id), matiere_id INT NOT NULL REFERENCES matieres(id),
  classe_id INT NOT NULL REFERENCES classes(id),
  UNIQUE (annee_scolaire, enseignant_id, matiere_id, classe_id)
);
CREATE TABLE evaluations (
  id SERIAL PRIMARY KEY, annee_scolaire TEXT NOT NULL REFERENCES annees_scolaires(code),
  classe_id INT NOT NULL REFERENCES classes(id), matiere_id INT NOT NULL REFERENCES matieres(id),
  type TEXT NOT NULL CHECK (type IN ('controle_continu','examen')),
  trimestre INT NOT NULL CHECK (trimestre BETWEEN 1 AND 3),
  titre TEXT NOT NULL, bareme NUMERIC(5,2) NOT NULL DEFAULT 20, date_eval DATE NOT NULL
);
CREATE TABLE notes (
  id SERIAL PRIMARY KEY, evaluation_id INT NOT NULL REFERENCES evaluations(id),
  eleve_id INT NOT NULL REFERENCES eleves(id), valeur NUMERIC(5,2) NOT NULL CHECK (valeur >= 0),
  saisi_par INT NOT NULL REFERENCES utilisateurs(id), UNIQUE (evaluation_id, eleve_id)
);
CREATE TABLE tarifs (
  id SERIAL PRIMARY KEY, annee_scolaire TEXT NOT NULL REFERENCES annees_scolaires(code),
  libelle TEXT NOT NULL, montant_centimes BIGINT NOT NULL CHECK (montant_centimes >= 0), echeance DATE
);
CREATE TABLE paiements (
  id SERIAL PRIMARY KEY, annee_scolaire TEXT NOT NULL REFERENCES annees_scolaires(code),
  eleve_id INT NOT NULL REFERENCES eleves(id), montant_centimes BIGINT NOT NULL CHECK (montant_centimes > 0),
  mode TEXT NOT NULL CHECK (mode IN ('especes','virement','mobile_money')),
  date_paiement DATE NOT NULL DEFAULT CURRENT_DATE, enregistre_par INT NOT NULL REFERENCES utilisateurs(id),
  annule_le TIMESTAMPTZ, motif_annulation TEXT, recu_chemin TEXT
);
CREATE TABLE conversations (
  id SERIAL PRIMARY KEY, eleve_id INT REFERENCES eleves(id), objet TEXT NOT NULL,
  cree_le TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE messages (
  id SERIAL PRIMARY KEY, conversation_id INT NOT NULL REFERENCES conversations(id),
  expediteur_id INT NOT NULL REFERENCES utilisateurs(id), destinataire_id INT NOT NULL REFERENCES utilisateurs(id),
  contenu TEXT NOT NULL, brouillon BOOLEAN NOT NULL DEFAULT false,
  masque_destinataire BOOLEAN NOT NULL DEFAULT false, envoye_le TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE annonces (
  id SERIAL PRIMARY KEY, auteur_id INT NOT NULL REFERENCES utilisateurs(id),
  audience TEXT NOT NULL CHECK (audience IN ('tous','parents','enseignants')),
  titre TEXT NOT NULL, contenu TEXT NOT NULL, publie_le TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE notifications (
  id SERIAL PRIMARY KEY, utilisateur_id INT NOT NULL REFERENCES utilisateurs(id),
  canal TEXT NOT NULL DEFAULT 'interne', sujet TEXT NOT NULL, corps TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'envoyee', lue BOOLEAN NOT NULL DEFAULT false,
  cree_le TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE journal_audit (
  id BIGSERIAL PRIMARY KEY, utilisateur_id INT REFERENCES utilisateurs(id),
  action TEXT NOT NULL, entite TEXT NOT NULL, entite_id TEXT,
  ancienne_valeur JSONB, nouvelle_valeur JSONB, cree_le TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE FUNCTION interdire_modif() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'Enregistrement immuable'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER annonces_immuables BEFORE UPDATE OR DELETE ON annonces
  FOR EACH ROW EXECUTE FUNCTION interdire_modif();
