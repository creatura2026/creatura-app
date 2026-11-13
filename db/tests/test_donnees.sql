-- =============================================================================
-- CREATURA - Tests du jeu de données (AS-41)
-- À lancer après 01_schema.sql, 02_catalogue.sql, 03_demo_dev.sql et 04_evolution_*.sql.
-- Ne modifie pas les données (les scripts relancés sont ré-exécutables).
-- S'arrête au premier test KO.
-- =============================================================================

\set QUIET on
\o /dev/null

DO $$
DECLARE
    n integer;
BEGIN
    -- Catalogue ---------------------------------------------------------------
    SELECT count(*) INTO n FROM creature;
    ASSERT n = 84, format('KO  84 créatures attendues, %s trouvées', n);
    RAISE NOTICE 'OK  84 créatures au catalogue';

    SELECT count(*) INTO n FROM creature WHERE image NOT LIKE 'sprites/%.png';
    ASSERT n = 0, 'KO  chaque image doit être une clé sprites/….png du CDN';
    SELECT count(*) - count(DISTINCT image) INTO n FROM creature;
    ASSERT n = 0, 'KO  deux créatures partagent la même image';
    RAISE NOTICE 'OK  une image distincte du CDN par créature';

    SELECT count(*) INTO n
    FROM (SELECT famille FROM creature GROUP BY famille
          HAVING count(DISTINCT rarete) FILTER (WHERE rarete IN ('COMMUN', 'PEU_COMMUN', 'RARE')) = 3) f;
    ASSERT n = 4, 'KO  chaque famille doit avoir les 3 raretés';
    RAISE NOTICE 'OK  4 familles, chacune avec COMMUN, PEU_COMMUN et RARE';

    SELECT count(*) INTO n FROM creature
    WHERE nom IN ('Moussou', 'Cristille', 'Brumel', 'Flammille');
    ASSERT n = 4, 'KO  les 4 créatures du cahier des charges doivent exister';
    RAISE NOTICE 'OK  les 4 créatures du cahier des charges sont présentes';

    -- Règle de conservation du stock -------------------------------------------
    SELECT count(*) INTO n
    FROM creature c
    WHERE c.stock_total <> c.stock_restant
          + coalesce((SELECT sum(quantite) FROM collection WHERE creature_id = c.id), 0);
    ASSERT n = 0, format('KO  stock incohérent pour %s créature(s)', n);
    RAISE NOTICE 'OK  stock_total = stock_restant + cartes en collection';

    -- Comptes de démo -------------------------------------------------------------
    ASSERT (SELECT role FROM utilisateur WHERE identifiant = 'admin') = 'ADMIN',
        'KO  le compte admin doit avoir le rôle ADMIN';
    ASSERT (SELECT count(*) FROM utilisateur WHERE role = 'JOUEUR') = 2,
        'KO  2 joueurs de démo attendus';
    RAISE NOTICE 'OK  1 admin et 2 joueurs';

    SELECT count(*) INTO n FROM utilisateur
    WHERE mot_de_passe_hash = crypt(identifiant, mot_de_passe_hash)
      AND mot_de_passe_hash LIKE '$2a$10$%';
    ASSERT n = 3, 'KO  les mots de passe de démo doivent être des hash bcrypt valides';
    RAISE NOTICE 'OK  mots de passe hachés en bcrypt (coût 10) et vérifiables';

    SELECT count(*) INTO n FROM utilisateur
    WHERE mot_de_passe_hash = identifiant;
    ASSERT n = 0, 'KO  un mot de passe est stocké en clair';
    RAISE NOTICE 'OK  aucun mot de passe en clair';

    -- Situation de départ (exemple du slide 11) ----------------------------------
    ASSERT (SELECT quantite FROM collection co
            JOIN utilisateur u ON u.id = co.utilisateur_id
            JOIN creature c    ON c.id = co.creature_id
            WHERE u.identifiant = 'joueur1' AND c.nom = 'Moussou') = 2,
        'KO  Alice doit avoir 2 Moussou';
    ASSERT (SELECT quantite FROM collection co
            JOIN utilisateur u ON u.id = co.utilisateur_id
            JOIN creature c    ON c.id = co.creature_id
            WHERE u.identifiant = 'joueur2' AND c.nom = 'Brumel') = 1,
        'KO  Bob doit avoir 1 Brumel';
    RAISE NOTICE 'OK  collections de départ d''Alice et Bob';

    ASSERT (SELECT count(*) FROM echange WHERE statut = 'EN_ATTENTE') = 1,
        'KO  1 échange en attente attendu';
    ASSERT (SELECT count(*) FROM echange_ligne) = 2,
        'KO  l''échange de démo doit avoir 2 lignes';
    RAISE NOTICE 'OK  échange de démo en attente (Moussou contre Brumel)';
END $$;

-- Ré-exécution : relancer les scripts ne doit rien dupliquer ni casser
\i /db/init/02_catalogue.sql
\i /db/init/03_demo_dev.sql
\i /db/init/04_evolution_reglage_echec.sql
\o /dev/null
DO $$ BEGIN
    ASSERT (SELECT count(*) FROM creature) = 84,    'KO  ré-exécution : créatures dupliquées';
    ASSERT (SELECT count(*) FROM utilisateur) = 3,  'KO  ré-exécution : comptes dupliqués';
    ASSERT (SELECT count(*) FROM echange_ligne) = 2,'KO  ré-exécution : lignes dupliquées';
    ASSERT (SELECT count(*) FROM reglage) = 1,      'KO  ré-exécution : réglages dupliqués';
    RAISE NOTICE 'OK  scripts ré-exécutables sans doublon';
END $$;

\echo '>>> Tous les tests du jeu de données sont passés.'
