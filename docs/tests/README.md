# Plan de tests — Créatura

Ce document décrit comment l'application Créatura est testée : la stratégie, les types de tests,
les outils, ce que lance la CI, et la liste des scénarios de bout en bout à écrire. Il couvre le
site joueur (`apps/player`), le dashboard admin (`apps/admin`), l'API (`backend/`), la base
(`db/`), l'application Windows (`apps/desktop`) et l'application Android (`apps/mobile`).

## Sommaire

1. [Objectifs](#1-objectifs)
2. [Types de tests](#2-types-de-tests)
3. [Stratégie](#3-stratégie)
4. [Outils](#4-outils)
5. [État actuel](#5-état-actuel)
6. [Ce que lance la CI](#6-ce-que-lance-la-ci)
7. [Tests unitaires et de composants](#7-tests-unitaires-et-de-composants)
8. [Tests d'intégration et fonctionnels (API et base)](#8-tests-dintégration-et-fonctionnels-api-et-base)
9. [Tests de bout en bout du site](#9-tests-de-bout-en-bout-du-site)
10. [Application Windows (.exe)](#10-application-windows-exe)
11. [Application Android (.apk)](#11-application-android-apk)
12. [Tests non fonctionnels](#12-tests-non-fonctionnels)
13. [Données de test](#13-données-de-test)
14. [Conventions d'écriture](#14-conventions-décriture)
15. [Lancer les tests en local](#15-lancer-les-tests-en-local)
16. [Rapports, couverture et critères de réussite](#16-rapports-couverture-et-critères-de-réussite)
17. [Recette manuelle](#17-recette-manuelle)
18. [Feuille de route](#18-feuille-de-route)
19. [Matrice de traçabilité](#19-matrice-de-traçabilité)

---

## 1. Objectifs

- Vérifier que chaque règle métier du cahier des charges (UC-01 à UC-14) est respectée, côté API
  comme côté écran.
- Détecter une régression avant qu'elle n'arrive sur `develop`, et bloquer une release qui casse
  un parcours critique : inscription, booster, échange, don, administration.
- Tester ce qui ne se voit qu'une fois tout assemblé : le WebSocket de la salle d'échange, le
  proxy de l'application Windows, la WebView de l'application Android.
- Garder une suite rapide et fiable : un test instable est corrigé ou mis en quarantaine, jamais
  ignoré.

## 2. Types de tests

| Type | Question posée | Exemple dans Créatura |
|---|---|---|
| **Statique** | Le code est-il bien typé et propre ? | `vue-tsc`, ESLint, oxlint |
| **Unitaire** | Une fonction ou un composant isolé fait-il ce qu'il doit, sans réseau ni base ? | `abandonedByMe` (`tradeSeats.spec.ts`), le tirage pondéré (`test_draw.py`) |
| **Composant** | Un composant Vue s'affiche-t-il et réagit-il correctement ? | `CreatureCard.spec.ts` |
| **Intégration** | Plusieurs briques réelles fonctionnent-elles ensemble ? | API + vrai PostgreSQL ; deux serveurs reliés par LISTEN/NOTIFY (`test_trades_multi.py`) |
| **Fonctionnel** | Une règle métier est-elle respectée, vue de l'extérieur ? | « un seul booster par jour », « transfert tout ou rien » via l'API |
| **Contrat** | L'API respecte-t-elle `creatura-api.openapi.yaml`, et le front utilise-t-il les bons types ? | Schemathesis, `schema.d.ts` régénéré et comparé |
| **Base de données** | Les contraintes SQL bloquent-elles les mauvaises données, avec le bon nom ? | `db/tests/test_schema.sql` |
| **Bout en bout (E2E)** | Un utilisateur arrive-t-il au bout de son parcours dans un vrai navigateur ? | Deux joueurs concluent un échange en temps réel |
| **E2E des paquets** | L'exe et l'APK construits démarrent-ils et fonctionnent-ils ? | Lancer l'exe, se connecter, ouvrir un booster |
| **Non fonctionnel** | Accessibilité, performance, sécurité, compatibilité | axe-core, k6, Trivy, OWASP ZAP |
| **Recette** | Un humain valide-t-il le produit sur de vrais appareils ? | Installer l'exe, l'APK sur un téléphone |

> **Fonctionnel ou intégration ?** Les deux mots ne s'opposent pas. *Fonctionnel* dit **ce que**
> l'on vérifie (une règle métier), *intégration* dit **comment** (plusieurs briques réelles).
> La plupart des tests `pytest` du back sont les deux : ils appellent l'API en HTTP, sur une vraie
> base, et vérifient une règle du cahier des charges. Les tests E2E sont fonctionnels eux aussi,
> mais vus depuis l'écran.

## 3. Stratégie

### Pyramide

```
                    ┌───────────┐
                    │  Recette  │  manuelle, avant une release
                  ┌─┴───────────┴─┐
                  │ E2E paquets   │  exe, APK : quelques parcours
                ┌─┴───────────────┴─┐
                │ E2E stack réelle  │  parcours critiques, WebSocket réel
              ┌─┴───────────────────┴─┐
              │ E2E API simulée       │  tous les parcours écran
            ┌─┴───────────────────────┴─┐
            │ API + base (pytest, SQL)  │  toutes les règles métier, cas limites
          ┌─┴───────────────────────────┴─┐
          │ Unitaires et composants       │  logique front, calculs, composants
          └───────────────────────────────┘
```

Chaque règle est testée **au niveau le plus bas possible**. Un cas limite (quantité négative,
pseudo déjà pris, carte disparue) se teste dans `pytest`, pas dans un navigateur. Les tests E2E
vérifient qu'un **parcours** fonctionne et que l'écran réagit correctement ; ils ne rejouent pas
toutes les variantes.

### Deux modes pour les tests E2E du site

| | API simulée | Stack réelle |
|---|---|---|
| Serveur | `vite --mode mock` (aucun back) | base (`db/`) + API (`backend/`) en Docker (`e2e/compose.yaml`), front construit sans API simulée et servi par `vite preview` (proxy `/api` et WebSocket) |
| Données | `localStorage` du navigateur, propre à chaque contexte | PostgreSQL en mémoire avec `CREATURA_DEMO=true`, repartie de zéro à chaque démarrage ; comptes créés par chaque test |
| Salle d'échange | simulée dans l'onglet (`trade-room.ts`) avec un **partenaire simulé** | **vrai WebSocket** `/api/v1/trades/{id}/live`, deux navigateurs |
| Ce qu'on teste | les écrans, la navigation, les messages d'erreur, les règles reproduites par le mock | l'intégration réelle front ↔ API ↔ base, le temps réel, les parcours entre le site et le dashboard admin |
| Vitesse | rapide, parallélisable | plus lent, base à préparer |
| Quand | à chaque PR | à chaque push sur `develop` et `main` |

L'API simulée ne relie que les joueurs **d'un même onglet** : un échange entre deux vrais
navigateurs n'est possible **qu'en stack réelle**. Les tests du WebSocket (§ 9.4) tournent donc
sur la stack réelle.

### Organisation des fichiers

```
e2e/                          paquet pnpm dédié aux tests de bout en bout
  playwright.config.ts        API simulée : un projet par app, par navigateur, mobile
  playwright.stack.config.ts  stack réelle (Docker)
  compose.yaml                stack réelle : base + API, ports 55432 et 58000
  fixtures/                   comptes, connexion, accessibilité ; stack.ts : navigateurs connectés
  pages/                      page objects : forms.ts (communs), player.ts, admin.ts
  specs/                      API simulée
    player/                   parcours joueur
    admin/                    parcours admin
  specs-stack/                stack réelle
    player/                   parcours joueur sur la vraie API
    admin/                    dashboard sur la vraie API
    realtime/                 salle d'échange : vrai WebSocket, deux navigateurs
    serial/                   tests qui touchent toute la stack (minuit, redémarrage de l'API)
  stack/                      démarrage de la stack, client de l'API, SQL, WebSocket
  specs-desktop/              application Windows : app/ (Electron sur la stack), exe/ (exe construit)
  desktop/                    préparation et lancement de l'application Electron
  playwright.exe.config.ts    tests de l'exe empaqueté (Windows)
  specs-android/              application Android (APK sur émulateur)
  android/                    construction des APK de test, pilotage de l'appareil (adb)
  playwright.android.config.ts  tests de l'APK
```

Les 3 tests qui étaient dans `apps/player/e2e` et `apps/admin/e2e` ont été déplacés dans
`e2e/specs/` (lot 1). Un paquet unique évite deux configurations Playwright et permet les scénarios qui
traversent le site et le dashboard.

Projets Playwright :

| Projet | Mode | Navigateur | Specs | État |
|---|---|---|---|---|
| `player-mock`, `admin-mock` | API simulée | Chromium | `player/`, `admin/` | en place |
| `player-mock-firefox`, `player-mock-webkit`, idem pour l'admin | API simulée | Firefox, WebKit | `player/`, `admin/` | en place |
| `player-mobile`, `player-mobile-ios` | API simulée | Pixel 7 (Chromium), iPhone 14 (WebKit) | `player/` (étiquette `@mobile`) | en place |
| `stack-player`, `stack-admin`, `stack-realtime` | stack réelle | Chromium | `specs-stack/player/`, `admin/`, `realtime/`, en parallèle | en place |
| `stack-serial` | stack réelle | Chromium | `specs-stack/serial/`, après les autres, un test à la fois | en place |
| `stack-desktop` | stack réelle et démo | Electron (non empaqueté) | `specs-desktop/app/`, un test à la fois | en place |
| `playwright.exe.config.ts` | sans serveur | exe Windows construit | `specs-desktop/exe/` | en place |

## 4. Outils

| Outil | Rôle | Statut |
|---|---|---|
| [Vitest](https://vitest.dev) 4 + jsdom | Tests unitaires et de composants du front | en place |
| [@vue/test-utils](https://test-utils.vuejs.org) 2 | Monter un composant Vue dans un test | en place |
| [Playwright](https://playwright.dev) 1.63 | E2E du site (Chromium, Firefox, WebKit), WebSocket, Electron | en place (paquet `e2e/`) |
| [pytest](https://docs.pytest.org) 8 + `httpx` + `websockets` | Tests de l'API, WebSocket via `TestClient.websocket_connect` | en place |
| PostgreSQL 16 (service CI) | Base réelle des tests du back, même version que RDS | en place |
| `psql` + scripts SQL | Tests du schéma et des données de démo | en place |
| `vue-tsc`, ESLint, oxlint | Vérifications statiques du front | en CI |
| `@vitest/coverage-v8`, `pytest-cov` | Couverture de code, avec seuil | en CI |
| `@axe-core/playwright` | Accessibilité dans les tests E2E | en place |
| [Schemathesis](https://schemathesis.readthedocs.io) | Requêtes générées depuis l'OpenAPI, contre la vraie API | nuit |
| `openapi-typescript` | Vérifier que `schema.d.ts` correspond à l'OpenAPI | en CI |
| [k6](https://k6.io) | Charge de l'API et des salles d'échange (`e2e/load/charge.js`) | nuit |
| Playwright Android (`_android`) + émulateur | E2E de l'APK | en place, pas encore exécuté (§ 11) |
| Trivy, `pnpm audit`, `pip-audit`, OWASP ZAP (scan de l'API) | Sécurité : images, dépendances, API | nuit |
| [Ruff](https://docs.astral.sh/ruff/) | Lint du back (règles dans `backend/pyproject.toml`) | en CI |

## 5. État actuel

| Niveau | Où | Nombre | En CI |
|---|---|---|---|
| SQL (schéma, données de démo) | `db/tests/` | 2 scripts | oui |
| API + base (pytest) | `backend/tests/` | 125 tests, 15 fichiers ; couverture 92 % | oui |
| Unitaires front joueur | `apps/player/src/__tests__/` | 67 tests, 9 fichiers | oui |
| Unitaires front admin | `apps/admin/src/__tests__/` | 19 tests, 2 fichiers | oui |
| Unitaires `packages/shared` | `packages/shared/src/__tests__/` | 41 tests, 4 fichiers (le client HTTP et l'inactivité sont testés depuis le joueur) | oui |
| Contrôles de nuit | `.github/workflows/nightly.yml` | dépendances, images, contrat, charge, sécurité de l'API | chaque nuit |
| E2E joueur (API simulée) | `e2e/specs/player/` | 65 tests, 8 fichiers (dont 16 d'accessibilité) | oui |
| E2E admin (API simulée) | `e2e/specs/admin/` | 29 tests, 4 fichiers (dont 11 d'accessibilité) | oui |
| E2E multi-navigateurs et mobile | mêmes specs, Firefox, WebKit, Pixel 7, iPhone 14 | 282 exécutions en tout | push |
| E2E stack réelle | `e2e/specs-stack/` | 26 tests, 4 fichiers | push |
| Application Windows (Electron) | `e2e/specs-desktop/app/` | 7 tests | push (job `e2e-stack`, Linux) |
| Exe Windows construit | `e2e/specs-desktop/exe/` | 2 tests | push (job `desktop`, Windows) |
| APK | `e2e/specs-android/` | 5 tests, **pas encore exécutés** | push (job `e2e-mobile`) |

Ce qui est déjà bien couvert côté back : comptes, booster, tirage, catalogue, collection,
échanges (dont la salle WebSocket, la concurrence et le multi-répliques), dons, comptes admin,
expiration de session.

## 6. Ce que lance la CI

Le workflow est [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) (nom affiché : **CI**).

### Aujourd'hui

| Déclencheur | Tests lancés | Autres étapes |
|---|---|---|
| Pull request | SQL (schéma, données), Ruff + pytest avec couverture (≥ 90 %), lint, **contrat** (`schema.d.ts` à jour), type-check + build du front, Vitest avec couverture (planchers), E2E sur l'API simulée (Chromium) | images Docker construites, pas publiées |
| Push sur `develop` ou `main` | les mêmes, l'E2E simulé dans Firefox, WebKit, Pixel 7 et iPhone 14, l'**E2E sur la stack réelle** avec l'application Electron (job `e2e-stack`), et l'**exe construit** (job `desktop`), l'**APK sur émulateur** (job `e2e-mobile`) | images publiées sur GHCR si tous les tests sont verts (E2E compris) ; exe et APK publiés s'ils passent leurs tests |
| Tag `v*` | les mêmes | Release GitHub (exe, APK) |
| Chaque nuit (`nightly.yml`) | `pnpm audit`, `pip-audit`, Trivy (images), Schemathesis, k6, OWASP ZAP (API) | rapports en artefact, rien n'est publié |

Les jobs exe et APK sont en
`continue-on-error` : leur échec ne fait pas échouer la CI.

### Cible

| Déclencheur | Tests lancés | Durée visée |
|---|---|---|
| Pull request | statique (type-check, **lint**), unitaires + **couverture**, pytest, SQL, **contrat** (`schema.d.ts` à jour), **E2E simulé (Chromium)** | < 10 min |
| Push sur `develop` | tout ce qui précède + **E2E simulé (Firefox, WebKit, mobile)** + **E2E stack réelle** + **Electron (Linux)** + **smoke exe (Windows)** + **smoke APK (émulateur)** | < 25 min |
| Push sur `main`, tag `v*` | comme `develop` ; sur un tag, l'échec d'un smoke exe ou APK **bloque** la Release | < 25 min |
| Nuit (`schedule`) | charge k6, OWASP ZAP baseline, Schemathesis complet, `pnpm audit`, `pip-audit`, Trivy | — |

Nouveaux jobs à ajouter :

```
detect ─┬─ db
        ├─ backend
        └─ frontend ──┬─ e2e-mock          (PR et push)
                      ├─ e2e-stack         (push)  ← images db + backend du même commit
                      ├─ desktop ── e2e-desktop (push)
                      └─ mobile  ── e2e-mobile  (push)
```

## 7. Tests unitaires et de composants

**Outils :** Vitest + jsdom + @vue/test-utils. **Emplacement :** `src/__tests__/` de chaque app
et de `packages/shared`.

| Où | Ce qui est testé |
|---|---|
| joueur | API simulée (comptes, booster dont deux ouvertures simultanées et un second onglet, collection, échanges), **dons** (`gifts.spec.ts` : accepter, refuser, annuler, rôles, don échoué, dons impossibles, listes), **`useTradeRoom`** (état tenu par `init`, `trade`, `chat` sans doublon, `presence`, `error` ; messages envoyés ; collection rafraîchie à la conclusion ; sortie de la salle), client HTTP et WebSocket (faux `WebSocket`), expiration de session, abandon d'un échange, téléchargements, `CreatureCard` |
| admin | API simulée (statistiques, échanges, raretés, réglages, suppression validée par un autre admin, admin au mot de passe provisoire), **garde du routeur** (`router-guard.spec.ts` : connexion avec retour à la page demandée, joueur refusé, mot de passe provisoire, page de connexion déjà connecté, adresse inconnue) |
| `packages/shared` | adaptateur zod 4 → vee-validate (`forms.spec.ts` : messages par champ, chemins, champs obligatoires), dates à l'heure de Paris (minuit, heure d'été et d'hiver), mises en forme, outils de l'API simulée (recherche sans accents, pages, `Problem`), réglage par cookie, session, notifications, `useDebounced`, couleurs ; composants `RarityGems` (losanges), `TradeStatusBadge`, `ProgressBar` |

Encore à couvrir : `GiftCreatureForm` et `GiftCard` (quantité bornée, boutons selon le rôle),
`DeletionRequestDialog`, l'aperçu de `CreaturesView`, `usePeriod` (admin), et les hooks de
requêtes (`queries.ts`), aujourd'hui couverts seulement par les tests E2E.

## 8. Tests d'intégration et fonctionnels (API et base)

**Outils :** pytest, `fastapi.testclient.TestClient` (HTTP et WebSocket), PostgreSQL 16 réel.
Chaque test part d'une base recréée depuis `db/init/` (`conftest.py`).

Ces tests sont la **référence des règles métier** : un cas limite se teste ici.

- **Lint** : Ruff, règles `E4 E7 E9 F I B N UP` (`backend/pyproject.toml`), en CI avant pytest.
- **Couverture** : `pytest-cov`, **92 %** des lignes au lot 6, seuil bloquant à 90 % en CI.
  Les moins couverts : `views/trades.py` (70 %) et `realtime.py` (76 %), la salle d'échange.
- **Contrat** : en CI, `schema.d.ts` est régénéré depuis `creatura-api.openapi.yaml` et doit être
  identique au fichier commité. Chaque nuit, Schemathesis génère environ 2 400 requêtes depuis
  le contrat contre la vraie API : aucune ne doit provoquer d'erreur serveur.
- **Pistes** : une table de toutes les routes admin appelées avec un jeton joueur (→ 403) et sans
  jeton (→ 401), pour qu'une nouvelle route ne soit jamais oubliée ; ajouter à `test_schema.sql`
  les contraintes des évolutions 10 (joueurs, admins) et 11 (dons).

## 9. Tests de bout en bout du site

**Outil :** Playwright. Étiquettes (`tag`) : `@smoke` (parcours critique), `@mobile` (rejoué sur
Pixel 7 et iPhone 14). Les tests de l'API simulée sont dans `specs/`, ceux de la stack réelle dans
`specs-stack/` : les données de départ diffèrent (comptes de démonstration d'un côté, comptes créés
par chaque test de l'autre), d'où des specs à part plutôt qu'une étiquette.

### 9.1 Mise en place

- `webServer` des projets simulés (joueur sur 5174, admin sur 5175) : en CI, build en mode simulé
  servi par `vite preview` (rapide et proche du site publié) ; en local, serveur de développement
  `vite --mode mock` (pas de build). `E2E_SERVER=preview` ou `dev` force l'un ou l'autre.
- Stack réelle : `stack/global-setup.ts` démarre `e2e/compose.yaml` (`docker compose up --build
  --wait`) et l'arrête après les tests ; les apps sont construites sans API simulée et servies par
  `vite preview` (joueur sur 5184, admin sur 5185), qui relaie `/api` et le WebSocket vers l'API
  (`API_PROXY_TARGET`). `E2E_STACK=external` : la stack tourne déjà ; `E2E_KEEP_STACK=1` : la garder
  après les tests.
- Animations réduites (`reducedMotion: 'reduce'`) : l'app les respecte, les tests vont plus vite.
- Service worker de la PWA bloqué : pas de cache d'un test à l'autre.
- Ports distincts pour le joueur et l'admin, pour lancer les deux ensemble.
- **Fixtures** :
  - `signIn(compte)` : connexion avec un compte de démonstration (API simulée) ;
  - `switchTo(compte)` : changer de compte dans le même test. En mode simulé, les comptes d'un
    même navigateur partagent les données : on offre une carte en Dresseur, on l'accepte en Lina.
    Côté admin, les données simulées vivent en mémoire : `switchTo` ne recharge pas la page et
    l'on navigue par le menu (`shell.open`) ;
  - `checkA11y()` : analyse axe-core de la page affichée (§ 12) ;
  - stack réelle (`stack/api.ts`, `fixtures/stack.ts`) :
    - `newPlayer()` crée un joueur au pseudo unique par l'API et lui fait ouvrir son booster (il a
      5 cartes) ; `newAdmin()` crée un admin prêt à l'emploi ; `signInAdmin()` : admin / admin ;
    - un compte (`Account`) prépare les données sans passer par l'écran : `oneCard()`,
      `openTrade()`, `gift()`, `collection()`, `quantityOf()`… ;
    - `openPlayer(compte)` / `openAdmin(compte)` ouvrent un navigateur connecté : plusieurs par
      test, pour mettre deux joueurs face à face ;
    - `RoomClient`, `concludeTrade()` : jouer dans une salle d'échange par le WebSocket ;
    - `recordRoomSocket(page)` enregistre les messages du WebSocket vus par une page ;
    - `passMidnight()` simule minuit en SQL (comme `pass_midnight` des tests du back),
      `restartApi()` redémarre le conteneur de l'API.
- **Page objects** légers, un par écran.
- Traces, captures et vidéo conservées **en cas d'échec** seulement.

### 9.2 Parcours joueur

| ID | Scénario | Mode |
|---|---|---|
| P-01 | Accueil → inscription → page d'accueil du joueur ; inscription refusée avec un identifiant déjà pris | mock, stack, mobile |
| P-02 | Connexion, erreur sans préciser quel champ est faux, déconnexion | mock, stack, mobile |
| P-03 | Session expirée après inactivité → retour à la connexion (horloge simulée avec `page.clock`) | mock |
| P-04 | Booster du jour : ouverture, cartes ajoutées à la collection ; second booster refusé le même jour | mock, stack, mobile |
| P-05 | Catalogue : recherche sans accents ni casse, fiche d'une créature, losanges de rareté, joueurs qui la possèdent | mock, stack |
| P-06 | Collection : filtres possédées, manquantes, doublons | mock, stack |
| P-07 | Nouvel échange : rechercher un joueur (correctif AS-72), ouvrir la salle | mock, stack |
| P-08 | Échange **1 carte contre 1 carte, avec le dernier exemplaire** (pas seulement des doublons) : les deux valident, chaque collection est à jour | mock (partenaire simulé), stack (2 navigateurs) |
| P-09 | Échange de plusieurs cartes de chaque côté ; discussion avec réponse de l'autre joueur et historique gardé | stack (discussion : mock) |
| P-10 | Modifier son tapis retire les deux validations ; tapis validé verrouillé ; validation refusée tant qu'un tapis est vide | mock, stack |
| P-11 | Refus par le destinataire, annulation par le proposant, abandon : salle fermée, rien n'est transféré | mock, stack |
| P-12 | Un seul échange ouvert entre deux joueurs : « nouvel échange » rouvre le premier | mock, stack |
| P-13 | Carte disparue avant la validation (donnée ou échangée ailleurs) : retirée du tapis, message aux deux joueurs | stack |
| P-14 | **Don** : offrir une carte → le destinataire accepte (transfert) ; refuser ; annuler par le donneur | mock, stack |
| P-15 | Don qui échoue : la carte a été donnée à quelqu'un d'autre entre-temps | mock, stack |
| P-16 | Profil : changer son mot de passe, se reconnecter avec le nouveau ; les autres sessions sont déconnectées | mock, stack (autres sessions : stack) |
| P-17 | Supprimer son compte (mot de passe demandé), plus de connexion possible ; l'autre joueur voit « Joueur supprimé » dans l'historique | mock (sans « Joueur supprimé »), stack |
| P-18 | Page inconnue → page 404 | mock |
| P-19 | Accueil : lien de téléchargement de l'exe (Windows) et de l'APK (Android) selon la plateforme | mock |

### 9.3 Parcours admin

| ID | Scénario | Mode |
|---|---|---|
| A-01 | Non connecté → `/connexion` puis retour sur la page demandée ; un joueur → « Accès refusé » | mock, stack |
| A-02 | Un 403 sur une **action** affiche une erreur sur place, sans rediriger vers « Accès refusé » | stack : Playwright répond 403 à l'enregistrement des réglages (`page.route`) |
| A-03 | Compte admin avec mot de passe à changer → forcé sur `/mot-de-passe`, puis accès au dashboard | mock, stack |
| A-04 | Dashboard : statistiques affichées (inscrits, boosters, échanges) | mock, stack |
| A-05 | Joueurs : liste, recherche, fiche de suivi d'un joueur | mock, stack |
| A-06 | **Suppression d'un joueur validée par un second admin** : l'admin A demande, A ne peut pas valider sa propre demande, l'admin B valide (deux contextes) | mock, stack |
| A-07 | Administrateurs : créer un compte admin, première connexion avec changement de mot de passe obligatoire | mock, stack |
| A-08 | Cartes : créer une carte avec son PNG, **aperçu** mis à jour pendant la saisie, modifier, losanges de rareté | mock, stack |
| A-09 | Raretés : distribution observée comparée au théorique, une ligne par rareté (les poids se règlent en A-10) | mock, stack |
| A-10 | Réglages : nombre de cartes par booster, appliqué au prochain minuit | mock, stack |
| A-11 | Échanges : supervision (liste, filtres, détail) | mock, stack |
| A-12 | Mon compte : changer son mot de passe | mock, stack |

### 9.4 Salle d'échange en temps réel (WebSocket)

Stack réelle seulement, deux contextes navigateur (Alice et Bob). Playwright permet d'**observer**
le WebSocket (`page.on('websocket')`, événements `framesent` / `framereceived`) et de
l'**intercepter** (`page.routeWebSocket`) pour simuler une coupure.

| ID | Scénario | Ce qu'on vérifie |
|---|---|---|
| WS-01 | Alice ouvre la salle | connexion à `/api/v1/trades/{id}/live`, premier message reçu `init` (échange, discussion, présents) |
| WS-02 | Bob entre dans la salle | Alice reçoit `presence` (`online: true`) et l'affiche |
| WS-03 | Alice pose une carte | message envoyé `offer` ; Bob reçoit `trade` et voit la carte **sans recharger** |
| WS-04 | Les deux valident | messages `ready` ; échange conclu affiché chez les deux en même temps |
| WS-05 | Discussion | `chat` reçu par l'autre ; historique retrouvé après rechargement |
| WS-06 | Bob ferme son onglet | Alice reçoit `presence` (`online: false`) |
| WS-07 | Coupure réseau (`routeWebSocket` ferme la connexion) | le client se reconnecte, reçoit un nouvel `init` avec l'état complet, aucune action perdue |
| WS-08 | Redémarrage de l'API (`docker compose restart api`, dans `serial/`) | reconnexion automatique (nouvel `init`), salle de nouveau active |
| WS-09 | Un troisième joueur ouvre l'URL de la salle | connexion fermée (code 1008), écran d'erreur |
| WS-10 | Message invalide (quantité supérieure à la possession) | l'écran n'envoie que des messages valides : règle couverte par le back (`test_trades.py`, `test_trade_validation`) |
| WS-11 | Annulation par l'API REST pendant que la salle est ouverte | les deux joueurs voient la salle fermée |

Aussi dans `specs-stack/realtime/` : P-08, P-09, P-13 (carte donnée ailleurs pendant l'échange,
retirée du tapis à la validation suivante) et la validation retirée quand un tapis change.

Le fonctionnement **avec plusieurs répliques de l'API** (bus LISTEN/NOTIFY) est déjà testé dans
`backend/tests/test_trades_multi.py`. Un test E2E optionnel peut lancer deux conteneurs API
derrière un répartiteur et placer Alice et Bob sur deux répliques différentes.

### 9.5 Parcours site ↔ dashboard

Stack réelle seulement : le site et le dashboard partagent la même API.

| ID | Scénario |
|---|---|
| X-01 | L'admin passe à 6 cartes par booster → encore 5 avant minuit, 6 après (réglage remis à 5 à la fin) |
| X-02 | L'admin crée une carte → absente du catalogue du joueur, puis présente après minuit (simulé) |
| X-03 | Un joueur est supprimé (deux admins) → il ne peut plus se connecter, ses échanges affichent « Joueur supprimé » |
| X-04 | Deux joueurs concluent un échange → il apparaît dans la supervision admin |

## 10. Application Windows (.exe)

L'exe n'est pas seulement le site dans une fenêtre. `apps/desktop/main.cjs` ajoute du code propre
à l'application, qui n'est **pas** couvert par les tests du site :

- un serveur local (`127.0.0.1:47321`) qui sert le front et **relaie `/api` et le WebSocket**
  vers le backend ;
- le choix de l'adresse du backend : `CREATURA_API_URL`, puis `creatura.json` à côté de l'exe,
  puis l'adresse inscrite au build, puis `http://localhost:8000` ;
- un dossier de données séparé pour la démo (`%APPDATA%\Creatura Demo`) ;
- l'installeur NSIS et la version portable.

**Outil :** Playwright pilote Electron (`_electron.launch`) : on garde les mêmes page objects que
pour le site. `e2e/desktop/app.ts` prépare des variantes de l'application dans
`e2e/.desktop-apps/` : le vrai `main.cjs`, son `app-config.json` (démo, ou branchée sur la stack)
et le site joueur construit pour elle. Les tests ne touchent donc ni à `apps/desktop/web` ni à la
configuration du poste. Chaque lancement a son port (`CREATURA_PORT`) et son dossier de données
(`CREATURA_USER_DATA`, ajouté à `main.cjs` pour les tests).

**Application non empaquetée, sur la stack réelle** (`e2e/specs-desktop/app`, projet
`stack-desktop` de `playwright.stack.config.ts`, un test à la fois : l'app n'accepte qu'une
instance) :

| ID | Scénario |
|---|---|
| D-01 | L'application démarre et affiche l'accueil, servi par son serveur local ; ses données sont dans le dossier du test |
| D-02 | Version démo, sans serveur : connexion de démonstration, booster ouvert |
| D-03 | Branchée sur la stack : connexion, booster ; **toutes** les requêtes `/api` visent le serveur local, qui relaie vers l'API |
| D-04 | **Salle d'échange à travers le proxy** : Alice dans l'app, Bob dans un navigateur, cartes vues en direct, échange conclu |
| D-05, D-06 | `CREATURA_API_URL` l'emporte sur l'adresse du build ; un serveur injoignable donne un message clair (« Le serveur Créatura (…) ne répond pas »), pas un écran blanc |
| D-07 | Un lien vers un autre site (navigation ou `window.open`) part dans le navigateur du système (`shell.openExternal`), l'app reste sur sa page |
| D-08 | Le serveur local sert les routes de l'app, un `registerSW.js` vide (pas de service worker), et rien hors du site |

**Exe empaqueté, sous Windows** (`e2e/specs-desktop/exe`, `playwright.exe.config.ts`) : l'exe
produit par `pnpm desktop`, toujours lancé avec un backend éteint (127.0.0.1) pour ne jamais
contacter le vrai serveur.

| ID | Scénario |
|---|---|
| E-01 | L'exe démarre et sert le site qu'il embarque |
| E-02 | `creatura.json` à côté de l'exe l'emporte sur l'adresse du build, et `CREATURA_API_URL` sur `creatura.json` (fichier remis en état après le test) |

Pourquoi deux systèmes : un runner Windows de GitHub ne lance pas de conteneurs Linux, donc pas la
stack. Le code de `main.cjs` est le même partout : les tests du proxy et du WebSocket tournent
sous Linux (Electron sous `xvfb`, job `e2e-stack`), et l'exe **réellement construit** est vérifié
sous Windows, dans le job `desktop`, juste après sa construction : s'il échoue, l'exe n'est ni
publié ni ajouté à la Release.

Non testé automatiquement : une adresse de backend invalide (Electron affiche une boîte de dialogue
bloquante), l'installation, la mise à jour et la désinstallation (le dossier `%APPDATA%\Creatura`
est bien effacé) : recette manuelle (§ 17).

## 11. Application Android (.apk)

Deux variantes : l'APK normal ouvre **le site en ligne** dans une WebView (Capacitor), avec une
page hors ligne ; l'APK de démo embarque le front et l'API simulée.

La plupart des parcours sont déjà vérifiés par les tests du site sur viewport mobile
(`player-mobile`). Ce qui reste propre à l'APK : l'installation et le lancement, la WebView et son
identifiant (`CreaturaAndroid`), le bouton retour d'Android, la page hors ligne, la session gardée
quand l'application est fermée.

**Outil : Playwright Android** (`_android`) plutôt que Maestro : un APK de debug autorise
l'inspection de sa WebView, que Playwright voit comme une page. Les page objects du site s'y
appliquent tels quels, et tout reste en TypeScript dans le même paquet. Les gestes Android (bouton
retour, fermeture, effacement des données) passent par `adb shell` (`e2e/android/device.ts`).

**APK de test** (`e2e/android/build-apks.ts`, `pnpm --filter e2e build:android`) : deux builds de
debug par `apps/mobile/scripts/build.cjs`, sans les secrets de signature. Les sorties du build de
`apps/mobile` (`release/`, `capacitor.config.json`…) sont sauvegardées puis remises en place.

- `demo.apk` : l'API simulée embarquée, l'application fonctionne sans réseau ;
- `offline.apk` : branché sur un site qui ne répond pas (`http://10.0.2.2:59999`, l'ordinateur
  hôte vu depuis l'émulateur) : la page hors ligne s'affiche à coup sûr, sans couper le réseau.

| ID | Scénario | APK |
|---|---|---|
| M-01 | L'application s'installe, démarre sur l'accueil, se sait dans l'APK (identifiant `CreaturaAndroid`, pas de lien « Télécharger pour Android ») | démo |
| M-02 | Connexion de démonstration, booster ouvert, collection | démo |
| M-03 | Site injoignable : la page « Connexion impossible » s'affiche, « Réessayer » pointe vers le site | hors ligne |
| M-04 | Bouton retour d'Android : revient à l'écran précédent, l'application reste au premier plan | démo |
| M-05 | La session survit à la fermeture complète (`am force-stop`) et à la réouverture | démo |

Chaque test part d'une application fermée et sans données (`pm clear`). Sans appareil visible par
adb, ou sans APK de test, les tests sont sautés en le disant.

En CI : job `e2e-mobile`, émulateur Android 14 (x86_64, KVM) sur runner Ubuntu
(`reactivecircus/android-emulator-runner`). Le job `mobile` l'attend : un APK n'est construit et
publié que si ses tests passent.

> **Pas encore exécutés.** Ces tests ont été écrits sans émulateur disponible (aucun SDK Android
> sur le poste de développement) : leur première exécution aura lieu au prochain push sur
> `develop`. Points à surveiller à ce moment-là : le nom de l'activité lancée
> (`fr.esigelec.creatura/.MainActivity`, celui que génère Capacitor), et le comportement du bouton
> retour (M-04), qui dépend de la gestion par défaut de Capacitor.

Le test sur un vrai téléphone reste en recette manuelle (§ 17).

## 12. Tests non fonctionnels

| Domaine | Ce qu'on vérifie | Outil | Quand |
|---|---|---|---|
| Accessibilité | Aucune violation grave (WCAG 2.1 A et AA) sur chaque écran du site et du dashboard (`accessibilite.spec.ts`), sous Chromium et WebKit : sous Firefox, l'analyse axe fait planter l'onglet sur les écrans chargés de cartes (booster, salle d'échange), un plantage du navigateur ; son résultat ne dépend pas du moteur | `@axe-core/playwright` | à chaque E2E simulé |
| Compatibilité | Chromium, Firefox, WebKit ; viewports téléphone et tablette | Playwright | push sur `develop` |
| Performance | 40 joueurs (connexion, accueil, catalogue, collection, booster) et 10 salles d'échange en WebSocket pendant 2 min ; seuils : < 1 % d'erreurs, 95 % des requêtes < 500 ms, entrée dans une salle < 1 s | k6 (`e2e/load/charge.js`) | nuit |
| Performance front (à faire) | Poids des bundles, score Lighthouse de l'accueil | Lighthouse CI | — |
| Sécurité | Dépendances (failles « high » et plus), images Docker (failles corrigibles « high » et plus), API (scan à partir du contrat) | `pnpm audit`, `pip-audit`, Trivy, OWASP ZAP | nuit |
| Robustesse de l'API | Aucune erreur serveur sur des requêtes générées depuis le contrat | Schemathesis | nuit |
| Sécurité (règles) | 401 sans jeton, 403 joueur sur les routes admin, salle d'échange réservée aux deux joueurs, jeton expiré | pytest (§ 8), WS-09 | à chaque PR |
| Résilience | Reconnexion du WebSocket, redémarrage de l'API, perte du bus | WS-07, WS-08, `test_trades_multi.py` | push |
| Visuel (optionnel) | Captures de référence des écrans clés | `toHaveScreenshot()` | à la demande |

**Accessibilité : toute violation grave fait échouer** (`e2e/fixtures/a11y.ts`, aucune règle
tolérée). Les défauts relevés au lot 2 ont été corrigés dans l'application :

| Règle axe | Où | Correction |
|---|---|---|
| `color-contrast` | sur-titres `.eyebrow` et textes bleus (4,3:1), textes atténués `text-ink/60` à `/75` (jusqu'à 3,7:1), heures des messages | bleu du thème foncé (`#4776bc` → `#3f6aab` : 5,1:1 sur crème, 5,4:1 sur blanc) ; textes atténués à `text-ink/80` au minimum (≥ 5:1 sur tous les fonds) ; texte indicatif des champs à `/70` |
| `label-content-name-mismatch` (WCAG 2.5.3) | logo « CREATURA » nommé « Créatura, accueil » ; lien du profil nommé « Mon profil » qui affiche le pseudo ; cartes cliquables de la salle d'échange, du nouvel échange et du booster | plus d'`aria-label` sur ces éléments : le nom part du texte affiché, complété par un texte réservé aux lecteurs d'écran (« CREATURA, accueil », « Lina_42, mon profil », « Poser Moussou sur mon tapis, 2 disponibles ») |

Les badges (« 2 », « × 2 », « ↔ ») portaient aussi un `aria-label` sur un simple `span`, ignoré par
certains lecteurs d'écran : le chiffre est caché aux lecteurs et un texte réservé le remplace.
Écrans vérifiés en plus au lot 7 : le booster (pile à révéler, puis cartes révélées), une salle
d'échange avec des cartes sur le tapis, le nouvel échange par carte.

**Défauts fonctionnels relevés par les tests :**

| Défaut | Où | Effet | État |
|---|---|---|---|
| Une carte posée juste après une autre remplaçait la première | `TradeRoomView.vue`, `add()` : le tapis était reconstruit depuis le dernier état confirmé par le serveur, qui remplace le tapis par la liste reçue | sur la vraie API, 2 fois sur 3 : le joueur posait 2 cartes, il en restait 1 | **corrigé** : le dernier tapis envoyé (`sentMat`) sert de base jusqu'à sa confirmation. Non-régression : `specs-stack/realtime`, « deux cartes posées coup sur coup » (16 exécutions sur 16) et P-09 |
| L'écran du booster « clignotait » à l'ouverture | `BoosterView.vue` : « Ouvrir sans déchirer » attend le rechargement des données du jour, qui contiennent déjà le booster ouvert, avant de poser la pile | « Voir ma collection » apparaissait un instant avant la pile à révéler | **corrigé** : le sachet reste affiché pendant l'ouverture. Non-régression : « l'ouverture passe du sachet à la pile sans montrer le booster déjà ouvert » (`booster.spec.ts`), qui échoue sur l'ancien code |
| Un second onglet pouvait ouvrir un second booster le même jour (API simulée seulement) | `apps/player/src/api/mock/db.ts` : chaque onglet gardait sa copie de la base et ne voyait pas les écritures des autres (même stockage, autre mémoire) | second booster, et écritures de l'autre onglet écrasées ; sans effet en production (le back est protégé). Deux clics dans **un même** onglet ne posaient pas de problème, contrairement à ce qu'indiquait le lot 2 | **corrigé** : la base est relue quand un autre onglet l'a modifiée. Tests unitaires : deux ouvertures simultanées, ouverture dans un autre onglet (`mock-api.spec.ts`) |
| Une page démesurée (`page=2**63`) provoquait une erreur 500 sur les listes paginées | `backend/app/dependencies.py` : l'OFFSET SQL débordait | 4 routes répondaient 500 au lieu de 400 (trouvé par Schemathesis) | **corrigé** : `page` ≤ 100 000, dans le back et le contrat ; test `test_page_number_is_bounded` |
| Les types générés (`schema.d.ts`) étaient en retard sur le contrat | dons, routes admin des cartes, des joueurs, des demandes de suppression et des comptes, `/me/password` absents ; types écrits à la main dans `types.ts` | le compilateur ne vérifiait pas ces appels contre le contrat | **corrigé** : régénéré, vérifié en CI ; deux erreurs de typage révélées dans `CreaturesView.vue` (famille et rareté en texte libre), corrigées |
| `pnpm --filter @creatura/shared generate:api` ne marchait pas | `packages/shared` appelait `openapi-typescript` sans l'avoir en dépendance | la commande documentée échouait | **corrigé** |
| Les réponses de l'API n'interdisaient pas au navigateur de deviner leur type | en-tête `X-Content-Type-Options` absent (scan OWASP ZAP) | risque faible | **corrigé** : `nosniff` sur toutes les réponses (`app/main.py`) ; test `test_responses_forbid_content_sniffing` |
| Images Docker avec une faille zlib corrigible | images de base `python:3.13-slim` et `postgres:16` pas encore reconstruites avec le correctif Debian | faille « high » (Trivy) | **corrigé** : `apt-get upgrade` au build ; `pip` retiré de l'image de l'API (inutile à l'exécution) |

**Points de sécurité connus et acceptés** (contrôles de nuit) :

- `pnpm audit` : une faille « high » ignorée dans `pnpm-workspace.yaml` (`auditConfig`), avec sa
  raison : **picomatch** (ReDoS, aucun correctif publié ; utilisé au build par vue-router, pas
  dans le site servi). La faille de **zod 3** est corrigée : passage à zod 4.6.7, avec un petit
  adaptateur vee-validate maison (`packages/shared/src/forms.ts`, testé), l'officiel
  `@vee-validate/zod` ne prenant en charge que zod 3.
- Trivy : `gosu`, binaire de l'image officielle `postgres:16` compilé avec une ancienne version
  de Go (26 failles, dont une critique). Il ne sert qu'au démarrage du conteneur ; exclu du scan
  jusqu'à une nouvelle image `postgres:16`.
- OWASP ZAP : jeton d'accès dans l'adresse du WebSocket (choix documenté du contrat : un
  navigateur n'envoie pas d'en-tête sur un WebSocket). L'en-tête `Cross-Origin-Resource-Policy`,
  absent au lot 6, est ajouté (`same-origin`, `app/main.py`, test
  `test_responses_cannot_be_embedded_by_other_origins`) : il ne concerne que les chargements sans
  CORS (`<img>`, `<script>`), pas les appels du site, de l'exe et de l'APK ni le WebSocket.

Une action faite pendant une reconnexion de la salle n'est pas envoyée : `http.ts` affiche alors
« Connexion à la salle d'échange en cours : réessayez dans un instant ». WS-08 attend donc la fin
de la reconnexion (nouvel `init`) avant d'agir.

## 13. Données de test

| Mode | Comptes | Remise à zéro |
|---|---|---|
| API simulée | boutons de démonstration de l'écran de connexion (`Dresseur`, `Administrateur`, `2e administrateur`, `Joueur (refusé)`) | nouveau contexte navigateur = `localStorage` vide |
| Stack réelle | `admin` / `admin` ; joueurs et autres admins créés par chaque test (`newPlayer()`, `newAdmin()`) | base en mémoire (tmpfs), repartie de zéro à chaque démarrage de la stack |
| pytest | créés par `conftest.py` | base recréée avant chaque test |

Règles en stack réelle :

- **Chaque test crée ses propres joueurs** (`newPlayer()`, pseudo unique) : les tests restent
  indépendants et parallélisables, et la limite d'un booster par jour ne bloque pas les suivants.
- Les comptes de démo joueurs (`joueur1`, `joueur2`) ne servent pas : leur booster du jour serait
  consommé par le premier test.
- Le second admin de A-06 et X-03 est créé par l'API (`newAdmin()`).
- Les réglages communs (cartes par booster) ne changent que dans `serial/`, remis à l'état initial
  à la fin.
- Les cartes nécessaires à un échange ou à un don sont obtenues par l'API (ouverture d'un
  booster), pas par l'écran.

## 14. Conventions d'écriture

- **Titres en français**, sous forme de phrase qui décrit le comportement :
  `un joueur conclut un échange avec son dernier exemplaire`.
- **Sélecteurs** : par rôle et texte visible (`getByRole`, `getByLabel`) ; `data-testid` seulement
  quand aucun rôle ne convient. Jamais de classe CSS.
- **Pas d'attente fixe** (`waitForTimeout`) : attendre un état (`expect(...).toBeVisible()`), un
  message WebSocket ou une réponse réseau.
- **Un test = un parcours** ; la préparation passe par l'API, pas par l'écran.
- **Indépendance** : un test ne dépend jamais de l'ordre ni du résultat d'un autre.
- **Instabilité** : un test instable est corrigé dans la semaine ou marqué `test.fixme` avec un
  ticket ; pas de `retries` en local, 2 en CI au maximum.
- Lint Playwright (`eslint-plugin-playwright`, déjà installé) et Vitest (`@vitest/eslint-plugin`).

## 15. Lancer les tests en local

```sh
# Front : unitaires
pnpm test:unit

# Back : base PostgreSQL locale nécessaire (voir backend/README.md)
cd backend && uv run pytest

# Base
cd db && docker compose up -d
docker exec creatura-db psql -U creatura -d creatura -v ON_ERROR_STOP=1 -f /db/tests/test_schema.sql

# E2E (la première fois : télécharger les navigateurs)
pnpm --filter e2e exec playwright install chromium firefox webkit
pnpm test:e2e                          # tous les projets
pnpm --filter e2e test:mock            # API simulée, Chromium (lance les serveurs Vite tout seul)
pnpm --filter e2e test:mock:all        # API simulée, tous les navigateurs et le mobile
E2E_SERVER=preview pnpm --filter e2e test:mock   # comme en CI : apps construites puis servies
pnpm --filter e2e test:ui              # mode interactif, pour écrire ou déboguer un test
pnpm --filter e2e report               # dernier rapport HTML
pnpm --filter e2e test:stack           # stack réelle (Docker doit tourner) ; la démarre et l'arrête
E2E_KEEP_STACK=1 pnpm --filter e2e test:stack    # la garder après les tests…
E2E_STACK=external pnpm --filter e2e test:stack  # … puis relancer sans la reconstruire
pnpm --filter e2e test:stack:ui        # mode interactif sur la stack réelle
pnpm --filter e2e test:desktop         # application Electron seule, sur la stack réelle
pnpm desktop && pnpm --filter e2e test:exe   # exe Windows construit (Windows seulement)
pnpm --filter e2e build:android        # APK de test (SDK Android et Java 21 requis)
pnpm --filter e2e test:android         # APK sur l'émulateur démarré (adb devices)
```

## 16. Rapports, couverture et critères de réussite

**Rapports conservés en artefact de CI :**

- pytest : JUnit et couverture (`reports/backend-tests.xml`, `backend-coverage.xml`) ;
- Vitest : couverture (`coverage/` de chaque paquet, artefact `coverage-frontend-…`) ;
- nuit : Schemathesis (JUnit), k6 (résumé JSON), ZAP (rapport HTML et JSON) ;
- Playwright : rapport HTML, traces des tests en échec ;
- Playwright Android : rapport HTML et traces des tests en échec (`playwright-report-android`) ;
- un résumé dans `GITHUB_STEP_SUMMARY` (tests passés, échoués, ignorés par job).

**Couverture** (mesurée au lot 6 ; en dessous du seuil, la CI échoue) :

| Partie | Mesurée (lignes) | Seuil |
|---|---|---|
| Back (`backend/app`) | 92 % | 90 % |
| Front joueur, logique `.ts` (API simulée, composables, stores) | 52 % | planchers juste sous la mesure, dans `vitest.config.ts` |
| Front admin, logique `.ts` | 55 % | idem |
| `packages/shared`, logique `.ts` | 29 % (le client HTTP et l'inactivité sont testés depuis le joueur) | idem |
| Écrans et composants `.vue` | non mesurés | couverts par les tests E2E |

Les planchers sont à remonter à chaque ajout de tests : la cible reste 80 % pour l'API simulée
et les composables.

**Critères de réussite :**

- *Merge d'une PR* : tous les jobs de test verts, aucun test `.only`, couverture pas en baisse.
- *Release (tag `v*`)* : CI verte sur `main`, smoke tests exe et APK verts, recette manuelle
  signée, aucun bug bloquant ou majeur ouvert.

**Gravité d'un bug :** *bloquant* (parcours critique impossible, perte de cartes), *majeur*
(fonction dégradée sans contournement), *mineur* (contournement possible), *cosmétique*.

## 17. Recette manuelle

À dérouler avant chaque release, sur les versions réellement publiées :

- [ ] Site en ligne : inscription, booster, échange entre deux téléphones, don
- [ ] Dashboard admin en ligne : création d'une carte, suppression d'un joueur à deux admins
- [ ] Exe : installation, raccourci, connexion, échange, mise à jour vers la version suivante,
      désinstallation (session effacée)
- [ ] Exe portable : démarrage sans installation
- [ ] APK : installation sur un vrai téléphone Android, échange en 4G, rotation de l'écran
- [ ] PWA : installation depuis Chrome Android et Safari iOS
- [ ] Page d'accueil : les liens de téléchargement mènent à la dernière version

## 18. Feuille de route

| Lot | Contenu | Livrable |
|---|---|---|
| 1. Socle ✅ | paquet `e2e/`, configuration Playwright, fixtures, page objects, migration des 3 tests ; job `e2e-mock` ; lint en CI | E2E simulé en CI sur chaque PR |
| 2. E2E simulé ✅ | P-01 à P-19, A-01 à A-12 en mode simulé ; projets mobile et multi-navigateurs ; axe-core | parcours écran couverts |
| 3. Stack réelle ✅ | `e2e/compose.yaml`, fixtures API, `specs-stack/`, **WS-01 à WS-11**, X-01 à X-04, A-02 ; job `e2e-stack` | intégration réelle et temps réel couverts |
| 4. Application Windows ✅ | D-01 à D-08 (Electron sur la stack, Linux), E-01 et E-02 (exe construit, Windows) ; jobs `e2e-stack` et `desktop` | exe testé avant publication |
| 5. Application Android ✍️ | M-01 à M-05 (Playwright Android) ; job `e2e-mobile` sur émulateur, qui conditionne la publication de l'APK. Écrit, **première exécution au prochain push** | APK testé avant publication |
| 6. Compléments ✅ | unitaires (shared, dons, `useTradeRoom`, garde du routeur), couverture et seuils (front et back), contrat (`schema.d.ts` en CI, Schemathesis), Ruff, contrôles de nuit (audits, Trivy, k6, ZAP) | qualité mesurée |
| 7. Corrections ✅ | contrastes et noms accessibles (règles axe de nouveau bloquantes), clignotement du booster, base simulée partagée entre onglets, zod 4, en-tête CORP (§ 12) | plus aucun défaut connu toléré par les tests |

## 19. Matrice de traçabilité

| Fonction | Unitaire / mock | API (pytest) | E2E |
|---|---|---|---|
| Comptes, connexion (UC-01, UC-02) | `mock-api.spec.ts` | `test_auth.py` | P-01, P-02 |
| Session et inactivité | `session-idle.spec.ts` | `test_session_idle.py` | P-03 |
| Booster quotidien (UC-03, UC-04) | `mock-api.spec.ts` | `test_booster.py`, `test_draw.py` | P-04, X-01 |
| Catalogue, collection (UC-05 à UC-07) | `mock-api.spec.ts`, `CreatureCard.spec.ts` | `test_catalog_collection.py` | P-05, P-06 |
| Joueurs et propriétaires (UC-08) | `mock-api.spec.ts` | `test_trades.py` (`test_creature_owners`) | P-05, P-07 |
| Échanges et salle (UC-09, UC-10) | `mock-api.spec.ts`, `http-api.spec.ts`, `tradeSeats.spec.ts` | `test_trades.py`, `test_trades_multi.py`, `test_bus.py` | P-07 à P-13, WS-01 à WS-11, D-04 |
| Dons | à ajouter | `test_gifts.py` | P-14, P-15 |
| Gestion du compte (UC-11) | — | `test_account.py` | P-16, P-17 |
| Dashboard admin (UC-12) | `admin/mock-api.spec.ts` | `test_admin.py` | A-04, A-11 |
| Catalogue admin (UC-13) | `admin/mock-api.spec.ts` | `test_admin_catalog.py` | A-08, A-09, A-10, X-02 |
| Joueurs et comptes admin (UC-14) | `admin/mock-api.spec.ts` | `test_admin_accounts.py` | A-01, A-03, A-05 à A-07, A-12, X-03 |
| Téléchargement et applications exe / APK | `useDesktopDownload.spec.ts`, `useAndroidDownload.spec.ts` | — | P-19, D-01 à D-08, E-01, E-02, M-01 à M-05 |

Les numéros d'UC ci-dessus suivent ceux du README racine et du contrat OpenAPI ; à corriger si le
cahier des charges les découpe autrement.
