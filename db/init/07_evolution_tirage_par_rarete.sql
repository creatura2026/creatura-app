-- =============================================================================
-- CREATURA - Évolution du schéma : tirage des boosters par rareté
-- Doc  : db/docs/schema.md, backend/app/draw.py (algorithme)
--
-- 1. Les poids de tirage passent de la créature à la rareté (table rarete_tirage,
--    réglable par un administrateur) : on tire la rareté, puis une créature au
--    hasard parmi celles de cette rareté. La colonne creature.poids disparaît.
-- 2. Seules les légendaires ont un stock. Pour les autres, stock_total et
--    stock_restant valent NULL : illimité.
-- 3. Un booster contient de 3 à 10 cartes (au lieu de 1 à 10).
-- 4. Historique des tirages (booster_carte) : qui, quand, quelle carte, quelle
--    rareté, et pourquoi (tirage normal ou garantie du premier booster). Il
--    remplace les stocks pour le taux observé et utilisateur.dernier_booster
--    pour le nombre de boosters ouverts par jour.
--
-- Ré-exécutable : appliqué à chaque lancement de scripts/appliquer.sh, avant
-- 02_catalogue.sql (qui n'insère plus de poids, ni de stock hors légendaires).
-- Les poids déjà réglés par un administrateur sont conservés.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- rarete_tirage : poids de tirage de chaque rareté
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rarete_tirage (
    rarete       varchar(20)  NOT NULL,
    poids        integer      NOT NULL,

    CONSTRAINT pk_rarete_tirage        PRIMARY KEY (rarete),
    CONSTRAINT ck_rarete_tirage_rarete CHECK (rarete IN ('COMMUN', 'PEU_COMMUN', 'RARE', 'LEGENDAIRE')),
    -- 0 retire la rareté du tirage ; le back exige commune + peu commune > 0
    CONSTRAINT ck_rarete_tirage_poids  CHECK (poids BETWEEN 0 AND 1000)
);

INSERT INTO rarete_tirage (rarete, poids)
VALUES ('COMMUN', 70), ('PEU_COMMUN', 20), ('RARE', 8), ('LEGENDAIRE', 2)
ON CONFLICT (rarete) DO NOTHING;

COMMENT ON TABLE  rarete_tirage       IS 'Poids de tirage par rareté, réglables par un administrateur';
COMMENT ON COLUMN rarete_tirage.poids IS 'Proba d''une rareté = poids / somme des poids des raretés encore tirables (règle d''exclusion : backend/app/draw.py)';

-- -----------------------------------------------------------------------------
-- creature : plus de poids, stock réservé aux légendaires
-- -----------------------------------------------------------------------------
ALTER TABLE creature DROP CONSTRAINT IF EXISTS ck_creature_poids;
ALTER TABLE creature DROP COLUMN IF EXISTS poids;

ALTER TABLE creature DROP CONSTRAINT IF EXISTS ck_creature_stock_total;
ALTER TABLE creature DROP CONSTRAINT IF EXISTS ck_creature_stock_restant;
ALTER TABLE creature DROP CONSTRAINT IF EXISTS ck_creature_stock_legendaire;
ALTER TABLE creature ALTER COLUMN stock_total   DROP NOT NULL;
ALTER TABLE creature ALTER COLUMN stock_restant DROP NOT NULL;

UPDATE creature SET stock_total = NULL, stock_restant = NULL
WHERE rarete <> 'LEGENDAIRE' AND stock_total IS NOT NULL;

ALTER TABLE creature ADD CONSTRAINT ck_creature_stock_total
    CHECK (stock_total >= 0);
-- NULL des deux côtés (illimité), ou 0 <= restant <= total
ALTER TABLE creature ADD CONSTRAINT ck_creature_stock_restant
    CHECK ((stock_total IS NULL) = (stock_restant IS NULL) AND stock_restant BETWEEN 0 AND stock_total);
-- Seules les légendaires (édition limitée) ont un stock
ALTER TABLE creature ADD CONSTRAINT ck_creature_stock_legendaire
    CHECK ((rarete = 'LEGENDAIRE') = (stock_total IS NOT NULL));

COMMENT ON COLUMN creature.stock_total   IS 'Exemplaires de l''édition limitée (légendaires) ; NULL = illimité';
COMMENT ON COLUMN creature.stock_restant IS 'Exemplaires encore tirables (légendaires) ; NULL = illimité. Une légendaire épuisée ne s''obtient plus que par échange';

-- -----------------------------------------------------------------------------
-- reglage : de 3 à 10 cartes par booster
-- -----------------------------------------------------------------------------
UPDATE reglage SET cartes_par_booster = 3 WHERE cartes_par_booster < 3;
ALTER TABLE reglage DROP CONSTRAINT IF EXISTS ck_reglage_cartes_par_booster;
ALTER TABLE reglage ADD  CONSTRAINT ck_reglage_cartes_par_booster
    CHECK (cartes_par_booster BETWEEN 3 AND 10);

-- -----------------------------------------------------------------------------
-- booster_carte : historique des cartes tirées, une ligne par carte
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS booster_carte (
    booster_id      uuid         NOT NULL,
    position        smallint     NOT NULL,
    utilisateur_id  uuid         NOT NULL,
    jour            date         NOT NULL,
    tire_le         timestamptz  NOT NULL DEFAULT now(),
    creature_id     integer      NOT NULL,
    rarete          varchar(20)  NOT NULL,
    motif           varchar(30)  NOT NULL,

    CONSTRAINT pk_booster_carte             PRIMARY KEY (booster_id, position),
    CONSTRAINT fk_booster_carte_utilisateur FOREIGN KEY (utilisateur_id)
        REFERENCES utilisateur (id) ON DELETE CASCADE,
    CONSTRAINT fk_booster_carte_creature    FOREIGN KEY (creature_id)
        REFERENCES creature (id)    ON DELETE RESTRICT,
    CONSTRAINT ck_booster_carte_position    CHECK (position BETWEEN 1 AND 10),
    CONSTRAINT ck_booster_carte_rarete      CHECK (rarete IN ('COMMUN', 'PEU_COMMUN', 'RARE', 'LEGENDAIRE')),
    CONSTRAINT ck_booster_carte_motif       CHECK (motif IN ('TIRAGE', 'GARANTIE_PREMIER_BOOSTER'))
);

-- Tableau de bord : boosters par jour, cartes par rareté sur une période ; boosters d'un joueur
CREATE INDEX IF NOT EXISTS ix_booster_carte_jour        ON booster_carte (jour);
CREATE INDEX IF NOT EXISTS ix_booster_carte_utilisateur ON booster_carte (utilisateur_id, jour);

COMMENT ON TABLE  booster_carte          IS 'Historique des tirages : une ligne par carte de chaque booster ouvert';
COMMENT ON COLUMN booster_carte.position IS 'Rang de la carte dans le booster (1 à 10) ; la plus rare est révélée en dernier';
COMMENT ON COLUMN booster_carte.jour     IS 'Jour du booster (heure de Paris), comme utilisateur.dernier_booster';
COMMENT ON COLUMN booster_carte.rarete   IS 'Rareté au moment du tirage';
COMMENT ON COLUMN booster_carte.motif    IS 'TIRAGE (selon les poids) ou GARANTIE_PREMIER_BOOSTER (rare offerte au premier booster)';

COMMIT;
