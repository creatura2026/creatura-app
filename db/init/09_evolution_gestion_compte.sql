-- =============================================================================
-- CREATURA - Évolution du schéma : gestion du compte (mot de passe, suppression)
-- Contrat : creatura-api.openapi.yaml (`PUT /me/password`, `DELETE /me`)
-- Doc     : db/docs/schema.md
--
-- 01_schema.sql ne se modifie plus : ce fichier le complète.
-- Ré-exécutable : appliqué à chaque lancement de scripts/appliquer.sh,
-- il ne recrée rien de ce qui existe déjà.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- utilisateur.supprime_le : compte supprimé par son titulaire.
--
-- La ligne n'est pas effacée : les échanges et la discussion des autres joueurs la
-- référencent (ON DELETE RESTRICT). Le back l'anonymise (pseudo « Joueur supprimé #… »,
-- identifiant libéré, mot de passe inutilisable), efface sa collection (les légendaires
-- retournent au stock) et abandonne ses échanges en cours. L'historique des boosters reste,
-- anonyme, pour les statistiques. Un compte supprimé ne peut plus se connecter.
-- -----------------------------------------------------------------------------
ALTER TABLE utilisateur ADD COLUMN IF NOT EXISTS supprime_le timestamptz;

-- -----------------------------------------------------------------------------
-- utilisateur.jetons_depuis : les jetons (JWT) émis avant cette date sont refusés.
-- Mis à jour au changement de mot de passe : les autres sessions sont déconnectées.
-- NULL : aucun jeton n'a été révoqué.
-- -----------------------------------------------------------------------------
ALTER TABLE utilisateur ADD COLUMN IF NOT EXISTS jetons_depuis timestamptz;

COMMIT;
