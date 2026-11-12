-- =============================================================================
-- CREATURA - Tests du schéma (AS-40)
-- Vérifie que chaque contrainte accepte les bonnes données et bloque les
-- mauvaises AVEC LE BON NOM de contrainte (celui que le back traduira).
--
-- Lancement : psql -v ON_ERROR_STOP=1 -d creatura -f db/tests/test_schema.sql
-- Tout se passe dans une transaction annulée à la fin : la base n'est pas
-- modifiée. Fonctionne sur une base vide ou déjà remplie (noms Test...). Le script s'arrête avec une erreur au premier test qui échoue.
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
VALUES ('00000000-0000-0000-0000-00000000000a', 'TestA', 'test_a', 'hash'),
       ('00000000-0000-0000-0000-00000000000b', 'TestB', 'test_b', 'hash');
INSERT INTO utilisateur (pseudo, identifiant, mot_de_passe_hash, role)
VALUES ('TestAdmin', 'test_admin', 'hash', 'ADMIN');

INSERT INTO creature (nom, famille, rarete, poids, image, stock_total, stock_restant)
VALUES ('TestMoussou', 'NATURE', 'COMMUN', 60, 'images/moussou.png', 100, 100),
       ('TestBrumel',  'BRUME',  'RARE',   10, 'images/brumel.png',   10,  10);

INSERT INTO collection (utilisateur_id, creature_id, quantite)
SELECT '00000000-0000-0000-0000-00000000000a', id, 2 FROM creature WHERE nom = 'TestMoussou';

INSERT INTO echange (id, proposeur_id, destinataire_id)
VALUES ('00000000-0000-0000-0000-0000000000e1',
        '00000000-0000-0000-0000-00000000000a',
        '00000000-0000-0000-0000-00000000000b');
INSERT INTO echange_ligne (echange_id, creature_id, sens, quantite)
SELECT '00000000-0000-0000-0000-0000000000e1'::uuid, id, 'OFFERT', 1 FROM creature WHERE nom = 'TestMoussou'
UNION ALL
SELECT '00000000-0000-0000-0000-0000000000e1'::uuid, id, 'DEMANDE', 1 FROM creature WHERE nom = 'TestBrumel';

DO $$ BEGIN RAISE NOTICE 'OK  insertion de données valides'; END $$;

-- Valeurs par défaut
DO $$ BEGIN
    ASSERT (SELECT role FROM utilisateur WHERE identifiant = 'test_a') = 'JOUEUR',
        'KO  rôle par défaut';
    ASSERT (SELECT statut FROM echange WHERE id = '00000000-0000-0000-0000-0000000000e1') = 'EN_ATTENTE',
        'KO  statut par défaut';
    RAISE NOTICE 'OK  valeurs par défaut (JOUEUR, EN_ATTENTE)';
END $$;

-- ---------------------------------------------------------------------------
-- utilisateur
-- ---------------------------------------------------------------------------
SELECT pg_temp.doit_echouer('pseudo unique sans tenir compte des majuscules',
    $q$INSERT INTO utilisateur (pseudo, identifiant, mot_de_passe_hash) VALUES ('TESTA', 'test_a2', 'h')$q$,
    'uq_utilisateur_pseudo');
SELECT pg_temp.doit_echouer('identifiant unique',
    $q$INSERT INTO utilisateur (pseudo, identifiant, mot_de_passe_hash) VALUES ('TestA2', 'test_a', 'h')$q$,
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
       VALUES ('TestMoussou', 'NATURE', 'COMMUN', 1, 'x.png', 1, 1)$q$,
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
    $q$UPDATE creature SET stock_restant = stock_restant - 1000 WHERE nom = 'TestBrumel'$q$,
    'ck_creature_stock_restant');
SELECT pg_temp.doit_echouer('stock restant supérieur au total refusé',
    $q$UPDATE creature SET stock_restant = stock_total + 1 WHERE nom = 'TestBrumel'$q$,
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
       SELECT '00000000-0000-0000-0000-00000000000a', id, 1 FROM creature WHERE nom = 'TestMoussou'$q$,
    'pk_collection');
