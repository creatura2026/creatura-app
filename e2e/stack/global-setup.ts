/**
 * Démarre la stack réelle (base + API) avant les tests, et l'arrête après.
 *
 *  - E2E_STACK=external : la stack tourne déjà (lancée à la main), ne pas y toucher ;
 *  - E2E_KEEP_STACK=1   : la laisser tourner après les tests, pour enquêter.
 */
import process from 'node:process'

import { startStack, stopStack } from './docker.ts'

export default function globalSetup() {
  if (process.env.E2E_STACK === 'external') return
  startStack()
  return () => {
    if (!process.env.E2E_KEEP_STACK) stopStack()
  }
}
