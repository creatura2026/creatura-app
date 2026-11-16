import { describe, expect, it } from 'vitest'
import type { Trade } from '@creatura/shared/api/types'

import { abandonedByMe } from '@/composables/tradeSeats'

const ALICE = 'alice'
const BOB = 'bob'

function trade(status: Trade['status']): Trade {
  // Alice propose l'échange, Bob le reçoit.
  return {
    status,
    proposer: { id: ALICE, pseudo: 'Alice' },
    recipient: { id: BOB, pseudo: 'Bob' },
  } as Trade
}

describe('abandon d’un échange : qui l’a abandonné ?', () => {
  it('le proposant annule (CANCELLED) : c’est lui qui abandonne', () => {
    expect(abandonedByMe(trade('CANCELLED'), ALICE)).toBe(true)
    expect(abandonedByMe(trade('CANCELLED'), BOB)).toBe(false)
  })

  it('le destinataire refuse (REFUSED) : c’est lui qui abandonne', () => {
    expect(abandonedByMe(trade('REFUSED'), BOB)).toBe(true)
    expect(abandonedByMe(trade('REFUSED'), ALICE)).toBe(false)
  })

  it('un échange en cours, conclu ou échoué n’est pas un abandon', () => {
    for (const status of ['PENDING', 'ACCEPTED', 'FAILED'] as const) {
      expect(abandonedByMe(trade(status), ALICE)).toBeNull()
    }
  })
})
