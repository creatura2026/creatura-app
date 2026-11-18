-- =============================================================================
-- CREATURA - Évolution du schéma : rareté immédiate, stock au prochain minuit
-- Doc : db/docs/schema.md
--
-- Changement de règle (demande de l'administrateur) :
--   * nom, description, famille et RARETÉ d'une carte changent désormais TOUT DE SUITE ;
--   * seul le NOMBRE D'EXEMPLAIRES d'une édition limitée (légendaire) est différé au
--     prochain minuit (heure de Paris), et il ne peut QU'AUGMENTER.
--
-- Conséquences sur le schéma planifié (08_evolution_changements_planifies.sql) :
--   * la rareté n'est plus planifiée : `creature.rarete_suivante` n'est plus utilisée
--     (colonne conservée, toujours NULL) ;
--   * un changement en attente ne concerne plus que le stock : `creature.stock_suivant`
--     (nouveau total visé) + `creature.changement_le`.
--
-- Ré-exécutable : appliqué à chaque lancement de scripts/appliquer.sh ; ne recrée rien
-- de ce qui existe déjà et ne fait rien s'il n'y a pas de changement en attente.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- On solde les changements de rareté encore en attente de l'ancien modèle :
-- la rareté s'applique maintenant tout de suite, plus rien ne la planifie.
-- (Le stock prévu d'une légendaire à venir est abandonné : il sera reprogrammé
--  au besoin par l'administrateur.)
-- -----------------------------------------------------------------------------
UPDATE creature
SET rarete          = COALESCE(rarete_suivante, rarete),
    rarete_suivante = NULL,
    stock_suivant   = NULL,
    changement_le   = NULL
WHERE rarete_suivante IS NOT NULL OR changement_le IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Nouvelle contrainte : un changement en attente = une hausse de stock seule.
--   * changement_le ⇔ stock_suivant (l'un sans l'autre est interdit) ;
--   * la rareté n'est jamais planifiée (rarete_suivante toujours NULL) ;
--   * le stock visé est strictement positif.
-- -----------------------------------------------------------------------------
ALTER TABLE creature DROP CONSTRAINT IF EXISTS ck_creature_changement;
ALTER TABLE creature ADD  CONSTRAINT ck_creature_changement
    CHECK ((changement_le IS NULL) = (stock_suivant IS NULL)
           AND rarete_suivante IS NULL
           AND (stock_suivant IS NULL OR stock_suivant > 0));

COMMENT ON COLUMN creature.rarete_suivante IS 'Déprécié : la rareté change désormais tout de suite (toujours NULL)';
COMMENT ON COLUMN creature.stock_suivant   IS 'Nouveau total d''exemplaires visé pour l''édition limitée, appliqué le jour changement_le (hausse seule)';

-- -----------------------------------------------------------------------------
-- Application des changements dus : la partie carte ne traite plus qu'une hausse
-- de stock. Les nouveaux exemplaires (stock_suivant - stock_total) s'ajoutent au
-- pool tirable ; les exemplaires déjà possédés restent dans les collections.
-- (Les parties réglages/poids restent identiques à 08.)
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

    -- Hausse du stock d'une édition limitée : +(stock_suivant - stock_total) exemplaires tirables.
    UPDATE creature c
    SET stock_restant = c.stock_restant + (c.stock_suivant - c.stock_total),
        stock_total   = c.stock_suivant,
        stock_suivant = NULL,
        changement_le = NULL
    WHERE c.changement_le <= jour AND c.stock_suivant IS NOT NULL;
$$;

COMMIT;
