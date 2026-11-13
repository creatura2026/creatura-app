# Créatura pour Windows (.exe)

L'application joueur (`apps/player`, une PWA) empaquetée avec [Electron](https://www.electronjs.org/)
pour être distribuée en `.exe`. Le code de l'application n'est pas dupliqué : ce dossier ne contient
que l'emballage.

## Générer l'exe

Première fois, après `pnpm install` à la racine :

```sh
cp apps/desktop/config.example.json apps/desktop/config.json
```

Le modèle contient déjà le domaine du site, `https://creatura.creasmaloud.dev` : rien à modifier
tant qu'il ne change pas (voir [Trouver l'adresse du backend](#trouver-ladresse-du-backend)). Puis,
depuis la racine du dépôt :

```sh
pnpm desktop        # exe branché sur le backend AWS (adresse de config.json)
pnpm desktop:demo   # exe avec l'API simulée : aucun serveur, comptes de démonstration
```

Compter 3 à 5 minutes. Les fichiers arrivent dans `apps/desktop/release/` :

| Fichier | Usage |
|---|---|
| `Creatura-Setup-<version>.exe` | Installeur : raccourci dans le menu Démarrer, désinstallation depuis les paramètres Windows |
| `Creatura-<version>-portable.exe` | Un seul fichier, se lance sans installation |
| `latest.json` | Version, date, noms et tailles des deux exe : lu par le site pour proposer le téléchargement |

Le dossier est vidé à chaque build : il ne contient que la version qui vient d'être construite.
Les exe ne sont pas signés : au premier lancement, Windows SmartScreen demande une confirmation
(« Informations complémentaires » → « Exécuter quand même »).

Pour essayer sans produire d'exe (plus rapide) : `pnpm --filter desktop start` ou `start:demo`.
Depuis le terminal de VS Code, voir [Dépannage](#dépannage).

## Version

La version vient du champ `version` de [package.json](package.json) (actuellement `0.1.0`). Le
build la reporte dans le nom des fichiers, dans les propriétés de l'exe (clic droit → Propriétés →
Détails) et dans `latest.json`. Avant de publier une nouvelle version, l'augmenter :

```sh
cd apps/desktop
npm version patch --no-git-tag-version   # 0.1.0 → 0.1.1 (minor : 0.2.0, major : 1.0.0)
```

## Dans la CI

Le job « Application Windows » de [.github/workflows/ci.yml](../../.github/workflows/ci.yml)
construit l'exe sur un runner Windows, après le job « Front », à chaque push sur `main` ou
`develop` (pas sur les pull requests, pour ne pas consommer de minutes Windows à chaque mise à jour).

- **Adresse du backend** : variable `CUSTOM_DOMAIN` de l'environnement GitHub `production` du dépôt
  creatura-app (Settings → Environments → production), le domaine qui pointe sur CloudFront :
  `https://creatura.creasmaloud.dev` (https:// est ajouté s'il manque). Contrairement au domaine
  CloudFront, il ne change pas quand l'infra est recréée. Sans elle, la CI produit la version démo
  et le signale par un avertissement.
- **Échec** : le job est facultatif (`continue-on-error`) ; s'il échoue, la CI reste verte.
- **Récupérer l'exe** : page du run → section *Artifacts* → `creatura-windows-<version>` (les deux
  exe et `latest.json`).
- **Release** : pousser un tag `v<version>` (par exemple `v0.1.1`, identique à la version de
  `package.json`, sinon le job échoue) publie les fichiers dans une Release GitHub.

```sh
cd apps/desktop && npm version patch --no-git-tag-version && cd ../..
git commit -am "chore(desktop): version 0.1.1"
git tag v0.1.1 && git push --follow-tags
```

Le dépôt creatura-infra construit aussi l'exe au déploiement du front (job « Publish Windows app ») :
il le publie dans `telechargements/` avec l'adresse du site qu'il vient de mettre en ligne.

## Publier sur le site

La page d'accueil du site (avant connexion) propose l'exe dès qu'elle trouve
`/telechargements/latest.json` sur son domaine : bouton « Télécharger la version 0.1.0 », taille,
date et lien vers la version portable. Sans ce fichier, la section n'apparaît pas.

Pour publier, envoyer le contenu de `release/` (les deux exe et `latest.json`, pas les sous-dossiers)
dans le dossier `telechargements/` du bucket S3 du front :

```sh
aws s3 cp apps/desktop/release/ s3://<bucket-du-front>/telechargements/ --recursive \
  --exclude "*" --include "Creatura-*.exe" --include "latest.json"
```

Le nom du bucket est la sortie `bucket_name` de la stack `infra/` de creatura-infra. CloudFront ne
met pas en cache ce dossier (comportement par défaut) : la nouvelle version est visible tout de
suite. Les anciens exe peuvent rester : leurs noms contiennent la version et `latest.json` ne
pointe que vers le dernier. Autre dossier ou autre domaine : variable `VITE_DOWNLOADS_URL` au
build du front.

### En local, sans S3

`pnpm dev:player` (et `vite preview`) sert directement `apps/desktop/release/` sous
`/telechargements/` (plugin [apps/player/vite/localDownloads.ts](../player/vite/localDownloads.ts)) :

```sh
pnpm desktop        # produit release/ avec latest.json
pnpm dev:player     # http://localhost:5173 : la page d'accueil propose cet exe
```

Rien à copier ni à publier : après un nouveau `pnpm desktop`, recharger la page suffit. Seuls les
exe et `latest.json` à la racine de `release/` sont servis. Ce relais n'existe qu'en local : le site
en ligne lit le bucket S3.

## Trouver l'adresse du backend

L'adresse à donner est le **domaine du site**, `https://creatura.creasmaloud.dev`, jamais celle du
load balancer :

```
exe ──https──▶ creatura.creasmaloud.dev (CloudFront) ──▶ /api/*  ──▶ ALB ──▶ pods du back (EKS) ──▶ RDS
                                                    └─▶ sprites (S3)
```

L'ALB de l'EKS n'accepte que le trafic venant de CloudFront (`creatura-infra/eks/api.tf`) : une
connexion directe est refusée. Pour vérifier : `https://creatura.creasmaloud.dev/api/v1/health` doit
répondre `{"status":"ok","database":"ok"}`.

Le domaine du site ne change pas quand l'infra est recréée, contrairement au nom CloudFront
(`dxxxx.cloudfront.net`, sortie `cloudfront_domain_name` de la stack `infra/`). Ce nom CloudFront
reste utilisable, mais il faut alors mettre à jour `config.json` à chaque recréation, ou corriger un
exe déjà distribué (section suivante).

## Où l'exe lit l'adresse du backend

Au démarrage, l'exe prend la première adresse définie parmi :

| Priorité | Source | Quand s'en servir |
|---|---|---|
| 1 | Variable d'environnement `CREATURA_API_URL` | Test ponctuel |
| 2 | Fichier `creatura.json` **à côté de l'exe** | Corriger un exe déjà distribué, sans le reconstruire |
| 3 | Adresse inscrite dans l'exe au build | Cas normal |
| 4 | `http://localhost:8000` | Valeur par défaut |

Le fichier `creatura.json` a le même format que `config.json` :

```json
{ "apiUrl": "https://creatura.creasmaloud.dev" }
```

Pour l'installeur, il se pose dans le dossier d'installation (par défaut
`%LOCALAPPDATA%\Programs\Creatura\`). Pour l'exe portable, à côté du fichier `.exe`.

Au build, l'adresse vient de `--api`, sinon de `CREATURA_API_URL`, sinon de `config.json` :

```sh
pnpm desktop --api http://localhost:8000   # backend lancé en local (backend/README.md)
```

## Fichiers du dossier

| Fichier | Commité | Rôle |
|---|---|---|
| `main.cjs` | oui | Processus principal Electron : serveur local, relais de l'API, fenêtre |
| `scripts/build.cjs` | oui | Build : choisit l'adresse, construit la PWA dans `web/`, lance electron-builder |
| `electron-builder.yml` | oui | Paquets produits (installeur NSIS, portable), icône, nom |
| `config.example.json` | oui | Modèle de `config.json` |
| `config.json` | non | Adresse du backend pour vos builds |
| `app-config.json` | non | Généré au build, inscrit dans l'exe (`{ apiUrl, demo }`) |
| `web/` | non | Build de la PWA copié pour l'exe |
| `release/` | non | Exe produits et `latest.json`, à publier (voir [Publier sur le site](#publier-sur-le-site)) |

## Fonctionnement

L'exe démarre un petit serveur sur `http://127.0.0.1:47321`, visible de la machine seulement :

- il sert les fichiers de la PWA (`web/`) ; toute adresse sans extension renvoie `index.html`,
  comme l'Ingress ou CloudFront en ligne ;
- il relaie `/api/*` vers le backend, requêtes HTTP et WebSocket de la salle d'échange compris.

Le front appelle donc toujours `/api/v1` sur sa propre origine, comme dans le navigateur : son code
ne change pas, et le relais se faisant hors du navigateur, il n'y a pas de CORS à configurer côté
back. Si le backend ne répond pas, l'API renvoie une erreur 502 « Serveur injoignable » que l'app
affiche normalement.

Autres choix :

- **Port fixe** (variable `CREATURA_PORT` pour le changer) : la session et les données locales
  sont rattachées à l'origine `127.0.0.1:47321`, un port différent à chaque lancement les ferait
  perdre.
- **Pas de service worker** : l'exe contient déjà tous les fichiers, et un cache pourrait afficher
  l'ancienne version après une mise à jour.
- **Une seule instance** : relancer l'exe remet la fenêtre ouverte au premier plan.
- **Démo à part** : la version démo range ses données dans `%APPDATA%\Creatura Demo`, pour que ses
  comptes simulés ne se mélangent pas à une vraie session.
- **Liens externes** ouverts dans le navigateur par défaut, pas dans l'application.

## Dépannage

| Symptôme | Cause et solution |
|---|---|
| `Adresse du backend manquante` au build | Pas de `config.json` ni de `--api` : copier `config.example.json` en `config.json` |
| « Serveur injoignable » dans l'app | Mauvais domaine ou infra arrêtée : tester `https://<domaine>/api/v1/health`, puis corriger `creatura.json` |
| `Le port 47321 est déjà utilisé` | Un autre programme occupe le port : le fermer, ou lancer avec `CREATURA_PORT` |
| `pnpm --filter desktop start` n'ouvre pas de fenêtre depuis VS Code | Le terminal de VS Code définit `ELECTRON_RUN_AS_NODE=1`. Le script la retire ; pour lancer `Creatura.exe` depuis ce terminal : `$env:ELECTRON_RUN_AS_NODE=$null` (PowerShell) avant. Un double-clic n'est pas concerné |
| `pnpm install` n'a pas téléchargé Electron | `node apps/desktop/node_modules/electron/install.js` |
| Windows bloque l'exe | Exe non signé : « Informations complémentaires » → « Exécuter quand même » |

Seul Windows est produit. Un `.dmg` (macOS) demanderait de construire sur un Mac.
