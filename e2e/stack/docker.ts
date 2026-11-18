/** Pilotage de la stack Docker des tests (compose.yaml) : démarrage, arrêt, SQL, redémarrage. */
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const COMPOSE_FILE = fileURLToPath(new URL('../compose.yaml', import.meta.url))

function compose(args: string[], options: { quiet?: boolean } = {}): string {
  return execFileSync('docker', ['compose', '-f', COMPOSE_FILE, ...args], {
    encoding: 'utf8',
    stdio: options.quiet ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit'],
  })
}

export function startStack() {
  compose(['up', '-d', '--build', '--wait'])
}

export function stopStack() {
  compose(['down', '-v'])
}

/** Exécute une requête SQL dans la base de la stack et renvoie sa sortie brute. */
export function sql(query: string): string {
  return compose(
    ['exec', '-T', 'db', 'psql', '-U', 'creatura', '-d', 'creatura', '-v', 'ON_ERROR_STOP=1', '-At', '-c', query],
    { quiet: true },
  )
}

/**
 * Simule le passage de minuit, comme `pass_midnight` des tests du back (backend/tests/conftest.py) :
 * les changements prévus « au prochain minuit » deviennent dus aujourd'hui.
 */
export function passMidnight() {
  sql(`
    UPDATE reglage SET suivant_a_partir_du = suivant_a_partir_du - 1 WHERE suivant_a_partir_du IS NOT NULL;
    UPDATE creature SET disponible_le = disponible_le - 1;
    UPDATE creature SET changement_le = changement_le - 1 WHERE changement_le IS NOT NULL;
  `)
}

/** Redémarre l'API (coupure de toutes les connexions, salles d'échange comprises). */
export function restartApi() {
  compose(['restart', 'api'])
  compose(['up', '-d', '--wait', 'api'])
}
