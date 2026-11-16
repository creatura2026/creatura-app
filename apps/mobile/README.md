# Créatura pour Android (.apk)

L'application joueur empaquetée avec [Capacitor](https://capacitorjs.com/) pour être distribuée
en `.apk`. Comme pour [l'exe Windows](../desktop/README.md), ce dossier ne contient que
l'emballage : le projet Android (`android/`) est régénéré à chaque build et n'est pas commité.

## Fonctionnement

| Version | Ce que fait l'APK |
|---|---|
| Normale (`pnpm mobile`) | Ouvre le site en ligne (`https://creatura.creasmaloud.dev`) dans une WebView. Même domaine que le site : session, API et salle d'échange (WebSocket) fonctionnent sans CORS, et l'application suit chaque mise à jour du site sans nouvel APK. Sans réseau, une page « Connexion impossible » propose de réessayer. |
| Démo (`pnpm mobile:demo`) | Embarque toute l'application avec l'API simulée : fonctionne sans réseau ni serveur. |

L'APK ajoute `CreaturaAndroid` à l'identifiant du navigateur : le site ne propose pas de
télécharger l'application à quelqu'un qui l'utilise déjà.

## Générer l'APK

Prérequis : Java 21 et le SDK Android (installés par [Android Studio](https://developer.android.com/studio),
ou variable `ANDROID_HOME`). Première fois, après `pnpm install` à la racine :

```sh
cp apps/mobile/config.example.json apps/mobile/config.json
```

Puis, depuis la racine du dépôt :

```sh
pnpm mobile                                  # APK branché sur le site en ligne (config.json)
pnpm mobile --url http://10.214.8.245:5173   # APK branché sur un serveur de dev (pnpm dev --host)
pnpm mobile:demo                             # APK avec l'API simulée, sans serveur
```

Les fichiers arrivent dans `apps/mobile/release/`, vidé à chaque build :

| Fichier | Usage |
|---|---|
| `Creatura-<version>.apk` | L'application, à installer sur le téléphone |
| `android.json` | Version, date, version minimale d'Android, nom et taille de l'APK : lu par le site |

En local, `pnpm dev:player` sert ce dossier sous `/telechargements/` : la page d'accueil, ouverte
sur un téléphone, propose aussitôt l'APK.

## Signature

Android n'installe qu'un APK signé, et n'accepte une mise à jour que signée avec la même clé.

- **Sans clé** : APK signé avec la clé de debug de la machine. Il s'installe, mais un APK construit
  ailleurs (un autre run de CI) a une autre clé : il faut désinstaller l'ancienne version d'abord.
- **Avec une clé de publication** : définir les quatre variables `ANDROID_KEYSTORE_FILE`,
  `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` et `ANDROID_KEY_PASSWORD`.

Créer la clé une fois (la garder précieusement : la perdre empêche toute mise à jour) :

```sh
keytool -genkeypair -v -keystore creatura.jks -alias creatura -keyalg RSA -keysize 2048 -validity 10000
```

## Version

Le champ `version` de [package.json](package.json) devient le `versionName` de l'APK, et son
`versionCode` (`0.1.2` → `102`, `1.0.0` → `10000`). L'augmenter avant chaque nouvelle version :

```sh
cd apps/mobile
npm version patch --no-git-tag-version
```

## Dans la CI

Le job « Application Android » de [.github/workflows/ci.yml](../../.github/workflows/ci.yml)
construit l'APK sur `ubuntu-latest` (SDK Android fourni), après le job « Front », à chaque push
sur `main` ou `develop`, pas sur les pull requests.

- **Adresse du site** : variable `CUSTOM_DOMAIN` de l'environnement `production`, la même que pour
  l'exe. Sans elle : APK de démonstration, signalé par un avertissement.
- **Signature** : secrets de l'environnement `production` :

  | Secret | Valeur |
  |---|---|
  | `ANDROID_KEYSTORE_BASE64` | La clé encodée : `base64 -w0 creatura.jks` (PowerShell : `[Convert]::ToBase64String([IO.File]::ReadAllBytes("creatura.jks"))`) |
  | `ANDROID_KEYSTORE_PASSWORD` | Mot de passe du keystore |
  | `ANDROID_KEY_ALIAS` | `creatura` |
  | `ANDROID_KEY_PASSWORD` | Mot de passe de la clé (facultatif s'il est le même) |

  Sans eux : APK signé avec une clé de debug, signalé par un avertissement.
- **Échec** : le job est facultatif (`continue-on-error`) ; s'il échoue, la CI reste verte.
- **Récupérer l'APK** : page du run → section *Artifacts* → `creatura-android-<version>`.
- **Release** : sur un tag `v<version>`, l'APK est ajouté à la Release GitHub si
  `apps/mobile/package.json` a la même version que le tag.

## Fichiers du dossier

| Fichier | Commité | Rôle |
|---|---|---|
| `scripts/build.cjs` | oui | Build : pages embarquées, configuration Capacitor, projet Android, Gradle, `android.json` |
| `config.example.json` | oui | Modèle de `config.json` |
| `config.json` | non | Adresse du site pour vos builds |
| `capacitor.config.json` | non | Généré au build |
| `android/` | non | Projet Android généré par Capacitor (nom, version, icône et écran de lancement Créatura) |
| `web/` | non | Pages embarquées dans l'APK |
| `release/` | non | APK produit et `android.json` |

## Dépannage

| Symptôme | Cause et solution |
|---|---|
| `SDK Android introuvable` | Installer Android Studio, ou définir `ANDROID_HOME` |
| Gradle demande une autre version de Java | Capacitor 8 demande Java 21 : `java -version` |
| « Application non installée » sur le téléphone | Une version signée avec une autre clé est déjà installée : la désinstaller |
| Android bloque l'installation | Autoriser le navigateur (ou le gestionnaire de fichiers) à installer des applications inconnues |
| « Connexion impossible » dans l'application | Pas de réseau, ou site arrêté : tester l'adresse du site dans le navigateur du téléphone |
