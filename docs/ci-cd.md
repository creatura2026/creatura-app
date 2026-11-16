# CI/CD Creatura depuis develop

La CI conserve les tests SQL sur PostgreSQL 16 et les tests pytest. Les frontends sont vérifiés, testés en mode non interactif et construits pour un domaine commun : joueur à la racine, administration sous `/admin/`, API `/api/v1`, mocks désactivés.

Les images `creatura-backend` et `creatura-db` sont construites et publiées sur GHCR après les tests. Aucun conteneur frontend supplémentaire : le frontend AWS est un site statique S3/CloudFront.

Pour un push sur `develop`, les artefacts suivants sont produits :

- `frontend-dist-RUN-TENTATIVE` : archive `frontend.tar.gz` contenant `index.html` à la racine et `admin/index.html`, plus les assets. Son SHA-256 est inclus dans la release.
- `release-creatura-backend-RUN-TENTATIVE`, `release-creatura-db-RUN-TENTATIVE` : références immuables exactes des images construites.
- `creatura-release-RUN-TENTATIVE` : `release.json` avec commit, run, tentative et les deux images épinglées par digest.

Le dernier job appelle le workflow `deploy-aws.yml` du dépôt `creatura2026/creatura-infra` avec `ref=develop` et l'ID du run courant ainsi que sa tentative. Le déploiement attend la conclusion réussie du run, vérifie l'origine des artefacts, vérifie le SHA-256 du frontend, provisionne AWS et réutilise ces builds sans reconstruction. EKS tire directement les images de GHCR par digest, avec un Secret de lecture du registre privé. Ni ECS, ni copie ECR, ni CodeBuild dans cette chaîne.

## Configuration

Secret de dépôt `INFRA_REPO_TOKEN` : jeton GitHub disposant de **Actions: write** sur `creatura-infra`. Pas de clé AWS ici. Le workflow utilise déjà `GITHUB_TOKEN` avec `packages: write` pour publier les images.

Déployer d'abord la nouvelle CI/CD infra et enregistrer sa définition sur sa branche par défaut (contrainte GitHub pour `workflow_dispatch`). La configuration de la CI AWS est décrite dans le README principal de creatura-infra. Le nom `deploy-aws.yml`, la branche `develop` et les noms d'artefacts sont le contrat entre les deux dépôts.

Le job de notification échoue explicitement si la configuration est absente ou si GitHub refuse le déclenchement. Les artefacts restent disponibles pour un diagnostic ; la CI infra ne déploie jamais un run app échoué. Après correction d'un problème de notification, relancer toute la CI pour produire une release cohérente avec sa tentative.

Les PR exécutent les tests/builds sans publier ni déployer. Un push main ou un tag peut publier les images, mais ne déclenche pas de déploiement AWS automatique. Argo CD n'est pas utilisé pour ces mêmes ressources.

## Vérifications

Contrôler le workflow avec actionlint. Après fusion, vérifier la CI applicative complète et la chaîne AWS réelle ; les contrôles locaux des YAML ne remplacent pas les tests SQL, pytest, frontend et le déploiement du compte cible.

Les artefacts de chaque tentative ont des noms uniques. Une relance partielle dont il manque des artefacts est refusée : relancer tous les jobs. Aucun choix silencieux d'une autre version, aucun tag flottant pour le déploiement. Le marqueur de déploiement S3 empêche une ancienne release de remplacer une release plus récente, même si celle-ci a partiellement échoué.
