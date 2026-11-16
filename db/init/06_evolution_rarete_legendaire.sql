-- =============================================================================
-- CREATURA - Évolution du schéma : rareté LEGENDAIRE
-- Doc : db/docs/schema.md
--
-- Quatrième rareté, au-dessus de RARE (Serazou, DioDaLionseau). L'API l'expose
-- sous le code LEGENDARY.
--
-- Ré-exécutable : appliqué à chaque lancement de scripts/appliquer.sh, avant
-- 02_catalogue.sql qui contient les créatures légendaires.
-- =============================================================================

BEGIN;

ALTER TABLE creature DROP CONSTRAINT IF EXISTS ck_creature_rarete;
ALTER TABLE creature
    ADD CONSTRAINT ck_creature_rarete
    CHECK (rarete IN ('COMMUN', 'PEU_COMMUN', 'RARE', 'LEGENDAIRE'));

COMMIT;
