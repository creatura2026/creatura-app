-- =============================================================================
-- CREATURA - Catalogue initial des créatures
-- Tickets : AS-41 (création), AS-xx (images reliées aux sprites du CDN)
-- À appliquer PARTOUT (local, dev, prod) après 01_schema.sql.
--
-- 24 créatures : les 4 du cahier des charges (Moussou, Cristille, Brumel,
-- Flammille) + 20 autres, chacune associée à un sprite du dépôt creatura-infra.
-- Répartition par famille : 3 COMMUN, 2 PEU_COMMUN, 1 RARE.
--
--   Rareté      poids  stock
--   COMMUN        60    500
--   PEU_COMMUN    30    200
--   RARE          10     50
--
-- Colonne image = CLÉ S3 du sprite ("sprites/<fichier>.png"), jamais l'URL
-- complète : l'adresse CloudFront change à chaque recréation de l'infra.
-- URL affichée = <CDN_BASE_URL>/<image>, ex. https://dxxxx.cloudfront.net/sprites/moss_puff.png
-- (sprites envoyés par creatura-infra/infra/main.tf, préfixe var.object_prefix)
--
-- Ré-exécutable sans risque : une créature déjà présente (même nom) est ignorée.
-- =============================================================================

BEGIN;

INSERT INTO creature (nom, description, famille, rarete, poids, image, stock_total, stock_restant)
VALUES
    -- NATURE
    ('Moussou',     'Habite les sous-bois.',                          'NATURE',  'COMMUN',     60, 'sprites/moss_puff.png',       500, 500),
    ('Champichou',  'Pousse en une nuit après la pluie.',             'NATURE',  'COMMUN',     60, 'sprites/mushroom.png',        500, 500),
    ('Cactelle',    'Fleurit une fois par an, en plein désert.',      'NATURE',  'COMMUN',     60, 'sprites/flower_cactus.png',   500, 500),
    ('Feuillard',   'Se camoufle parmi les feuilles mortes.',         'NATURE',  'PEU_COMMUN', 30, 'sprites/leaf_dragon.png',     200, 200),
    ('Sylvelin',    'Fait pousser des bourgeons sur son passage.',    'NATURE',  'PEU_COMMUN', 30, 'sprites/moss_sprite.png',     200, 200),
    ('Morilleux',   'Gardien des plus vieux champignons de la forêt.','NATURE',  'RARE',       10, 'sprites/mushroom_dragon.png',  50,  50),
    -- CRISTAL
    ('Galetin',     'Roule le long des rivières de montagne.',        'CRISTAL', 'COMMUN',     60, 'sprites/stone_golem.png',     500, 500),
    ('Quartzou',    'Ses oreilles brillent comme du verre.',          'CRISTAL', 'COMMUN',     60, 'sprites/quartz_rabbit.png',   500, 500),
    ('Géodille',    'Cache un trésor violet sous sa carapace.',       'CRISTAL', 'COMMUN',     60, 'sprites/geode_armadillo.png', 500, 500),
    ('Diamandre',   'Sa carapace taillée renvoie la lumière.',        'CRISTAL', 'PEU_COMMUN', 30, 'sprites/diamond_beetle.png',  200, 200),
    ('Améthor',     'Un géant d''améthyste au cœur paisible.',        'CRISTAL', 'PEU_COMMUN', 30, 'sprites/crystal_golem.png',   200, 200),
    ('Cristille',   'Un insecte aux ailes minérales.',                'CRISTAL', 'RARE',       10, 'sprites/amber_spider.png',     50,  50),
    -- BRUME
    ('Nuageon',     'Flotte au-dessus des étangs à l''aube.',         'BRUME',   'COMMUN',     60, 'sprites/mist_ghost.png',      500, 500),
    ('Méduvine',    'Dérive au gré des courants brumeux.',            'BRUME',   'COMMUN',     60, 'sprites/jellyfish.png',       500, 500),
    ('Vapouille',   'Apparaît après les averses d''été.',             'BRUME',   'COMMUN',     60, 'sprites/blue_wisp.png',       500, 500),
    ('Givrelle',    'Glisse sur la glace des matins d''hiver.',       'BRUME',   'PEU_COMMUN', 30, 'sprites/ice_seal.png',        200, 200),
    ('Ondragon',    'Danse dans l''écume des vagues.',                'BRUME',   'PEU_COMMUN', 30, 'sprites/sea_dragon.png',      200, 200),
    ('Brumel',      'Se déplace dans les nuages.',                    'BRUME',   'RARE',       10, 'sprites/manta_ray.png',        50,  50),
    -- LUEUR
    ('Mèchou',      'Veille sur les veilleurs de nuit.',              'LUEUR',   'COMMUN',     60, 'sprites/candle_spirit.png',   500, 500),
    ('Braisillon',  'Ses piquants rougeoient comme des braises.',     'LUEUR',   'COMMUN',     60, 'sprites/fire_hedgehog.png',   500, 500),
    ('Lunaile',     'Ne sort que les nuits de pleine lune.',          'LUEUR',   'COMMUN',     60, 'sprites/star_moth.png',       500, 500),
    ('Flammille',   'Éclaire les sentiers.',                          'LUEUR',   'PEU_COMMUN', 30, 'sprites/flame_fox.png',       200, 200),
    ('Étoilou',     'Laisse une traînée d''étoiles derrière lui.',    'LUEUR',   'PEU_COMMUN', 30, 'sprites/star_kitten.png',     200, 200),
    ('Lunacerf',    'Porte la lune entre ses bois.',                  'LUEUR',   'RARE',       10, 'sprites/moon_deer.png',        50,  50)
ON CONFLICT ON CONSTRAINT uq_creature_nom DO NOTHING;

COMMIT;
