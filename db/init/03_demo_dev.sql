-- =============================================================================
-- CREATURA - Données de démonstration (LOCAL / DEV UNIQUEMENT)
-- Ticket : AS-41
--
-- ⚠️  NE JAMAIS APPLIQUER EN PRODUCTION : les mots de passe sont publics.
--
-- Comptes créés (identifiant / mot de passe) :
--   admin   / admin     rôle ADMIN
--   joueur1 / joueur1   pseudo Alice
--   joueur2 / joueur2   pseudo Bob
--
-- Hash : bcrypt coût 10 via pgcrypto (format $2a$10$...), vérifiable par les
-- librairies bcrypt / bcryptjs du back.
--
-- Situation de départ = exemple du cahier des charges (slide 11) :
--   Alice : Moussou ×2, Flammille ×1     Bob : Brumel ×1, Moussou ×1
--   + un échange EN_ATTENTE : Alice propose 1 Moussou contre le Brumel de Bob
--
-- Ré-exécutable : les comptes déjà présents ne sont pas recréés.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- fournit crypt() et gen_salt()

-- Identifiants fixes : pratique pour les tests du back et du front
INSERT INTO utilisateur (id, pseudo, identifiant, mot_de_passe_hash, role)
VALUES
    ('00000000-0000-4000-8000-000000000001', 'Admin', 'admin',   crypt('admin',   gen_salt('bf', 10)), 'ADMIN'),
    ('00000000-0000-4000-8000-000000000002', 'Alice', 'joueur1', crypt('joueur1', gen_salt('bf', 10)), 'JOUEUR'),
    ('00000000-0000-4000-8000-000000000003', 'Bob',   'joueur2', crypt('joueur2', gen_salt('bf', 10)), 'JOUEUR')
ON CONFLICT ON CONSTRAINT uq_utilisateur_identifiant DO NOTHING;

-- Collections de départ
INSERT INTO collection (utilisateur_id, creature_id, quantite)
SELECT u.id, c.id, v.quantite
FROM (VALUES
    ('joueur1', 'Moussou',   2),
    ('joueur1', 'Flammille', 1),
    ('joueur2', 'Brumel',    1),
    ('joueur2', 'Moussou',   1)
) AS v(identifiant, nom, quantite)
JOIN utilisateur u ON u.identifiant = v.identifiant
JOIN creature    c ON c.nom         = v.nom
ON CONFLICT ON CONSTRAINT pk_collection DO NOTHING;

-- Un échange en attente, pour que le front ait quelque chose à afficher
INSERT INTO echange (id, proposeur_id, destinataire_id)
VALUES ('00000000-0000-4000-8000-0000000000e1',
        '00000000-0000-4000-8000-000000000002',   -- Alice propose
        '00000000-0000-4000-8000-000000000003')   -- à Bob
ON CONFLICT ON CONSTRAINT pk_echange DO NOTHING;

INSERT INTO echange_ligne (echange_id, creature_id, sens, quantite)
SELECT '00000000-0000-4000-8000-0000000000e1'::uuid, c.id, v.sens, 1
FROM (VALUES ('Moussou', 'OFFERT'), ('Brumel', 'DEMANDE')) AS v(nom, sens)
JOIN creature c ON c.nom = v.nom
ON CONFLICT ON CONSTRAINT pk_echange_ligne DO NOTHING;

-- Les légendaires distribuées ci-dessus sortent du stock (les autres sont illimitées) :
-- stock_restant = stock_total - cartes présentes dans les collections
UPDATE creature c
SET stock_restant = c.stock_total - coalesce(
        (SELECT sum(quantite) FROM collection WHERE creature_id = c.id), 0)
WHERE c.stock_total IS NOT NULL;

COMMIT;
