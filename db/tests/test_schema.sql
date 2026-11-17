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

INSERT INTO creature (nom, famille, rarete, image, stock_total, stock_restant)
VALUES ('TestMoussou', 'NATURE', 'COMMUN',     'images/moussou.png', NULL, NULL),
       ('TestBrumel',  'BRUME',  'LEGENDAIRE', 'images/brumel.png',    10,   10);

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
    $q$INSERT INTO creature (nom, famille, rarete, image, stock_total, stock_restant)
       VALUES ('TestMoussou', 'NATURE', 'COMMUN', 'x.png', NULL, NULL)$q$,
    'uq_creature_nom');
SELECT pg_temp.doit_echouer('famille inconnue refusée',
    $q$INSERT INTO creature (nom, famille, rarete, image, stock_total, stock_restant)
       VALUES ('X', 'FEU', 'COMMUN', 'x.png', NULL, NULL)$q$,
    'ck_creature_famille');
SELECT pg_temp.doit_echouer('rareté inconnue refusée',
    $q$INSERT INTO creature (nom, famille, rarete, image, stock_total, stock_restant)
       VALUES ('X', 'NATURE', 'MYTHIQUE', 'x.png', NULL, NULL)$q$,
    'ck_creature_rarete');
SELECT pg_temp.doit_echouer('stock refusé hors légendaire (illimité)',
    $q$INSERT INTO creature (nom, famille, rarete, image, stock_total, stock_restant)
       VALUES ('X', 'NATURE', 'RARE', 'x.png', 5, 5)$q$,
    'ck_creature_stock_legendaire');
SELECT pg_temp.doit_echouer('légendaire sans stock refusée',
    $q$INSERT INTO creature (nom, famille, rarete, image, stock_total, stock_restant)
       VALUES ('X', 'NATURE', 'LEGENDAIRE', 'x.png', NULL, NULL)$q$,
    'ck_creature_stock_legendaire');
SELECT pg_temp.doit_echouer('stock total sans stock restant refusé',
    $q$UPDATE creature SET stock_restant = NULL WHERE nom = 'TestBrumel'$q$,
    'ck_creature_stock_restant');
SELECT pg_temp.doit_echouer('poids de rareté négatif refusé',
    $q$UPDATE rarete_tirage SET poids = -1 WHERE rarete = 'RARE'$q$,
    'ck_rarete_tirage_poids');
SELECT pg_temp.doit_echouer('booster de 2 cartes refusé',
    $q$UPDATE reglage SET cartes_par_booster = 2$q$,
    'ck_reglage_cartes_par_booster');
SELECT pg_temp.doit_echouer('motif de tirage inconnu refusé',
    $q$INSERT INTO booster_carte (booster_id, position, utilisateur_id, jour, creature_id, rarete, motif)
       SELECT gen_random_uuid(), 1, '00000000-0000-0000-0000-00000000000a', current_date, id, 'COMMUN', 'CADEAU'
       FROM creature WHERE nom = 'TestMoussou'$q$,
    'ck_booster_carte_motif');
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
SELECT pg_temp.doit_echouer('suppression directe d''un joueur ayant un échange en attente refusée',
    $q$DELETE FROM utilisateur WHERE identifiant = 'test_b'$q$,
    'ck_echange_joueurs');

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

-- ---------------------------------------------------------------------------
-- joueurs et administrateurs dans le dashboard (10_evolution_joueurs_admin.sql)
-- Admins : TestAdmin (a1), TestAdmin2 (a2, créé par a1), TestAdmin3 (a3)
-- Joueurs : TestC (c), TestD (d)
-- ---------------------------------------------------------------------------
UPDATE utilisateur SET id = '00000000-0000-0000-0000-0000000000a1' WHERE identifiant = 'test_admin';
INSERT INTO utilisateur (id, pseudo, identifiant, mot_de_passe_hash, role, cree_par, mot_de_passe_provisoire)
VALUES ('00000000-0000-0000-0000-0000000000a2', 'TestAdmin2', 'test_admin2', 'hash', 'ADMIN',
        '00000000-0000-0000-0000-0000000000a1', true),
       ('00000000-0000-0000-0000-0000000000a3', 'TestAdmin3', 'test_admin3', 'hash', 'ADMIN', NULL, false);