SELECT pg_temp.doit_echouer('joueur inexistant refusé',
    $q$INSERT INTO collection (utilisateur_id, creature_id, quantite)
       SELECT gen_random_uuid(), id, 1 FROM creature WHERE nom = 'TestMoussou'$q$,
    'fk_collection_utilisateur');
SELECT pg_temp.doit_echouer('suppression d''une créature possédée refusée',
    $q$DELETE FROM creature WHERE nom = 'TestMoussou'$q$,
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
    $q$UPDATE echange SET statut = 'PERDU', decide_le = now()
       WHERE id = '00000000-0000-0000-0000-0000000000e1'$q$,
    'ck_echange_statut');
SELECT pg_temp.doit_echouer('statut décidé sans date de décision refusé',
    $q$UPDATE echange SET statut = 'ACCEPTE'
       WHERE id = '00000000-0000-0000-0000-0000000000e1'$q$,
    'ck_echange_decision');
SELECT pg_temp.doit_echouer('date de décision sur un échange en attente refusée',
    $q$UPDATE echange SET decide_le = now()
       WHERE id = '00000000-0000-0000-0000-0000000000e1'$q$,
    'ck_echange_decision');
SELECT pg_temp.doit_echouer('suppression d''un joueur ayant des échanges refusée',
    $q$DELETE FROM utilisateur WHERE identifiant = 'test_b'$q$,
    'fk_echange_destinataire');

-- ---------------------------------------------------------------------------
-- echange_ligne
-- ---------------------------------------------------------------------------
SELECT pg_temp.doit_echouer('sens inconnu refusé',
    $q$INSERT INTO echange_ligne (echange_id, creature_id, sens, quantite)
       SELECT '00000000-0000-0000-0000-0000000000e1', id, 'PRETE', 1 FROM creature WHERE nom = 'TestBrumel'$q$,
    'ck_echange_ligne_sens');
SELECT pg_temp.doit_echouer('quantité nulle refusée',
    $q$INSERT INTO echange_ligne (echange_id, creature_id, sens, quantite)
       SELECT '00000000-0000-0000-0000-0000000000e1', id, 'OFFERT', 0 FROM creature WHERE nom = 'TestBrumel'$q$,
    'ck_echange_ligne_quantite');
SELECT pg_temp.doit_echouer('même créature deux fois du même côté refusée',
    $q$INSERT INTO echange_ligne (echange_id, creature_id, sens, quantite)
       SELECT '00000000-0000-0000-0000-0000000000e1', id, 'OFFERT', 1 FROM creature WHERE nom = 'TestMoussou'$q$,
    'pk_echange_ligne');

-- Suppression d'un échange : ses lignes partent avec lui (CASCADE)
DO $$ BEGIN
    DELETE FROM echange WHERE id = '00000000-0000-0000-0000-0000000000e1';
    ASSERT (SELECT count(*) FROM echange_ligne
            WHERE echange_id = '00000000-0000-0000-0000-0000000000e1') = 0, 'KO  cascade echange -> echange_ligne';
    RAISE NOTICE 'OK  suppression d''un échange supprime ses lignes';
END $$;

-- Une décision valide passe
DO $$ BEGIN
    INSERT INTO echange (proposeur_id, destinataire_id, statut, decide_le)
    VALUES ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', 'REFUSE', now());
    RAISE NOTICE 'OK  échange décidé avec sa date accepté';
END $$;

-- ---------------------------------------------------------------------------
-- echange échoué (04_evolution_reglage_echec.sql)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
    INSERT INTO echange (id, proposeur_id, destinataire_id, statut, decide_le, motif_echec)
    VALUES ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-00000000000a',
            '00000000-0000-0000-0000-00000000000b', 'ECHOUE', now(), 'CARDS_UNAVAILABLE');
    RAISE NOTICE 'OK  échange échoué avec son motif accepté';
END $$;
SELECT pg_temp.doit_echouer('échec sans motif refusé',
    $q$UPDATE echange SET motif_echec = NULL WHERE id = '00000000-0000-0000-0000-0000000000e2'$q$,
    'ck_echange_motif_echec');
