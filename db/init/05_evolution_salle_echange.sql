-- =============================================================================
-- CREATURA - Évolution du schéma : salle d'échange en temps réel
-- Contrat : creatura-api.openapi.yaml (`/trades/{tradeId}/live`, schéma `Trade`)
-- Doc     : db/docs/schema.md
--
-- Un échange devient une salle : chaque joueur pose ses cartes sur son tapis
-- (echange_ligne), discute (echange_message) et valide. L'échange est conclu
-- quand les deux joueurs ont validé.
--
-- Ré-exécutable : appliqué à chaque lancement de scripts/appliquer.sh,
-- il ne recrée rien de ce qui existe déjà.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- echange : validations des deux joueurs et carte recherchée
-- -----------------------------------------------------------------------------
ALTER TABLE echange ADD COLUMN IF NOT EXISTS proposeur_pret    boolean NOT NULL DEFAULT false;
ALTER TABLE echange ADD COLUMN IF NOT EXISTS destinataire_pret boolean NOT NULL DEFAULT false;
ALTER TABLE echange ADD COLUMN IF NOT EXISTS creature_cherchee_id integer;

ALTER TABLE echange DROP CONSTRAINT IF EXISTS fk_echange_creature_cherchee;
ALTER TABLE echange ADD  CONSTRAINT fk_echange_creature_cherchee FOREIGN KEY (creature_cherchee_id)
    REFERENCES creature (id) ON DELETE SET NULL;

-- "Échange en cours entre ces deux joueurs ?" (dans un sens ou dans l'autre)
CREATE INDEX IF NOT EXISTS ix_echange_proposeur_destinataire ON echange (proposeur_id, destinataire_id)
    WHERE statut = 'EN_ATTENTE';

COMMENT ON COLUMN echange.proposeur_pret       IS 'Le proposeur a validé les deux tapis tels qu''ils sont';
COMMENT ON COLUMN echange.destinataire_pret    IS 'Le destinataire a validé les deux tapis tels qu''ils sont';
COMMENT ON COLUMN echange.creature_cherchee_id IS 'Carte que le proposeur cherche chez le destinataire (facultatif)';
COMMENT ON TABLE  echange_ligne                IS 'Tapis de la salle d''échange : OFFERT = tapis du proposeur, DEMANDE = tapis du destinataire';

-- -----------------------------------------------------------------------------
-- echange_message : discussion de la salle d'échange
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS echange_message (
    id          uuid          NOT NULL DEFAULT gen_random_uuid(),
    echange_id  uuid          NOT NULL,
    auteur_id   uuid          NOT NULL,
    texte       varchar(500)  NOT NULL,
    envoye_le   timestamptz   NOT NULL DEFAULT now(),

    CONSTRAINT pk_echange_message         PRIMARY KEY (id),
    CONSTRAINT fk_echange_message_echange FOREIGN KEY (echange_id)
        REFERENCES echange (id) ON DELETE CASCADE,
    CONSTRAINT fk_echange_message_auteur  FOREIGN KEY (auteur_id)
        REFERENCES utilisateur (id) ON DELETE RESTRICT,
    CONSTRAINT ck_echange_message_texte   CHECK (btrim(texte) <> '')
);

-- Discussion d'un échange, dans l'ordre d'envoi
CREATE INDEX IF NOT EXISTS ix_echange_message_echange ON echange_message (echange_id, envoye_le);

COMMENT ON TABLE echange_message IS 'Messages de la discussion d''un échange (salle d''échange)';
COMMENT ON COLUMN echange_message.auteur_id IS 'Proposeur ou destinataire de l''échange (vérifié par l''API)';

COMMIT;