INSERT INTO utilisateur (id, pseudo, identifiant, mot_de_passe_hash)
VALUES ('00000000-0000-0000-0000-00000000000c', 'TestC', 'test_c', 'hash'),
       ('00000000-0000-0000-0000-00000000000d', 'TestD', 'test_d', 'hash');
DO $$ BEGIN RAISE NOTICE 'OK  admin créé par un autre admin, avec mot de passe provisoire'; END $$;

SELECT pg_temp.doit_echouer('joueur avec un créateur refusé',
    $q$UPDATE utilisateur SET cree_par = '00000000-0000-0000-0000-0000000000a1' WHERE identifiant = 'test_c'$q$,
    'ck_utilisateur_compte_admin');
SELECT pg_temp.doit_echouer('joueur désactivé refusé',
    $q$UPDATE utilisateur SET desactive_le = now() WHERE identifiant = 'test_c'$q$,
    'ck_utilisateur_compte_admin');

-- Connexions : enregistrement et purge au-delà de 13 mois
INSERT INTO connexion (utilisateur_id, le)
VALUES ('00000000-0000-0000-0000-00000000000d', now() - interval '14 months'),
       ('00000000-0000-0000-0000-00000000000d', now() - interval '12 months');
SELECT creatura_enregistrer_connexion('00000000-0000-0000-0000-00000000000c');
DO $$ BEGIN
    ASSERT (SELECT count(*) FROM connexion WHERE utilisateur_id = '00000000-0000-0000-0000-00000000000c') = 1,
        'KO  connexion enregistrée';
    ASSERT (SELECT count(*) FROM connexion WHERE utilisateur_id = '00000000-0000-0000-0000-00000000000d') = 1,
        'KO  connexions de plus de 13 mois effacées, les autres gardées';
    RAISE NOTICE 'OK  connexion enregistrée, historique limité à 13 mois';
END $$;
SELECT pg_temp.doit_echouer('connexion d''un compte inexistant refusée',
    $q$INSERT INTO connexion (utilisateur_id) VALUES (gen_random_uuid())$q$,
    'fk_connexion_utilisateur');

-- Échanges : un échange en attente a ses deux joueurs
SELECT pg_temp.doit_echouer('échange en attente sans proposeur refusé',
    $q$INSERT INTO echange (proposeur_id, destinataire_id)
       VALUES (NULL, '00000000-0000-0000-0000-00000000000a')$q$,
    'ck_echange_joueurs');
SELECT pg_temp.doit_echouer('échange terminé sans aucun joueur refusé',
    $q$INSERT INTO echange (proposeur_id, destinataire_id, statut, decide_le)
       VALUES (NULL, NULL, 'ACCEPTE', now())$q$,
    'ck_echange_joueurs');

-- Demande de suppression : règles de création
SELECT pg_temp.doit_echouer('validateur identique au demandeur refusé',
    $q$SELECT creatura_demander_suppression('00000000-0000-0000-0000-0000000000a1',
       '00000000-0000-0000-0000-0000000000a1', ARRAY['00000000-0000-0000-0000-00000000000c']::uuid[])$q$,
    'ck_demande_suppression_valideur');
SELECT pg_temp.doit_echouer('validateur qui n''est pas admin refusé',
    $q$SELECT creatura_demander_suppression('00000000-0000-0000-0000-0000000000a1',
       '00000000-0000-0000-0000-00000000000a', ARRAY['00000000-0000-0000-0000-00000000000c']::uuid[])$q$,
    'ck_demande_suppression_valideur_actif');
SELECT pg_temp.doit_echouer('demande par un joueur refusée',
    $q$SELECT creatura_demander_suppression('00000000-0000-0000-0000-00000000000a',
       '00000000-0000-0000-0000-0000000000a1', ARRAY['00000000-0000-0000-0000-00000000000c']::uuid[])$q$,
    'ck_demande_suppression_demandeur');
SELECT pg_temp.doit_echouer('demande sans joueur refusée',
    $q$SELECT creatura_demander_suppression('00000000-0000-0000-0000-0000000000a1',
       '00000000-0000-0000-0000-0000000000a2', ARRAY[]::uuid[])$q$,
    'ck_demande_suppression_nombre');
