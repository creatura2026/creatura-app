-- =============================================================================
-- CREATURA - Évolution du schéma : joueurs et administrateurs dans le dashboard
-- Ticket : AS-71
-- Doc : db/docs/schema.md (section « AS-71 »)
--
-- 1. connexion : une ligne par connexion réussie (POST /auth/login), gardée
--    13 mois. Le renouvellement du jeton ne compte pas.
-- 2. Comptes admin créés depuis le dashboard : créateur, mot de passe
--    provisoire à changer, désactivation par un autre admin.
-- 3. Suppression de joueurs : une demande faite par un admin, que seul l'admin
--    choisi comme validateur peut valider ou refuser. Expire au bout de 7 jours.
-- 4. Un joueur supprimé par les admins disparaît avec tout ce qui n'appartient
--    qu'à lui ; ses échanges terminés restent pour l'autre joueur (sa place
--    devient NULL). À distinguer de la suppression de son compte par le joueur
--    lui-même (09_evolution_gestion_compte.sql) : le compte est alors anonymisé
--    (supprime_le), et ces fonctions l'ignorent.
--
-- Les règles qui touchent plusieurs lignes sont dans des fonctions. Leurs
-- refus portent un nom de contrainte (ck_...), traduit en message par le back
-- comme pour les contraintes des tables (backend/app/errors.py).
--
-- Ré-exécutable : appliqué à chaque lancement de scripts/appliquer.sh.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- utilisateur : comptes admin
-- -----------------------------------------------------------------------------
ALTER TABLE utilisateur ADD COLUMN IF NOT EXISTS cree_par                uuid;
ALTER TABLE utilisateur ADD COLUMN IF NOT EXISTS mot_de_passe_provisoire boolean NOT NULL DEFAULT false;
ALTER TABLE utilisateur ADD COLUMN IF NOT EXISTS desactive_le            timestamptz;
ALTER TABLE utilisateur ADD COLUMN IF NOT EXISTS desactive_par           uuid;

ALTER TABLE utilisateur DROP CONSTRAINT IF EXISTS fk_utilisateur_cree_par;
ALTER TABLE utilisateur ADD  CONSTRAINT fk_utilisateur_cree_par FOREIGN KEY (cree_par)
    REFERENCES utilisateur (id) ON DELETE SET NULL;
ALTER TABLE utilisateur DROP CONSTRAINT IF EXISTS fk_utilisateur_desactive_par;
ALTER TABLE utilisateur ADD  CONSTRAINT fk_utilisateur_desactive_par FOREIGN KEY (desactive_par)
    REFERENCES utilisateur (id) ON DELETE SET NULL;

-- Création par un autre admin, mot de passe provisoire et désactivation : admins seulement
ALTER TABLE utilisateur DROP CONSTRAINT IF EXISTS ck_utilisateur_compte_admin;
ALTER TABLE utilisateur ADD  CONSTRAINT ck_utilisateur_compte_admin
    CHECK (role = 'ADMIN' OR (cree_par IS NULL AND NOT mot_de_passe_provisoire
                              AND desactive_le IS NULL AND desactive_par IS NULL));
-- Un admin ne se désactive pas lui-même ; un auteur suppose une date
ALTER TABLE utilisateur DROP CONSTRAINT IF EXISTS ck_utilisateur_desactivation;
ALTER TABLE utilisateur ADD  CONSTRAINT ck_utilisateur_desactivation
    CHECK (desactive_par <> id AND (desactive_par IS NULL OR desactive_le IS NOT NULL));

COMMENT ON COLUMN utilisateur.cree_par                IS 'Admin qui a créé ce compte admin depuis le dashboard (NULL : premier admin, créé au démarrage du back)';
COMMENT ON COLUMN utilisateur.mot_de_passe_provisoire IS 'Vrai tant que l''admin n''a pas remplacé le mot de passe choisi par son créateur';
COMMENT ON COLUMN utilisateur.desactive_le            IS 'Compte admin désactivé par un autre admin : plus de connexion possible';

