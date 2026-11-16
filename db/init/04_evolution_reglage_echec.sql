-- =============================================================================
-- CREATURA - Évolution du schéma : réglage des boosters et échanges échoués
-- Contrat : creatura-api.openapi.yaml (`/admin/settings/booster`, statut FAILED)
-- Doc     : db/docs/schema.md
--
-- 01_schema.sql ne se modifie plus : ce fichier le complète.
-- Ré-exécutable : appliqué à chaque lancement de scripts/appliquer.sh,
-- il ne recrée rien de ce qui existe déjà.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- reglage : réglages du jeu modifiables par un administrateur (une seule ligne)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reglage (
    id                  smallint     NOT NULL DEFAULT 1,
    cartes_par_booster  integer      NOT NULL DEFAULT 5,
    modifie_le          timestamptz,
    modifie_par         uuid,

    CONSTRAINT pk_reglage                    PRIMARY KEY (id),
    -- Une seule ligne : les réglages sont globaux
    CONSTRAINT ck_reglage_ligne_unique       CHECK (id = 1),
    CONSTRAINT ck_reglage_cartes_par_booster CHECK (cartes_par_booster BETWEEN 1 AND 10),
    CONSTRAINT fk_reglage_modifie_par        FOREIGN KEY (modifie_par)
        REFERENCES utilisateur (id) ON DELETE SET NULL,
    -- Un auteur implique une date (l'auteur seul redevient NULL si son compte est supprimé)
    CONSTRAINT ck_reglage_modification       CHECK (modifie_par IS NULL OR modifie_le IS NOT NULL)
);

INSERT INTO reglage (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE  reglage                    IS 'Réglages du jeu (une seule ligne, id = 1)';
COMMENT ON COLUMN reglage.cartes_par_booster IS 'Cartes tirées par booster ; s''applique aux boosters ouverts après la modification';
COMMENT ON COLUMN reglage.modifie_par        IS 'Administrateur auteur de la dernière modification (NULL si compte supprimé)';

-- -----------------------------------------------------------------------------
-- echange : statut ECHOUE (acceptation impossible, une carte n'était plus là)
-- -----------------------------------------------------------------------------
ALTER TABLE echange ADD COLUMN IF NOT EXISTS motif_echec varchar(30);

ALTER TABLE echange DROP CONSTRAINT IF EXISTS ck_echange_statut;
ALTER TABLE echange ADD  CONSTRAINT ck_echange_statut
    CHECK (statut IN ('EN_ATTENTE', 'ACCEPTE', 'REFUSE', 'ANNULE', 'ECHOUE'));

-- Le motif est rempli pour un échange échoué, et seulement pour lui
ALTER TABLE echange DROP CONSTRAINT IF EXISTS ck_echange_motif_echec;
ALTER TABLE echange ADD  CONSTRAINT ck_echange_motif_echec
    CHECK ((statut = 'ECHOUE') = (motif_echec IS NOT NULL));

COMMENT ON COLUMN echange.motif_echec IS 'Code de l''échec quand statut = ECHOUE (ex. CARDS_UNAVAILABLE)';

COMMIT;
