/** P-04 : booster quotidien. */
import { test, expect } from '../../fixtures/player.ts'

test.describe('booster du jour (P-04)', () => {
  test(
    'le joueur ouvre son booster : 5 cartes rejoignent sa collection',
    { tag: ['@smoke', '@mobile'] },
    async ({ page, signIn, homePage, boosterPage, collectionPage }) => {
      await signIn('dresseur')
      await collectionPage.goto()
      const before = Number(await collectionPage.totalCards.textContent())

      await homePage.goto()
      await expect(homePage.boosterTile).toContainText('Disponible !')
      await homePage.boosterTile.click()

      await boosterPage.openAndReveal()
      await expect(boosterPage.cards).toHaveCount(5)

      await boosterPage.toCollection.click()
      await expect(page).toHaveURL(/\/collection$/)
      await expect(collectionPage.totalCards).toHaveText(String(before + 5))
    },
  )

  test('l’ouverture passe du sachet à la pile sans montrer le booster déjà ouvert', async ({
    page,
    signIn,
    boosterPage,
  }) => {
    await signIn('dresseur')
    await boosterPage.goto()
    await expect(boosterPage.toCollection).toBeHidden()

    // Note, dans l'ordre, ce que l'écran affiche entre le clic et la pile à révéler.
    await page.evaluate(() => {
      const body = document.body
      body.dataset.seen = ''
      new MutationObserver(() => {
        const text = document.querySelector('main')?.textContent ?? ''
        const seen = body.dataset.seen ? body.dataset.seen.split(',') : []
        for (const [label, mark] of [
          ['Voir ma collection', 'collection'],
          ['Tout révéler', 'pile'],
        ] as const) {
          if (text.includes(label) && !seen.includes(mark)) seen.push(mark)
        }
        body.dataset.seen = seen.join(',')
      }).observe(body, { childList: true, subtree: true, characterData: true })
    })
    await boosterPage.open()

    await expect(page.locator('body')).toHaveAttribute('data-seen', 'pile')
  })

  test('le joueur retourne une carte puis choisit de l’envoyer sur le tapis', async ({
    page,
    signIn,
    boosterPage,
  }) => {
    await signIn('dresseur')
    await boosterPage.goto()
    await boosterPage.open()

    await expect(page.getByRole('heading', { name: 'Chance réelle par carte' })).toHaveCount(0)
    const firstCard = boosterPage.cards.nth(0).locator('button')
    await firstCard.click()

    await expect(boosterPage.sendCard).toBeVisible()
    await expect(firstCard).toHaveClass(/rotate-y-180/)
    await boosterPage.sendCard.click()

    await expect(boosterPage.sendCard).toBeHidden()
    await expect(page.getByRole('button', { name: /^Retourner la carte 2,/ })).toBeEnabled()
  })

  test('un second booster est refusé le même jour', async ({ page, signIn, homePage, boosterPage }) => {
    await signIn('dresseur')
    await boosterPage.goto()
    await boosterPage.openAndReveal()

    // De retour sur la page : les cartes du jour, plus de sachet à ouvrir.
    await page.reload()
    await expect(boosterPage.nextBooster).toBeVisible()
    await expect(boosterPage.cards).toHaveCount(5)
    await expect(boosterPage.openButton).toBeHidden()

    await homePage.goto()
    await expect(homePage.boosterTile).toContainText('Déjà ouvert')
    await expect(homePage.boosterTile).toContainText('Revenez demain pour un nouveau booster.')
  })

  test('le booster est de nouveau disponible le lendemain', async ({ page, signIn, homePage, boosterPage }) => {
    // 23 h 50, heure de Paris : le booster du jour est ouvert juste avant minuit.
    await page.clock.install({ time: new Date('2026-11-17T23:50:00+01:00') })
    await signIn('dresseur')
    await boosterPage.goto()
    await boosterPage.openAndReveal()

    // Quinze minutes plus tard, c'est le lendemain (et la session est toujours active).
    await page.clock.fastForward('15:00')
    await homePage.goto()
    await expect(homePage.boosterTile).toContainText('Disponible !')
  })
})