-- -----------------------------------------------------------------------------
-- connexion : historique des connexions réussies
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS connexion (
    id              bigint       GENERATED ALWAYS AS IDENTITY,
    utilisateur_id  uuid         NOT NULL,
    le              timestamptz  NOT NULL DEFAULT now(),

    CONSTRAINT pk_connexion             PRIMARY KEY (id),
    CONSTRAINT fk_connexion_utilisateur FOREIGN KEY (utilisateur_id)
        REFERENCES utilisateur (id) ON DELETE CASCADE
);

-- Dernière connexion d'un compte et ses connexions sur une période
CREATE INDEX IF NOT EXISTS ix_connexion_utilisateur_le ON connexion (utilisateur_id, le);
-- Purge des connexions de plus de 13 mois
CREATE INDEX IF NOT EXISTS ix_connexion_le ON connexion (le);

COMMENT ON TABLE  connexion    IS 'Une ligne par connexion réussie (login), gardée 13 mois ; le renouvellement du jeton ne compte pas';
COMMENT ON COLUMN connexion.le IS 'Date et heure de la connexion';

-- Enregistre une connexion et efface celles de plus de 13 mois (tous comptes).
-- 13 mois : on peut comparer un mois avec le même mois de l'année précédente.
CREATE OR REPLACE FUNCTION creatura_enregistrer_connexion(compte uuid) RETURNS void
LANGUAGE sql AS $$
    DELETE FROM connexion WHERE le < now() - interval '13 months';
    INSERT INTO connexion (utilisateur_id) VALUES (compte);
$$;

-- -----------------------------------------------------------------------------
-- echange et echange_message : ce qui reste quand un joueur est supprimé
-- -----------------------------------------------------------------------------
ALTER TABLE echange ALTER COLUMN proposeur_id    DROP NOT NULL;
ALTER TABLE echange ALTER COLUMN destinataire_id DROP NOT NULL;
ALTER TABLE echange DROP CONSTRAINT IF EXISTS fk_echange_proposeur;
ALTER TABLE echange ADD  CONSTRAINT fk_echange_proposeur FOREIGN KEY (proposeur_id)
    REFERENCES utilisateur (id) ON DELETE SET NULL;
ALTER TABLE echange DROP CONSTRAINT IF EXISTS fk_echange_destinataire;
ALTER TABLE echange ADD  CONSTRAINT fk_echange_destinataire FOREIGN KEY (destinataire_id)
    REFERENCES utilisateur (id) ON DELETE SET NULL;
-- Un échange en attente a toujours ses deux joueurs ; un échange terminé en
-- garde au moins un.
ALTER TABLE echange DROP CONSTRAINT IF EXISTS ck_echange_joueurs;
ALTER TABLE echange ADD  CONSTRAINT ck_echange_joueurs
    CHECK (CASE WHEN statut = 'EN_ATTENTE'
                THEN proposeur_id IS NOT NULL AND destinataire_id IS NOT NULL
                ELSE proposeur_id IS NOT NULL OR destinataire_id IS NOT NULL END);

COMMENT ON COLUMN echange.proposeur_id    IS 'NULL : joueur supprimé (échange terminé gardé pour l''autre joueur)';
COMMENT ON COLUMN echange.destinataire_id IS 'NULL : joueur supprimé (échange terminé gardé pour l''autre joueur)';

-- Les messages d'un joueur supprimé partent avec lui
ALTER TABLE echange_message DROP CONSTRAINT IF EXISTS fk_echange_message_auteur;
ALTER TABLE echange_message ADD  CONSTRAINT fk_echange_message_auteur FOREIGN KEY (auteur_id)
    REFERENCES utilisateur (id) ON DELETE CASCADE;

