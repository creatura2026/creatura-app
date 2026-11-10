-- =============================================================================
-- CREATURA - Tests du schéma (AS-40)
-- Vérifie que chaque contrainte accepte les bonnes données et bloque les
-- mauvaises AVEC LE BON NOM de contrainte (celui que le back traduira).
--
-- Lancement : psql -v ON_ERROR_STOP=1 -d creatura -f db/tests/test_schema.sql
-- Tout se passe dans une transaction annulée à la fin : la base n'est pas
-- modifiée. Le script s'arrête avec une erreur au premier test qui échoue.
-- =============================================================================

\set QUIET on
\o /dev/null
BEGIN;

-- Outil de test : exécute une requête qui DOIT échouer sur une contrainte
-- précise. Si elle passe, ou échoue sur une autre contrainte : test KO.
CREATE FUNCTION pg_temp.doit_echouer(test text, requete text, contrainte_attendue text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    contrainte_recue text;
BEGIN
    BEGIN
        EXECUTE requete;
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS contrainte_recue = CONSTRAINT_NAME;
        IF contrainte_recue = contrainte_attendue THEN
            RAISE NOTICE 'OK  %', test;
            RETURN;
        END IF;
        RAISE EXCEPTION 'KO  % : contrainte attendue %, reçue % (%)',
            test, contrainte_attendue, coalesce(contrainte_recue, 'aucune'), SQLERRM;
    END;
    RAISE EXCEPTION 'KO  % : la requête aurait dû être refusée', test;
END $$;

-- ---------------------------------------------------------------------------
-- Données valides : doivent passer
-- ---------------------------------------------------------------------------
INSERT INTO utilisateur (id, pseudo, identifiant, mot_de_passe_hash)
VALUES ('00000000-0000-0000-0000-00000000000a', 'Alice', 'alice', 'hash'),
       ('00000000-0000-0000-0000-00000000000b', 'Bob',   'bob',   'hash');
INSERT INTO utilisateur (pseudo, identifiant, mot_de_passe_hash, role)
VALUES ('Admin', 'admin', 'hash', 'ADMIN');

INSERT INTO creature (nom, famille, rarete, poids, image, stock_total, stock_restant)
VALUES ('Moussou', 'NATURE', 'COMMUN', 60, 'images/moussou.png', 100, 100),
       ('Brumel',  'BRUME',  'RARE',   10, 'images/brumel.png',   10,  10);

INSERT INTO collection (utilisateur_id, creature_id, quantite)
SELECT '00000000-0000-0000-0000-00000000000a', id, 2 FROM creature WHERE nom = 'Moussou';

INSERT INTO echange (id, proposeur_id, destinataire_id)
VALUES ('00000000-0000-0000-0000-0000000000e1',
        '00000000-0000-0000-0000-00000000000a',
        '00000000-0000-0000-0000-00000000000b');
INSERT INTO echange_ligne (echange_id, creature_id, sens, quantite)
SELECT '00000000-0000-0000-0000-0000000000e1'::uuid, id, 'OFFERT', 1 FROM creature WHERE nom = 'Moussou'
UNION ALL
SELECT '00000000-0000-0000-0000-0000000000e1'::uuid, id, 'DEMANDE', 1 FROM creature WHERE nom = 'Brumel';

DO $$ BEGIN RAISE NOTICE 'OK  insertion de données valides'; END $$;

-- Valeurs par défaut
DO $$ BEGIN
    ASSERT (SELECT role FROM utilisateur WHERE identifiant = 'alice') = 'JOUEUR',
        'KO  rôle par défaut';
    ASSERT (SELECT statut FROM echange) = 'EN_ATTENTE',
        'KO  statut par défaut';
    RAISE NOTICE 'OK  valeurs par défaut (JOUEUR, EN_ATTENTE)';
END $$;

-- ---------------------------------------------------------------------------
-- utilisateur
-- ---------------------------------------------------------------------------
SELECT pg_temp.doit_echouer('pseudo unique sans tenir compte des majuscules',
    $q$INSERT INTO utilisateur (pseudo, identifiant, mot_de_passe_hash) VALUES ('ALICE', 'alice2', 'h')$q$,
    'uq_utilisateur_pseudo');
SELECT pg_temp.doit_echouer('identifiant unique',
    $q$INSERT INTO utilisateur (pseudo, identifiant, mot_de_passe_hash) VALUES ('Alice2', 'alice', 'h')$q$,
    'uq_utilisateur_identifiant');
SELECT pg_temp.doit_echouer('rôle inconnu refusé',
    $q$INSERT INTO utilisateur (pseudo, identifiant, mot_de_passe_hash, role) VALUES ('Eve', 'eve', 'h', 'SUPER')$q$,
    'ck_utilisateur_role');
SELECT pg_temp.doit_echouer('pseudo vide refusé',
    $q$INSERT INTO utilisateur (pseudo, identifiant, mot_de_passe_hash) VALUES ('   ', 'vide', 'h')$q$,
    'ck_utilisateur_pseudo');

-- ---------------------------------------------------------------------------
-- creature
-- ---------------------------------------------------------------------------
SELECT pg_temp.doit_echouer('nom de créature unique',
    $q$INSERT INTO creature (nom, famille, rarete, poids, image, stock_total, stock_restant)
       VALUES ('Moussou', 'NATURE', 'COMMUN', 1, 'x.png', 1, 1)$q$,
    'uq_creature_nom');
SELECT pg_temp.doit_echouer('famille inconnue refusée',
    $q$INSERT INTO creature (nom, famille, rarete, poids, image, stock_total, stock_restant)
       VALUES ('X', 'FEU', 'COMMUN', 1, 'x.png', 1, 1)$q$,
    'ck_creature_famille');
SELECT pg_temp.doit_echouer('rareté inconnue refusée',
    $q$INSERT INTO creature (nom, famille, rarete, poids, image, stock_total, stock_restant)
       VALUES ('X', 'NATURE', 'LEGENDAIRE', 1, 'x.png', 1, 1)$q$,
    'ck_creature_rarete');
SELECT pg_temp.doit_echouer('poids nul refusé',
    $q$INSERT INTO creature (nom, famille, rarete, poids, image, stock_total, stock_restant)
       VALUES ('X', 'NATURE', 'COMMUN', 0, 'x.png', 1, 1)$q$,
    'ck_creature_poids');
SELECT pg_temp.doit_echouer('stock restant négatif refusé',
    $q$UPDATE creature SET stock_restant = stock_restant - 1000 WHERE nom = 'Brumel'$q$,
    'ck_creature_stock_restant');
SELECT pg_temp.doit_echouer('stock restant supérieur au total refusé',
    $q$UPDATE creature SET stock_restant = stock_total + 1 WHERE nom = 'Brumel'$q$,
    'ck_creature_stock_restant');

-- ---------------------------------------------------------------------------
-- collection
-- ---------------------------------------------------------------------------
SELECT pg_temp.doit_echouer('quantité négative refusée (carte consommée deux fois)',
    $q$UPDATE collection SET quantite = quantite - 3
       WHERE utilisateur_id = '00000000-0000-0000-0000-00000000000a'$q$,
    'ck_collection_quantite');
SELECT pg_temp.doit_echouer('une seule ligne par (joueur, créature)',
    $q$INSERT INTO collection (utilisateur_id, creature_id, quantite)
       SELECT '00000000-0000-0000-0000-00000000000a', id, 1 FROM creature WHERE nom = 'Moussou'$q$,
    'pk_collection');
SELECT pg_temp.doit_echouer('joueur inexistant refusé',
    $q$INSERT INTO collection (utilisateur_id, creature_id, quantite)
       SELECT gen_random_uuid(), id, 1 FROM creature WHERE nom = 'Moussou'$q$,
    'fk_collection_utilisateur');
SELECT pg_temp.doit_echouer('suppression d''une créature possédée refusée',
    $q$DELETE FROM creature WHERE nom = 'Moussou'$q$,
    'fk_collection_creature');

-- ---------------------------------------------------------------------------
-- echange
-- ---------------------------------------------------------------------------
SELECT pg_temp.doit_echouer('échange avec soi-même refusé',
    $q$INSERT INTO echange (proposeur_id, destinataire_id)
       VALUES ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a')$q$,
    'ck_echange_participants');
SELECT pg_temp.doit_echouer('destinataire inexistant refusé',
    $q$INSERT INTO echange (proposeur_id, destinataire_id)
       VALUES ('00000000-0000-0000-0000-00000000000a', gen_random_uuid())$q$,
    'fk_echange_destinataire');
SELECT pg_temp.doit_echouer('statut inconnu refusé',
    $q$UPDATE echange SET statut = 'PERDU', decide_le = now()$q$,
    'ck_echange_statut');
SELECT pg_temp.doit_echouer('statut décidé sans date de décision refusé',
    $q$UPDATE echange SET statut = 'ACCEPTE'$q$,
    'ck_echange_decision');
SELECT pg_temp.doit_echouer('date de décision sur un échange en attente refusée',
    $q$UPDATE echange SET decide_le = now()$q$,
    'ck_echange_decision');
SELECT pg_temp.doit_echouer('suppression d''un joueur ayant des échanges refusée',
    $q$DELETE FROM utilisateur WHERE identifiant = 'bob'$q$,
    'fk_echange_destinataire');

-- ---------------------------------------------------------------------------
-- echange_ligne
-- ---------------------------------------------------------------------------
SELECT pg_temp.doit_echouer('sens inconnu refusé',
    $q$INSERT INTO echange_ligne (echange_id, creature_id, sens, quantite)
       SELECT '00000000-0000-0000-0000-0000000000e1', id, 'PRETE', 1 FROM creature WHERE nom = 'Brumel'$q$,
    'ck_echange_ligne_sens');
SELECT pg_temp.doit_echouer('quantité nulle refusée',
    $q$INSERT INTO echange_ligne (echange_id, creature_id, sens, quantite)
       SELECT '00000000-0000-0000-0000-0000000000e1', id, 'OFFERT', 0 FROM creature WHERE nom = 'Brumel'$q$,
    'ck_echange_ligne_quantite');
SELECT pg_temp.doit_echouer('même créature deux fois du même côté refusée',
    $q$INSERT INTO echange_ligne (echange_id, creature_id, sens, quantite)
       SELECT '00000000-0000-0000-0000-0000000000e1', id, 'OFFERT', 1 FROM creature WHERE nom = 'Moussou'$q$,
    'pk_echange_ligne');

-- Suppression d'un échange : ses lignes partent avec lui (CASCADE)
DO $$ BEGIN
    DELETE FROM echange WHERE id = '00000000-0000-0000-0000-0000000000e1';
    ASSERT (SELECT count(*) FROM echange_ligne) = 0, 'KO  cascade echange -> echange_ligne';
    RAISE NOTICE 'OK  suppression d''un échange supprime ses lignes';
END $$;

-- Une décision valide passe
DO $$ BEGIN
    INSERT INTO echange (proposeur_id, destinataire_id, statut, decide_le)
    VALUES ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', 'REFUSE', now());
    RAISE NOTICE 'OK  échange décidé avec sa date accepté';
END $$;

ROLLBACK;
\echo '>>> Tous les tests du schéma sont passés.'
