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
