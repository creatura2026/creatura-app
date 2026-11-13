-- =============================================================================
-- CREATURA - Évolution du schéma : changements de l'administrateur à minuit
-- Doc : db/docs/schema.md
--
-- Toute modification faite par un administrateur s'applique au prochain minuit
-- (heure de Paris), jamais en cours de journée :
-- 1. réglages des boosters : nombre de cartes et poids des raretés à venir
--    (reglage.cartes_par_booster_suivant, rarete_tirage.poids_suivant, à partir
--    de reglage.suivant_a_partir_du) ;
-- 2. nouvelles créatures : visibles et tirables à partir de creature.disponible_le ;
-- 3. rareté d'une créature existante (et stock si elle devient ou reste
--    légendaire) : creature.rarete_suivante / stock_suivant, à partir de
--    creature.changement_le.
--
-- La fonction creatura_appliquer_changements(jour) applique tout ce qui est dû ;
-- le back l'appelle avec la date du jour (heure de Paris) avant de lire ces données.
--
-- Ré-exécutable : appliqué à chaque lancement de scripts/appliquer.sh.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- reglage et rarete_tirage : valeurs à venir
-- -----------------------------------------------------------------------------
ALTER TABLE reglage ADD COLUMN IF NOT EXISTS cartes_par_booster_suivant integer;
ALTER TABLE reglage ADD COLUMN IF NOT EXISTS suivant_a_partir_du        date;
ALTER TABLE reglage DROP CONSTRAINT IF EXISTS ck_reglage_cartes_suivant;
ALTER TABLE reglage ADD  CONSTRAINT ck_reglage_cartes_suivant
    CHECK (cartes_par_booster_suivant BETWEEN 3 AND 10);

ALTER TABLE rarete_tirage ADD COLUMN IF NOT EXISTS poids_suivant integer;
ALTER TABLE rarete_tirage DROP CONSTRAINT IF EXISTS ck_rarete_tirage_poids_suivant;
ALTER TABLE rarete_tirage ADD  CONSTRAINT ck_rarete_tirage_poids_suivant
    CHECK (poids_suivant BETWEEN 0 AND 1000);

COMMENT ON COLUMN reglage.cartes_par_booster_suivant IS 'Nombre de cartes à appliquer à partir de suivant_a_partir_du (NULL : inchangé)';
COMMENT ON COLUMN reglage.suivant_a_partir_du        IS 'Jour (heure de Paris) où les réglages à venir (cartes, poids) s''appliquent';
COMMENT ON COLUMN rarete_tirage.poids_suivant        IS 'Poids à appliquer à partir de reglage.suivant_a_partir_du (NULL : inchangé)';

-- -----------------------------------------------------------------------------
-- creature : disponibilité et changement de rareté à venir
-- -----------------------------------------------------------------------------
ALTER TABLE creature ADD COLUMN IF NOT EXISTS disponible_le   date NOT NULL DEFAULT DATE '2000-01-01';
ALTER TABLE creature ADD COLUMN IF NOT EXISTS rarete_suivante varchar(20);
ALTER TABLE creature ADD COLUMN IF NOT EXISTS stock_suivant   integer;
ALTER TABLE creature ADD COLUMN IF NOT EXISTS changement_le   date;

ALTER TABLE creature DROP CONSTRAINT IF EXISTS ck_creature_rarete_suivante;
ALTER TABLE creature ADD  CONSTRAINT ck_creature_rarete_suivante
    CHECK (rarete_suivante IN ('COMMUN', 'PEU_COMMUN', 'RARE', 'LEGENDAIRE'));
-- Un changement a toujours une date ; un stock à venir seulement pour une légendaire
ALTER TABLE creature DROP CONSTRAINT IF EXISTS ck_creature_changement;
ALTER TABLE creature ADD  CONSTRAINT ck_creature_changement
    CHECK ((rarete_suivante IS NULL) = (changement_le IS NULL)
           AND (stock_suivant IS NOT NULL) = (rarete_suivante IS NOT DISTINCT FROM 'LEGENDAIRE')
           AND stock_suivant > 0);

COMMENT ON COLUMN creature.disponible_le   IS 'Jour (heure de Paris) à partir duquel la créature est visible et tirable';
COMMENT ON COLUMN creature.rarete_suivante IS 'Rareté à appliquer le jour changement_le (NULL : aucun changement prévu)';
COMMENT ON COLUMN creature.stock_suivant   IS 'Exemplaires à tirer de l''édition limitée quand rarete_suivante = LEGENDAIRE';

-- -----------------------------------------------------------------------------
-- Application des changements dus (idempotente, sans effet s'il n'y a rien à faire)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION creatura_appliquer_changements(jour date) RETURNS void
LANGUAGE sql AS $$
    UPDATE rarete_tirage t SET poids = t.poids_suivant, poids_suivant = NULL
    FROM reglage r
    WHERE r.id = 1 AND r.suivant_a_partir_du <= jour AND t.poids_suivant IS NOT NULL;

    UPDATE reglage
    SET cartes_par_booster         = coalesce(cartes_par_booster_suivant, cartes_par_booster),
        cartes_par_booster_suivant = NULL,
        suivant_a_partir_du        = NULL
    WHERE suivant_a_partir_du <= jour;

    -- Légendaire : stock_suivant nouveaux exemplaires à tirer ; les cartes déjà en
    -- collection comptent dans le total (stock_total = stock_restant + collections).
    UPDATE creature c
    SET rarete          = c.rarete_suivante,
        stock_restant   = CASE WHEN c.rarete_suivante = 'LEGENDAIRE' THEN c.stock_suivant END,
        stock_total     = CASE WHEN c.rarete_suivante = 'LEGENDAIRE' THEN c.stock_suivant
                              + coalesce((SELECT sum(quantite) FROM collection WHERE creature_id = c.id), 0) END,
        rarete_suivante = NULL,
        stock_suivant   = NULL,
        changement_le   = NULL
    WHERE c.changement_le <= jour;
$$;

COMMENT ON FUNCTION creatura_appliquer_changements(date) IS 'Applique les changements de l''administrateur prévus jusqu''à ce jour inclus';

COMMIT;