SELECT pg_temp.doit_echouer('suppression d''un admin refusée',
    $q$SELECT creatura_demander_suppression('00000000-0000-0000-0000-0000000000a1',
       '00000000-0000-0000-0000-0000000000a2', ARRAY['00000000-0000-0000-0000-0000000000a3']::uuid[])$q$,
    'ck_demande_suppression_joueurs');

-- Demande r1 : a1 demande TestC et TestD, a2 valide
CREATE TEMP TABLE t_demande (nom text PRIMARY KEY, id uuid);
INSERT INTO t_demande
SELECT 'r1', creatura_demander_suppression('00000000-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-0000000000a2',
    ARRAY['00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d']::uuid[],
    'Comptes de test');
DO $$ BEGIN
    ASSERT (SELECT nombre_comptes = 2 AND statut = 'EN_ATTENTE' FROM demande_suppression
            WHERE id = (SELECT id FROM t_demande WHERE nom = 'r1')),
        'KO  demande créée en attente avec 2 comptes';
    RAISE NOTICE 'OK  demande de suppression créée';
END $$;
SELECT pg_temp.doit_echouer('joueur déjà dans une demande en attente refusé',
    $q$SELECT creatura_demander_suppression('00000000-0000-0000-0000-0000000000a3',
       '00000000-0000-0000-0000-0000000000a1', ARRAY['00000000-0000-0000-0000-00000000000c']::uuid[])$q$,
    'ck_demande_suppression_deja_demandee');
SELECT pg_temp.doit_echouer('validation par un autre admin que le validateur refusée',
    $q$SELECT creatura_traiter_demande((SELECT id FROM t_demande WHERE nom = 'r1'),
       '00000000-0000-0000-0000-0000000000a3', true)$q$,
    'ck_demande_suppression_valideur_seul');
SELECT pg_temp.doit_echouer('validation par le demandeur refusée',
    $q$SELECT creatura_traiter_demande((SELECT id FROM t_demande WHERE nom = 'r1'),
       '00000000-0000-0000-0000-0000000000a1', true)$q$,
    'ck_demande_suppression_valideur_seul');
SELECT pg_temp.doit_echouer('annulation par un autre admin que le demandeur refusée',
    $q$SELECT creatura_annuler_demande((SELECT id FROM t_demande WHERE nom = 'r1'),
       '00000000-0000-0000-0000-0000000000a2')$q$,
    'ck_demande_suppression_demandeur_seul');

-- Données de TestC et TestD avant validation :
-- TestC possède 1 TestMoussou et 2 TestBrumel (légendaire : 2 exemplaires sortis du stock).
-- Échanges : c1 en attente C→B, c2 accepté A→C (avec un message de chacun), c3 accepté C→D.
INSERT INTO collection (utilisateur_id, creature_id, quantite)
SELECT '00000000-0000-0000-0000-00000000000c', id, CASE nom WHEN 'TestBrumel' THEN 2 ELSE 1 END
FROM creature WHERE nom IN ('TestMoussou', 'TestBrumel');
UPDATE creature SET stock_restant = stock_restant - 2 WHERE nom = 'TestBrumel';
INSERT INTO echange (id, proposeur_id, destinataire_id, statut, decide_le)
VALUES ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000c',
        '00000000-0000-0000-0000-00000000000b', 'EN_ATTENTE', NULL),
       ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000000a',
        '00000000-0000-0000-0000-00000000000c', 'ACCEPTE', now()),
       ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-00000000000c',
        '00000000-0000-0000-0000-00000000000d', 'ACCEPTE', now());
INSERT INTO echange_message (echange_id, auteur_id, texte)
VALUES ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000000c', 'Merci !'),
       ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000000a', 'Avec plaisir');

DO $$
DECLARE
    stock_avant integer := (SELECT stock_restant FROM creature WHERE nom = 'TestBrumel');
    r1 uuid := (SELECT id FROM t_demande WHERE nom = 'r1');
