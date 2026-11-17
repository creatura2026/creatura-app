-- =============================================================================
-- CREATURA - Évolution du schéma : lien de réinitialisation du mot de passe
-- Ticket : AS-75
-- Doc : db/docs/schema.md
--
-- Depuis la fiche d'un joueur, un admin génère un lien qu'il copie et envoie au
-- joueur. Le lien vaut 5 minutes et ne sert qu'une fois ; en générer un nouveau
-- annule le précédent. La base ne garde que l'empreinte SHA-256 du jeton, jamais
-- le jeton lui-même : lire la table ne permet pas de reconstituer un lien.
--
-- Ré-exécutable : appliqué à chaque lancement de scripts/appliquer.sh.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS reinitialisation_mdp (
    id              bigint       GENERATED ALWAYS AS IDENTITY,
    utilisateur_id  uuid         NOT NULL,
    jeton_hash      char(64)     NOT NULL,
    cree_par        uuid,
    cree_le         timestamptz  NOT NULL DEFAULT now(),
    expire_le       timestamptz  NOT NULL DEFAULT now() + interval '5 minutes',
    utilise_le      timestamptz,
    annule_le       timestamptz,

    CONSTRAINT pk_reinitialisation_mdp             PRIMARY KEY (id),
    CONSTRAINT uq_reinitialisation_mdp_jeton       UNIQUE (jeton_hash),
    CONSTRAINT fk_reinitialisation_mdp_utilisateur FOREIGN KEY (utilisateur_id)
        REFERENCES utilisateur (id) ON DELETE CASCADE,
    CONSTRAINT fk_reinitialisation_mdp_cree_par    FOREIGN KEY (cree_par)
        REFERENCES utilisateur (id) ON DELETE SET NULL,
    -- Empreinte SHA-256 en hexadécimal
    CONSTRAINT ck_reinitialisation_mdp_hash        CHECK (jeton_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_reinitialisation_mdp_expiration  CHECK (expire_le > cree_le),
    -- Un lien est utilisé ou annulé, jamais les deux
    CONSTRAINT ck_reinitialisation_mdp_fin         CHECK (utilise_le IS NULL OR annule_le IS NULL)
);

-- Un seul lien en cours par joueur (ni utilisé ni annulé) : en générer un
-- nouveau oblige à annuler le précédent, même si deux admins cliquent en même temps.
CREATE UNIQUE INDEX IF NOT EXISTS uq_reinitialisation_mdp_en_cours
    ON reinitialisation_mdp (utilisateur_id) WHERE utilise_le IS NULL AND annule_le IS NULL;

COMMENT ON TABLE  reinitialisation_mdp            IS 'Liens de réinitialisation du mot de passe générés par un admin (AS-75) : 5 minutes, usage unique';
COMMENT ON COLUMN reinitialisation_mdp.jeton_hash IS 'Empreinte SHA-256 (hexadécimal) du jeton du lien ; le jeton lui-même n''est jamais stocké';
COMMENT ON COLUMN reinitialisation_mdp.cree_par   IS 'Admin qui a généré le lien';
COMMENT ON COLUMN reinitialisation_mdp.annule_le  IS 'Remplacé par un lien plus récent avant d''avoir servi';

COMMIT;