SELECT pg_temp.doit_echouer('motif sur un échange non échoué refusé',
    $q$UPDATE echange SET statut = 'ACCEPTE' WHERE id = '00000000-0000-0000-0000-0000000000e2'$q$,
    'ck_echange_motif_echec');

-- ---------------------------------------------------------------------------
-- salle d'échange (05_evolution_salle_echange.sql)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
    INSERT INTO echange (id, proposeur_id, destinataire_id, creature_cherchee_id)
    SELECT '00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-00000000000a',
           '00000000-0000-0000-0000-00000000000b', id FROM creature WHERE nom = 'TestBrumel';
    ASSERT (SELECT NOT proposeur_pret AND NOT destinataire_pret FROM echange
            WHERE id = '00000000-0000-0000-0000-0000000000e3'), 'KO  validations à faux par défaut';
    INSERT INTO echange_message (echange_id, auteur_id, texte)
    VALUES ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-00000000000a', 'Bonjour !');
    RAISE NOTICE 'OK  salle ouverte tapis vides, sans validation, avec un message';
END $$;
SELECT pg_temp.doit_echouer('carte cherchée inexistante refusée',
    $q$UPDATE echange SET creature_cherchee_id = -1 WHERE id = '00000000-0000-0000-0000-0000000000e3'$q$,
    'fk_echange_creature_cherchee');
SELECT pg_temp.doit_echouer('message vide refusé',
    $q$INSERT INTO echange_message (echange_id, auteur_id, texte)
       VALUES ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-00000000000a', '   ')$q$,
    'ck_echange_message_texte');
SELECT pg_temp.doit_echouer('message d''un auteur inexistant refusé',
    $q$INSERT INTO echange_message (echange_id, auteur_id, texte)
       VALUES ('00000000-0000-0000-0000-0000000000e3', gen_random_uuid(), 'Salut')$q$,
    'fk_echange_message_auteur');
SELECT pg_temp.doit_echouer('message de plus de 500 caractères refusé',
    $q$INSERT INTO echange_message (echange_id, auteur_id, texte)
       VALUES ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-00000000000a', repeat('a', 501))$q$,
    '');
DO $$ BEGIN
    DELETE FROM echange WHERE id = '00000000-0000-0000-0000-0000000000e3';
    ASSERT (SELECT count(*) FROM echange_message
            WHERE echange_id = '00000000-0000-0000-0000-0000000000e3') = 0, 'KO  cascade echange -> echange_message';
    RAISE NOTICE 'OK  suppression d''un échange supprime sa discussion';
END $$;

-- ---------------------------------------------------------------------------
-- reglage (04_evolution_reglage_echec.sql)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
    ASSERT (SELECT cartes_par_booster FROM reglage WHERE id = 1) IS NOT NULL,
        'KO  la ligne de réglage doit exister';
    RAISE NOTICE 'OK  ligne de réglage présente';
END $$;
SELECT pg_temp.doit_echouer('une seule ligne de réglage',
    $q$INSERT INTO reglage (id) VALUES (2)$q$,
    'ck_reglage_ligne_unique');
SELECT pg_temp.doit_echouer('booster vide refusé',
    $q$UPDATE reglage SET cartes_par_booster = 0$q$,
    'ck_reglage_cartes_par_booster');
SELECT pg_temp.doit_echouer('booster de plus de 10 cartes refusé',
    $q$UPDATE reglage SET cartes_par_booster = 11$q$,
    'ck_reglage_cartes_par_booster');
SELECT pg_temp.doit_echouer('auteur sans date de modification refusé',
    $q$UPDATE reglage SET modifie_par = '00000000-0000-0000-0000-00000000000a', modifie_le = NULL$q$,
    'ck_reglage_modification');
SELECT pg_temp.doit_echouer('auteur inexistant refusé',
    $q$UPDATE reglage SET modifie_par = gen_random_uuid(), modifie_le = now()$q$,
    'fk_reglage_modifie_par');

ROLLBACK;
\echo '>>> Tous les tests du schéma sont passés.'
