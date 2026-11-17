-- =============================================================================
-- CREATURA - Évolution du schéma : don de carte entre joueurs
-- Contrat : creatura-api.openapi.yaml (schéma `Gift`, routes `/gifts`)
-- Doc     : db/docs/schema.md
--
-- Un joueur offre une ou plusieurs copies d'une carte qu'il possède à un autre
-- joueur. Le don reste EN_ATTENTE jusqu'à ce que le destinataire l'accepte
-- (les cartes changent alors de collection, tout ou rien) ou le refuse ; le
-- donneur peut l'annuler tant qu'il est en attente. Comme l'échange, le don ne
-- touche pas au stock des créatures (les exemplaires changent seulement de main).
--
-- Les cartes ne sont pas réservées : la possession est revérifiée à l'acceptation
-- (décrément conditionnel côté Postgres). Si une copie a disparu entre-temps, le
-- don passe ECHOUE et rien n'est transféré.
--
-- Ré-exécutable : appliqué à chaque lancement de scripts/appliquer.sh,
-- il ne recrée rien de ce qui existe déjà.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- don : un don d'une carte d'un joueur à un autre, à accepter ou refuser
-- FK en CASCADE : un compte supprimé (admin, 10_…) emporte ses dons ; un compte
-- anonymisé par son titulaire (09_…) garde les siens, revérifiés à l'acceptation.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS don (
    id               uuid         NOT NULL DEFAULT gen_random_uuid(),
    donneur_id       uuid         NOT NULL,
    destinataire_id  uuid         NOT NULL,
    creature_id      integer      NOT NULL,
    quantite         integer      NOT NULL,
    statut           varchar(12)  NOT NULL DEFAULT 'EN_ATTENTE',
    motif_echec      varchar(30),
    cree_le          timestamptz  NOT NULL DEFAULT now(),
    decide_le        timestamptz,

    CONSTRAINT pk_don              PRIMARY KEY (id),
    CONSTRAINT fk_don_donneur      FOREIGN KEY (donneur_id)
        REFERENCES utilisateur (id) ON DELETE CASCADE,
    CONSTRAINT fk_don_destinataire FOREIGN KEY (destinataire_id)
        REFERENCES utilisateur (id) ON DELETE CASCADE,
    CONSTRAINT fk_don_creature     FOREIGN KEY (creature_id)
        REFERENCES creature (id) ON DELETE RESTRICT,
    CONSTRAINT ck_don_statut       CHECK (statut IN ('EN_ATTENTE', 'ACCEPTE', 'REFUSE', 'ANNULE', 'ECHOUE')),
    CONSTRAINT ck_don_participants  CHECK (donneur_id <> destinataire_id),
    CONSTRAINT ck_don_quantite     CHECK (quantite > 0),
    -- decide_le est vide tant que le don est en attente, rempli ensuite
    CONSTRAINT ck_don_decision     CHECK ((statut = 'EN_ATTENTE') = (decide_le IS NULL))
);

-- Un seul don de la même carte en attente de ce donneur vers ce destinataire
CREATE UNIQUE INDEX IF NOT EXISTS uq_don_en_attente
    ON don (donneur_id, destinataire_id, creature_id)
    WHERE statut = 'EN_ATTENTE';

-- « Mes dons reçus / envoyés », du plus récent au plus ancien
CREATE INDEX IF NOT EXISTS ix_don_destinataire ON don (destinataire_id, cree_le DESC);
CREATE INDEX IF NOT EXISTS ix_don_donneur       ON don (donneur_id, cree_le DESC);

COMMENT ON TABLE  don                 IS 'Don d''une carte d''un joueur à un autre, accepté ou refusé par le destinataire';
COMMENT ON COLUMN don.quantite        IS 'Nombre d''exemplaires offerts (tous transférés à l''acceptation, ou aucun)';
COMMENT ON COLUMN don.motif_echec     IS 'Raison quand le statut vaut ECHOUE (ex. carte devenue indisponible)';

COMMIT;
