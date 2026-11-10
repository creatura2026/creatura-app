-- =============================================================================
-- CREATURA - Schéma de la base de données
-- Ticket  : AS-40
-- Cible   : PostgreSQL 16 (Docker en local, Amazon RDS en production)
-- Doc     : db/docs/schema.md
--
-- Règles :
--   * Ce fichier est la SEULE source du schéma. Le back lit la base,
--     il ne crée pas les tables (pas de synchronize / migrate côté ORM).
--   * Une fois appliqué en commun, ce fichier ne se modifie plus :
--     toute évolution passe par un nouveau fichier numéroté (03_..., 04_...).
--   * Toutes les contraintes sont nommées : le back traduit le nom reçu
--     dans l'erreur PostgreSQL en message d'API (voir db/README.md).
--     Préfixes : pk_ clé primaire, fk_ clé étrangère, uq_ unicité, ck_ CHECK,
--     ix_ index.
-- =============================================================================

BEGIN;  -- tout ou rien : si une instruction échoue, aucune table n'est créée

-- -----------------------------------------------------------------------------
-- utilisateur : comptes joueur et administrateur
-- -----------------------------------------------------------------------------
CREATE TABLE utilisateur (
    id                 uuid         NOT NULL DEFAULT gen_random_uuid(),
    pseudo             varchar(30)  NOT NULL,
    identifiant        varchar(50)  NOT NULL,
    mot_de_passe_hash  varchar(255) NOT NULL,
    role               varchar(10)  NOT NULL DEFAULT 'JOUEUR',
    dernier_booster    date,
    cree_le            timestamptz  NOT NULL DEFAULT now(),

    CONSTRAINT pk_utilisateur             PRIMARY KEY (id),
    CONSTRAINT uq_utilisateur_identifiant UNIQUE (identifiant),
    CONSTRAINT ck_utilisateur_role        CHECK (role IN ('JOUEUR', 'ADMIN')),
    CONSTRAINT ck_utilisateur_pseudo      CHECK (btrim(pseudo) <> ''),
    CONSTRAINT ck_utilisateur_identifiant CHECK (btrim(identifiant) <> '')
);

