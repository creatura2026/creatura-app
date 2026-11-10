-- =============================================================================
-- CREATURA - Catalogue initial des créatures
-- Ticket : AS-41
-- À appliquer PARTOUT (local, dev, prod) après 01_schema.sql.
--
-- Contenu provisoire : les 4 créatures du cahier des charges + 8 créatures
-- inventées pour avoir de la variété. À remplacer par la liste du client.
-- Répartition : 4 familles × 3 raretés (une créature par couple).
--
--   Rareté      poids  stock   (le poids donne la proba : 60/30/10 par famille)
--   COMMUN        60    500
--   PEU_COMMUN    30    200
--   RARE          10     50
--
-- Ré-exécutable sans risque : une créature déjà présente (même nom) est ignorée.
-- =============================================================================

BEGIN;

INSERT INTO creature (nom, description, famille, rarete, poids, image, stock_total, stock_restant)
VALUES
    -- NATURE
    ('Moussou',    'Habite les sous-bois.',                       'NATURE',  'COMMUN',     60, 'images/moussou.png',    500, 500),
    ('Feuillard',  'Se camoufle parmi les feuilles mortes.',      'NATURE',  'PEU_COMMUN', 30, 'images/feuillard.png',  200, 200),
    ('Sylvanor',   'Gardien des plus vieux arbres de la forêt.',  'NATURE',  'RARE',       10, 'images/sylvanor.png',    50,  50),
    -- CRISTAL
    ('Galetin',    'Roule le long des rivières de montagne.',     'CRISTAL', 'COMMUN',     60, 'images/galetin.png',    500, 500),
    ('Quartzelle', 'Ses écailles reflètent la lumière du matin.', 'CRISTAL', 'PEU_COMMUN', 30, 'images/quartzelle.png', 200, 200),
    ('Cristille',  'Un insecte aux ailes minérales.',             'CRISTAL', 'RARE',       10, 'images/cristille.png',   50,  50),
    -- BRUME
    ('Nuageon',    'Flotte au-dessus des étangs à l''aube.',      'BRUME',   'COMMUN',     60, 'images/nuageon.png',    500, 500),
    ('Vapouille',  'Apparaît après les averses d''été.',          'BRUME',   'PEU_COMMUN', 30, 'images/vapouille.png',  200, 200),
    ('Brumel',     'Se déplace dans les nuages.',                 'BRUME',   'RARE',       10, 'images/brumel.png',      50,  50),
    -- LUEUR
    ('Lucioli',    'Danse autour des lanternes le soir.',         'LUEUR',   'COMMUN',     60, 'images/lucioli.png',    500, 500),
    ('Flammille',  'Éclaire les sentiers.',                       'LUEUR',   'PEU_COMMUN', 30, 'images/flammille.png',  200, 200),
    ('Solaris',    'Ne se montre qu''au solstice.',               'LUEUR',   'RARE',       10, 'images/solaris.png',     50,  50)
ON CONFLICT ON CONSTRAINT uq_creature_nom DO NOTHING;

COMMIT;