-- -----------------------------------------------------------------------------
-- demande_suppression : suppression de joueurs validée par un deuxième admin
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS demande_suppression (
    id              uuid          NOT NULL DEFAULT gen_random_uuid(),
    demande_par     uuid          NOT NULL,
    valideur_id     uuid          NOT NULL,
    motif           varchar(500),
    statut          varchar(10)   NOT NULL DEFAULT 'EN_ATTENTE',
    nombre_comptes  integer       NOT NULL,
    cree_le         timestamptz   NOT NULL DEFAULT now(),
    traite_le       timestamptz,

    CONSTRAINT pk_demande_suppression          PRIMARY KEY (id),
    CONSTRAINT fk_demande_suppression_demande  FOREIGN KEY (demande_par)
        REFERENCES utilisateur (id) ON DELETE RESTRICT,
    CONSTRAINT fk_demande_suppression_valideur FOREIGN KEY (valideur_id)
        REFERENCES utilisateur (id) ON DELETE RESTRICT,
    CONSTRAINT ck_demande_suppression_statut   CHECK (statut IN ('EN_ATTENTE', 'VALIDEE', 'REFUSEE', 'ANNULEE', 'EXPIREE')),
    CONSTRAINT ck_demande_suppression_valideur CHECK (valideur_id <> demande_par),
    CONSTRAINT ck_demande_suppression_nombre   CHECK (nombre_comptes > 0),
    CONSTRAINT ck_demande_suppression_traite   CHECK ((statut = 'EN_ATTENTE') = (traite_le IS NULL))
);

-- « Les demandes qui m'attendent »
CREATE INDEX IF NOT EXISTS ix_demande_suppression_valideur ON demande_suppression (valideur_id, statut);

COMMENT ON TABLE  demande_suppression                IS 'Demande de suppression de joueurs : faite par un admin, validée ou refusée par l''admin choisi ; sert ensuite de journal';
COMMENT ON COLUMN demande_suppression.nombre_comptes IS 'Joueurs concernés ; reste dans le journal après la suppression';

