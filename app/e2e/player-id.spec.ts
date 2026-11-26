// A new signup must get a 6-character player ID (the rule from VTTER-82).
//
// This drives the DEPLOYED app and the real Cognito managed login, so it proves
// the live Lambda mints 6-character IDs -- a mocked test could not. Run on
// demand with `npm run e2e`; it needs the `ember-reach` AWS CLI profile.
import { expect, test } from '@playwright/test'
import { createUser, deleteUser, type Throwaway } from './throwaway-user.ts'

/** New IDs are 6 characters; the alphabet excludes 0 O 1 I L. */
const SIX = /^EMBER-[A-HJKMNP-Z2-9]{6}$/

let user: Throwaway | undefined

test.beforeAll(() => { user = createUser() })
// Runs even when the test fails, so a run never leaks a user into the pool.
test.afterAll(() => { deleteUser(user); user = undefined })

test('a brand-new signup gets a 6-character player ID', async ({ page }) => {
  expect(user, 'the throwaway user should have been created').toBeDefined()

  await page.goto('/')
  await page.getByRole('button', { name: /^sign in$/i }).first().click()

  // Cognito managed login. Its element ids are generated (formField:Rpnlt55:),
  // so select on the stable field names and the button role instead.
  await page.waitForURL(/amazoncognito\.com/)
  await page.locator('input[name="username"]').fill(user!.email)
  await page.locator('input[name="password"]').fill(user!.password)
  await page.getByRole('button', { name: /^sign in$/i }).click()

  // Cognito sends the code back to `/`, which is why that route must stay Home.
  // Wait for the signed-in Home to actually render: the app finishes the code
  // exchange on load, and asserting earlier races that bootstrap.
  await page.waitForURL(url => !url.hostname.includes('amazoncognito.com'))
  await expect(page.getByText(/^Welcome,/)).toBeVisible()

  // Navigate in-app rather than with page.goto(): tokens live in sessionStorage
  // and a fresh load would race the auth bootstrap, landing on the signed-out
  // landing page. Clicking through is also what a real player does.
  // The ID is minted lazily on the first GET /profile, so this is the moment
  // under test.
  await page.getByRole('link', { name: 'Settings' }).click()
  await expect(page).toHaveURL(/\/profile$/)

  const id = page.locator('code.player-id')
  await expect(id).toBeVisible()
  const text = (await id.innerText()).trim()

  // Logged so a run shows the real value it checked, not just a pass.
  console.log(`new signup received player ID: ${text}`)
  expect(text, `player ID was ${text}`).toMatch(SIX)
  expect(text.slice('EMBER-'.length)).toHaveLength(6)
  // Look-alike characters must never appear, so an ID read aloud is unambiguous.
  expect(text).not.toMatch(/[0OIL1]/)

  // A player ID "never changes" (ADR 0005), so re-reading must return the same
  // one rather than minting a second -- that would break friends and invites.
  // This stays in the same test because the app keeps tokens in sessionStorage,
  // which Playwright does not carry into a fresh test context.
  await page.reload()
  const again = (await page.locator('code.player-id').innerText()).trim()
  expect(again, 'the ID must not change between reads').toBe(text)
})
