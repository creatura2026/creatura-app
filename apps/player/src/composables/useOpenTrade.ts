/** Ouvre la salle d'échange avec un joueur (ou celle qui existe déjà) et y entre. */
import { useRouter } from 'vue-router'
import { errorMessage } from '@creatura/shared/api/types'
import { toast } from '@creatura/shared/toast'

import { useCreateTrade } from '@/api/queries'

export function useOpenTrade() {
  const router = useRouter()
  const create = useCreateTrade()
  return async (recipientId: string, wantedCreatureId?: string) => {
    try {
      const trade = await create.mutateAsync({ recipientId, wantedCreatureId })
      await router.push({ name: 'trade', params: { id: trade.id } })
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }
}