-- Pseudo unique sans tenir compte des majuscules : "Mama" et "mama" ne
-- peuvent pas coexister. (Index unique et non contrainte, car il porte sur
-- lower(pseudo) ; l'erreur renvoyée porte bien le nom uq_utilisateur_pseudo.)
CREATE UNIQUE INDEX uq_utilisateur_pseudo ON utilisateur (lower(pseudo));

COMMENT ON TABLE  utilisateur                   IS 'Comptes joueur et administrateur';
COMMENT ON COLUMN utilisateur.mot_de_passe_hash IS 'Hash bcrypt calculé par le back, jamais le mot de passe en clair';
COMMENT ON COLUMN utilisateur.dernier_booster   IS 'Dernier jour (heure de Paris) où un booster a été ouvert ; NULL si jamais';

-- -----------------------------------------------------------------------------
-- creature : catalogue des espèces (la rareté est portée par l'espèce)
-- -----------------------------------------------------------------------------
CREATE TABLE creature (
    id             integer      GENERATED ALWAYS AS IDENTITY,
    nom            varchar(50)  NOT NULL,
    description    text,
    famille        varchar(20)  NOT NULL,
    rarete         varchar(20)  NOT NULL,
    poids          integer      NOT NULL,
    image          varchar(255) NOT NULL,
    stock_total    integer      NOT NULL,
    stock_restant  integer      NOT NULL,

    CONSTRAINT pk_creature               PRIMARY KEY (id),
    CONSTRAINT uq_creature_nom           UNIQUE (nom),
    CONSTRAINT ck_creature_famille       CHECK (famille IN ('NATURE', 'CRISTAL', 'BRUME', 'LUEUR')),
    CONSTRAINT ck_creature_rarete        CHECK (rarete  IN ('COMMUN', 'PEU_COMMUN', 'RARE')),
    CONSTRAINT ck_creature_poids         CHECK (poids > 0),
    CONSTRAINT ck_creature_stock_total   CHECK (stock_total >= 0),
    CONSTRAINT ck_creature_stock_restant CHECK (stock_restant BETWEEN 0 AND stock_total)
);

COMMENT ON TABLE  creature               IS 'Catalogue des espèces de créatures';
COMMENT ON COLUMN creature.poids         IS 'Poids de tirage : proba = poids / somme des poids des créatures en stock';
COMMENT ON COLUMN creature.image         IS 'Chemin relatif (ex. images/moussou.png) ; le front ajoute l''URL du CDN';
COMMENT ON COLUMN creature.stock_restant IS 'Exemplaires encore tirables dans un booster (stock global)';

-- -----------------------------------------------------------------------------
-- collection : quantité possédée par joueur et par créature
-- -----------------------------------------------------------------------------
CREATE TABLE collection (
    utilisateur_id  uuid     NOT NULL,
    creature_id     integer  NOT NULL,
    quantite        integer  NOT NULL DEFAULT 0,

    CONSTRAINT pk_collection             PRIMARY KEY (utilisateur_id, creature_id),
    CONSTRAINT fk_collection_utilisateur FOREIGN KEY (utilisateur_id)
        REFERENCES utilisateur (id) ON DELETE RESTRICT,
    CONSTRAINT fk_collection_creature    FOREIGN KEY (creature_id)
        REFERENCES creature (id)    ON DELETE RESTRICT,
    -- Filet de sécurité : même si le back oublie une vérification, aucune
    -- carte ne peut être "consommée" deux fois.
    CONSTRAINT ck_collection_quantite    CHECK (quantite >= 0)
);

-- UC-08 : "quels joueurs possèdent cette créature ?"
CREATE INDEX ix_collection_creature ON collection (creature_id) WHERE quantite > 0;

COMMENT ON TABLE collection IS 'Cartes possédées : une ligne par (joueur, créature) ; doublons = quantite > 1';

-- -----------------------------------------------------------------------------
-- echange : en-tête d'un échange entre deux joueurs
-- -----------------------------------------------------------------------------
CREATE TABLE echange (
    id               uuid         NOT NULL DEFAULT gen_random_uuid(),
    proposeur_id     uuid         NOT NULL,
    destinataire_id  uuid         NOT NULL,
    statut           varchar(12)  NOT NULL DEFAULT 'EN_ATTENTE',
    cree_le          timestamptz  NOT NULL DEFAULT now(),
    decide_le        timestamptz,

    CONSTRAINT pk_echange              PRIMARY KEY (id),
    CONSTRAINT fk_echange_proposeur    FOREIGN KEY (proposeur_id)
        REFERENCES utilisateur (id) ON DELETE RESTRICT,
    CONSTRAINT fk_echange_destinataire FOREIGN KEY (destinataire_id)
        REFERENCES utilisateur (id) ON DELETE RESTRICT,
    CONSTRAINT ck_echange_statut       CHECK (statut IN ('EN_ATTENTE', 'ACCEPTE', 'REFUSE', 'ANNULE')),
    CONSTRAINT ck_echange_participants CHECK (proposeur_id <> destinataire_id),
    -- decide_le est vide tant que l'échange est en attente, rempli ensuite
    CONSTRAINT ck_echange_decision     CHECK ((statut = 'EN_ATTENTE') = (decide_le IS NULL))
);

-- "Mes échanges reçus en attente" et "mes échanges proposés"
CREATE INDEX ix_echange_destinataire_statut ON echange (destinataire_id, statut);
CREATE INDEX ix_echange_proposeur           ON echange (proposeur_id);

COMMENT ON TABLE echange IS 'En-tête d''un échange ; les cartes sont dans echange_ligne';

-- -----------------------------------------------------------------------------
-- echange_ligne : cartes d'un échange (n cartes contre n cartes)
-- -----------------------------------------------------------------------------
CREATE TABLE echange_ligne (
    echange_id   uuid        NOT NULL,
    creature_id  integer     NOT NULL,
    sens         varchar(8)  NOT NULL,
    quantite     integer     NOT NULL,

    CONSTRAINT pk_echange_ligne          PRIMARY KEY (echange_id, creature_id, sens),
    CONSTRAINT fk_echange_ligne_echange  FOREIGN KEY (echange_id)
        REFERENCES echange (id)  ON DELETE CASCADE,
    CONSTRAINT fk_echange_ligne_creature FOREIGN KEY (creature_id)
        REFERENCES creature (id) ON DELETE RESTRICT,
    CONSTRAINT ck_echange_ligne_sens     CHECK (sens IN ('OFFERT', 'DEMANDE')),
    CONSTRAINT ck_echange_ligne_quantite CHECK (quantite > 0)
);

COMMENT ON COLUMN echange_ligne.sens IS 'OFFERT = donnée par le proposeur ; DEMANDE = donnée par le destinataire';

COMMIT;