BEGIN
    PERFORM creatura_traiter_demande(r1, '00000000-0000-0000-0000-0000000000a2', true);
    ASSERT (SELECT statut = 'VALIDEE' AND traite_le IS NOT NULL AND nombre_comptes = 2
            FROM demande_suppression WHERE id = r1),
        'KO  demande validée, nombre de comptes gardé';
    ASSERT NOT EXISTS (SELECT 1 FROM demande_suppression_joueur WHERE demande_id = r1),
        'KO  le journal ne garde pas les joueurs supprimés';
    ASSERT NOT EXISTS (SELECT 1 FROM utilisateur WHERE identifiant IN ('test_c', 'test_d')),
        'KO  comptes effacés';
    ASSERT NOT EXISTS (SELECT 1 FROM echange WHERE id = '00000000-0000-0000-0000-0000000000c1'),
        'KO  échange en attente effacé';
    ASSERT (SELECT proposeur_id = '00000000-0000-0000-0000-00000000000a' AND destinataire_id IS NULL
            FROM echange WHERE id = '00000000-0000-0000-0000-0000000000c2'),
        'KO  échange terminé gardé pour l''autre joueur, place du joueur supprimé à NULL';
    ASSERT NOT EXISTS (SELECT 1 FROM echange WHERE id = '00000000-0000-0000-0000-0000000000c3'),
        'KO  échange entre deux joueurs supprimés effacé';
    ASSERT (SELECT count(*) FROM echange_message WHERE echange_id = '00000000-0000-0000-0000-0000000000c2') = 1,
        'KO  messages du joueur supprimé effacés, ceux de l''autre gardés';
    ASSERT NOT EXISTS (SELECT 1 FROM collection WHERE utilisateur_id = '00000000-0000-0000-0000-00000000000c'),
        'KO  collection effacée';
    ASSERT NOT EXISTS (SELECT 1 FROM connexion
                       WHERE utilisateur_id IN ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d')),
        'KO  connexions effacées';
    ASSERT (SELECT stock_restant FROM creature WHERE nom = 'TestBrumel') = stock_avant + 2,
        'KO  légendaires remises dans le stock';
    RAISE NOTICE 'OK  demande validée : joueurs et leurs données effacés, échanges terminés gardés pour l''autre joueur';
END $$;
SELECT pg_temp.doit_echouer('demande déjà traitée refusée',
    $q$SELECT creatura_traiter_demande((SELECT id FROM t_demande WHERE nom = 'r1'),
       '00000000-0000-0000-0000-0000000000a2', false)$q$,
    'ck_demande_suppression_en_attente');

-- Refus, annulation, expiration : personne n'est supprimé
INSERT INTO t_demande
SELECT 'r2', creatura_demander_suppression('00000000-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-0000000000a2', ARRAY['00000000-0000-0000-0000-00000000000b']::uuid[]);
SELECT creatura_traiter_demande((SELECT id FROM t_demande WHERE nom = 'r2'), '00000000-0000-0000-0000-0000000000a2', false);
INSERT INTO t_demande
SELECT 'r3', creatura_demander_suppression('00000000-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-0000000000a2', ARRAY['00000000-0000-0000-0000-00000000000b']::uuid[]);
SELECT creatura_annuler_demande((SELECT id FROM t_demande WHERE nom = 'r3'), '00000000-0000-0000-0000-0000000000a1');
INSERT INTO t_demande
SELECT 'r4', creatura_demander_suppression('00000000-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-0000000000a2', ARRAY['00000000-0000-0000-0000-00000000000b']::uuid[]);
UPDATE demande_suppression SET cree_le = now() - interval '8 days' WHERE id = (SELECT id FROM t_demande WHERE nom = 'r4');
DO $$ BEGIN
    ASSERT (SELECT statut FROM demande_suppression WHERE id = (SELECT id FROM t_demande WHERE nom = 'r2')) = 'REFUSEE',
        'KO  demande refusée';
    ASSERT (SELECT statut FROM demande_suppression WHERE id = (SELECT id FROM t_demande WHERE nom = 'r3')) = 'ANNULEE',
        'KO  demande annulée';
    ASSERT creatura_expirer_demandes() = 1, 'KO  une demande de plus de 7 jours expire';
    ASSERT (SELECT statut FROM demande_suppression WHERE id = (SELECT id FROM t_demande WHERE nom = 'r4')) = 'EXPIREE',
        'KO  demande expirée';
    ASSERT EXISTS (SELECT 1 FROM utilisateur WHERE identifiant = 'test_b'),
        'KO  refus, annulation et expiration ne suppriment personne';
    RAISE NOTICE 'OK  demande refusée, annulée ou expirée : aucun joueur supprimé';
END $$;
SELECT pg_temp.doit_echouer('demande expirée non validable',
    $q$SELECT creatura_traiter_demande((SELECT id FROM t_demande WHERE nom = 'r4'),
       '00000000-0000-0000-0000-0000000000a2', true)$q$,
    'ck_demande_suppression_en_attente');

-- Désactivation d'un admin par un autre admin
INSERT INTO t_demande
SELECT 'r5', creatura_demander_suppression('00000000-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-0000000000a3', ARRAY['00000000-0000-0000-0000-00000000000b']::uuid[]);
SELECT pg_temp.doit_echouer('un admin ne se désactive pas lui-même',
    $q$SELECT creatura_desactiver_admin('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a3')$q$,
    'ck_utilisateur_desactivation');
SELECT pg_temp.doit_echouer('un joueur ne désactive pas un admin',
    $q$SELECT creatura_desactiver_admin('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000000a')$q$,
    'ck_desactivation_auteur');
SELECT pg_temp.doit_echouer('un joueur ne se désactive pas comme un admin',
    $q$SELECT creatura_desactiver_admin('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1')$q$,
    'ck_desactivation_cible');
SELECT creatura_desactiver_admin('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a2');
DO $$ BEGIN
    ASSERT (SELECT desactive_le IS NOT NULL AND desactive_par = '00000000-0000-0000-0000-0000000000a2'
            FROM utilisateur WHERE id = '00000000-0000-0000-0000-0000000000a3'),
        'KO  admin désactivé, auteur noté';
    ASSERT (SELECT statut FROM demande_suppression WHERE id = (SELECT id FROM t_demande WHERE nom = 'r5')) = 'ANNULEE',
        'KO  demandes en attente de l''admin désactivé annulées';
    ASSERT NOT creatura_admin_actif('00000000-0000-0000-0000-0000000000a3'), 'KO  admin désactivé inactif';
    RAISE NOTICE 'OK  admin désactivé par un autre admin, ses demandes en attente annulées';
END $$;
-- Seuls a1 et a2 restent actifs (les admins des données de démo sont mis de côté)
UPDATE utilisateur SET desactive_le = now()
WHERE role = 'ADMIN' AND desactive_le IS NULL
  AND id NOT IN ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2');
SELECT pg_temp.doit_echouer('au moins deux admins actifs restent',
    $q$SELECT creatura_desactiver_admin('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1')$q$,
    'ck_desactivation_minimum');
SELECT pg_temp.doit_echouer('admin déjà désactivé',
    $q$SELECT creatura_desactiver_admin('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1')$q$,
    'ck_desactivation_cible');
SELECT pg_temp.doit_echouer('admin désactivé non choisissable comme validateur',
    $q$SELECT creatura_demander_suppression('00000000-0000-0000-0000-0000000000a1',
       '00000000-0000-0000-0000-0000000000a3', ARRAY['00000000-0000-0000-0000-00000000000b']::uuid[])$q$,
    'ck_demande_suppression_valideur_actif');
SELECT pg_temp.doit_echouer('un admin désactivé ne fait plus de demande',
    $q$SELECT creatura_demander_suppression('00000000-0000-0000-0000-0000000000a3',
       '00000000-0000-0000-0000-0000000000a1', ARRAY['00000000-0000-0000-0000-00000000000b']::uuid[])$q$,
    'ck_demande_suppression_demandeur');

-- Compte supprimé par son titulaire (anonymisé, 09_evolution_gestion_compte.sql) : ignoré
UPDATE utilisateur SET supprime_le = now() WHERE identifiant = 'test_b';
SELECT pg_temp.doit_echouer('joueur ayant supprimé son compte non demandable',
    $q$SELECT creatura_demander_suppression('00000000-0000-0000-0000-0000000000a1',
       '00000000-0000-0000-0000-0000000000a2', ARRAY['00000000-0000-0000-0000-00000000000b']::uuid[])$q$,
    'ck_demande_suppression_joueurs');
UPDATE utilisateur SET supprime_le = now() WHERE id = '00000000-0000-0000-0000-0000000000a2';
DO $$ BEGIN
    ASSERT NOT creatura_admin_actif('00000000-0000-0000-0000-0000000000a2'),
        'KO  un admin ayant supprimé son compte n''est plus actif';
    RAISE NOTICE 'OK  admin ayant supprimé son compte : plus actif';
END $$;

ROLLBACK;
\echo '>>> Tous les tests du schéma sont passés.'