-- Joueurs d'une demande. Supprimés avec le joueur : le journal ne garde aucune
-- trace des joueurs supprimés, seulement leur nombre.
CREATE TABLE IF NOT EXISTS demande_suppression_joueur (
    demande_id      uuid  NOT NULL,
    utilisateur_id  uuid  NOT NULL,

    CONSTRAINT pk_demande_suppression_joueur          PRIMARY KEY (demande_id, utilisateur_id),
    CONSTRAINT fk_demande_suppression_joueur_demande  FOREIGN KEY (demande_id)
        REFERENCES demande_suppression (id) ON DELETE CASCADE,
    CONSTRAINT fk_demande_suppression_joueur_compte   FOREIGN KEY (utilisateur_id)
        REFERENCES utilisateur (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_demande_suppression_joueur_compte ON demande_suppression_joueur (utilisateur_id);

-- Refus nommé, comme une contrainte de table, pour que le back le traduise
CREATE OR REPLACE FUNCTION creatura_refus(contrainte text, message text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION '%', message USING ERRCODE = 'check_violation', CONSTRAINT = contrainte;
END $$;

-- Demandes en attente depuis plus de 7 jours : expirées, rien n'est supprimé
CREATE OR REPLACE FUNCTION creatura_expirer_demandes() RETURNS integer
LANGUAGE sql AS $$
    WITH expirees AS (
        UPDATE demande_suppression SET statut = 'EXPIREE', traite_le = now()
        WHERE statut = 'EN_ATTENTE' AND cree_le < now() - interval '7 days'
        RETURNING 1
    )
    SELECT count(*)::integer FROM expirees;
$$;

-- Admin actif : existe, rôle ADMIN, ni désactivé ni supprimé par son titulaire (09_…)
CREATE OR REPLACE FUNCTION creatura_admin_actif(compte uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM utilisateur
                   WHERE id = compte AND role = 'ADMIN' AND desactive_le IS NULL AND supprime_le IS NULL);
$$;

-- Nouvelle demande. Renvoie son identifiant.
CREATE OR REPLACE FUNCTION creatura_demander_suppression(
    demandeur uuid, valideur uuid, joueurs uuid[], motif_demande varchar DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
    demande uuid;
    liste   uuid[] := ARRAY(SELECT DISTINCT unnest(joueurs));
BEGIN
    PERFORM creatura_expirer_demandes();

    IF NOT creatura_admin_actif(demandeur) THEN
        PERFORM creatura_refus('ck_demande_suppression_demandeur', 'Seul un administrateur actif peut demander une suppression.');
    END IF;
    IF valideur = demandeur THEN
        PERFORM creatura_refus('ck_demande_suppression_valideur', 'Choisissez un autre administrateur que vous pour valider.');
    END IF;
    IF NOT creatura_admin_actif(valideur) THEN
        PERFORM creatura_refus('ck_demande_suppression_valideur_actif', 'Le validateur doit être un administrateur actif.');
    END IF;
    IF coalesce(array_length(liste, 1), 0) = 0 THEN
        PERFORM creatura_refus('ck_demande_suppression_nombre', 'Choisissez au moins un joueur.');
    END IF;

    -- Verrou sur les joueurs : deux demandes simultanées ne prennent pas le même
    PERFORM 1 FROM utilisateur WHERE id = ANY (liste) ORDER BY id FOR UPDATE;
    IF (SELECT count(*) FROM utilisateur
        WHERE id = ANY (liste) AND role = 'JOUEUR' AND supprime_le IS NULL) <> array_length(liste, 1) THEN
        PERFORM creatura_refus('ck_demande_suppression_joueurs', 'Seuls des comptes joueurs existants peuvent être supprimés.');
    END IF;
    IF EXISTS (SELECT 1 FROM demande_suppression_joueur l
               JOIN demande_suppression d ON d.id = l.demande_id
               WHERE d.statut = 'EN_ATTENTE' AND l.utilisateur_id = ANY (liste)) THEN
        PERFORM creatura_refus('ck_demande_suppression_deja_demandee', 'Un des joueurs fait déjà l''objet d''une demande en attente.');
    END IF;

    INSERT INTO demande_suppression (demande_par, valideur_id, motif, nombre_comptes)
    VALUES (demandeur, valideur, nullif(btrim(motif_demande), ''), array_length(liste, 1))
    RETURNING id INTO demande;
    INSERT INTO demande_suppression_joueur (demande_id, utilisateur_id)
    SELECT demande, unnest(liste);
    RETURN demande;
END $$;

-- -----------------------------------------------------------------------------
-- Suppression d'un joueur (appelée par la validation d'une demande)
--
--   effacés : compte, collection, connexions, boosters ouverts (booster_carte),
--             messages, échanges en attente ;
--   gardés  : échanges terminés, pour l'autre joueur (sa place devient NULL) ;
--             un échange terminé dont l'autre joueur est déjà supprimé est effacé ;
--   stock   : ses légendaires retournent dans le stock de l'édition limitée.
--
-- Renvoie faux si l'identifiant ne correspond à aucun compte joueur.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION creatura_supprimer_joueur(compte uuid) RETURNS boolean
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM 1 FROM utilisateur WHERE id = compte AND role = 'JOUEUR' FOR UPDATE;
    IF NOT FOUND THEN
        RETURN false;
    END IF;

    UPDATE creature c
    SET stock_restant = c.stock_restant + col.quantite
    FROM collection col
    WHERE col.utilisateur_id = compte AND col.creature_id = c.id
      AND c.stock_total IS NOT NULL AND col.quantite > 0;
    DELETE FROM collection WHERE utilisateur_id = compte;

    DELETE FROM echange
    WHERE (proposeur_id = compte OR destinataire_id = compte)
      AND (statut = 'EN_ATTENTE' OR proposeur_id IS NULL OR destinataire_id IS NULL);

    -- connexion, booster_carte, echange_message, demande_suppression_joueur : CASCADE
    -- echange terminé : SET NULL
    DELETE FROM utilisateur WHERE id = compte;
    RETURN true;
END $$;

-- Décision du validateur : valider (suppression immédiate) ou refuser
CREATE OR REPLACE FUNCTION creatura_traiter_demande(demande uuid, admin uuid, valider boolean) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    d demande_suppression%ROWTYPE;
BEGIN
    PERFORM creatura_expirer_demandes();

    SELECT * INTO d FROM demande_suppression WHERE id = demande FOR UPDATE;
    IF NOT FOUND THEN
        PERFORM creatura_refus('ck_demande_suppression_existe', 'Demande introuvable.');
    END IF;
    IF d.valideur_id <> admin OR NOT creatura_admin_actif(admin) THEN
        PERFORM creatura_refus('ck_demande_suppression_valideur_seul', 'Seul l''administrateur choisi peut traiter cette demande.');
    END IF;
    IF d.statut <> 'EN_ATTENTE' THEN
        PERFORM creatura_refus('ck_demande_suppression_en_attente', 'Cette demande a déjà été traitée, annulée ou a expiré.');
    END IF;

    IF valider THEN
        PERFORM creatura_supprimer_joueur(l.utilisateur_id)
        FROM demande_suppression_joueur l WHERE l.demande_id = demande ORDER BY l.utilisateur_id;
    END IF;
    UPDATE demande_suppression
    SET statut = CASE WHEN valider THEN 'VALIDEE' ELSE 'REFUSEE' END, traite_le = now()
    WHERE id = demande;
END $$;

-- Annulation par l'admin qui a fait la demande, tant qu'elle est en attente
CREATE OR REPLACE FUNCTION creatura_annuler_demande(demande uuid, admin uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    d demande_suppression%ROWTYPE;
BEGIN
    PERFORM creatura_expirer_demandes();

    SELECT * INTO d FROM demande_suppression WHERE id = demande FOR UPDATE;
    IF NOT FOUND THEN
        PERFORM creatura_refus('ck_demande_suppression_existe', 'Demande introuvable.');
    END IF;
    IF d.demande_par <> admin THEN
        PERFORM creatura_refus('ck_demande_suppression_demandeur_seul', 'Seul l''administrateur qui a fait la demande peut l''annuler.');
    END IF;
    IF d.statut <> 'EN_ATTENTE' THEN
        PERFORM creatura_refus('ck_demande_suppression_en_attente', 'Cette demande a déjà été traitée, annulée ou a expiré.');
    END IF;

    UPDATE demande_suppression SET statut = 'ANNULEE', traite_le = now() WHERE id = demande;
END $$;

-- -----------------------------------------------------------------------------
-- Désactivation d'un admin par un autre admin
-- Ses demandes en attente (faites ou à valider) sont annulées : un admin
-- désactivé ne pourra plus les traiter. Refusée s'il resterait moins de deux
-- admins actifs.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION creatura_desactiver_admin(cible uuid, admin uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    IF cible = admin THEN
        PERFORM creatura_refus('ck_utilisateur_desactivation', 'Vous ne pouvez pas désactiver votre propre compte.');
    END IF;
    IF NOT creatura_admin_actif(admin) THEN
        PERFORM creatura_refus('ck_desactivation_auteur', 'Seul un administrateur actif peut désactiver un compte.');
    END IF;
    -- Verrou sur tous les admins actifs : deux désactivations simultanées ne
    -- peuvent pas descendre ensemble sous le minimum.
    PERFORM 1 FROM utilisateur
    WHERE role = 'ADMIN' AND desactive_le IS NULL AND supprime_le IS NULL ORDER BY id FOR UPDATE;
    IF NOT creatura_admin_actif(cible) THEN
        PERFORM creatura_refus('ck_desactivation_cible', 'Ce compte n''est pas un administrateur actif.');
    END IF;
    -- Il reste toujours au moins deux admins actifs : une demande de suppression
    -- a besoin d'un demandeur et d'un validateur.
    IF (SELECT count(*) FROM utilisateur
        WHERE role = 'ADMIN' AND desactive_le IS NULL AND supprime_le IS NULL AND id <> cible) < 2 THEN
        PERFORM creatura_refus('ck_desactivation_minimum',
            'Impossible : il doit rester au moins deux administrateurs actifs.');
    END IF;

    UPDATE demande_suppression SET statut = 'ANNULEE', traite_le = now()
    WHERE statut = 'EN_ATTENTE' AND (demande_par = cible OR valideur_id = cible);
    UPDATE utilisateur SET desactive_le = now(), desactive_par = admin WHERE id = cible;
END $$;

COMMIT;
