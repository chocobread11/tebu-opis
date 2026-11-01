import { chromium } from 'playwright'
import assert from 'node:assert/strict'

const browser = await chromium.launch({ headless: true })
const baseUrl = process.env.TEBU_TEST_URL || 'http://127.0.0.1:3000'
const errors = []

// Sample rendered frames rather than only the final position: the reported bug
// happened during the opening animation and disappeared once it finished.
async function checkCentered(page, selector, trigger) {
  const [samples] = await Promise.all([
    page.evaluate(async selector => {
      const samples = []
      const start = performance.now()
      while (performance.now() - start < 850) {
        const element = document.querySelector(selector)
        if (element) {
          const rect = element.getBoundingClientRect()
          if (rect.top < innerHeight && rect.height > 0) {
            samples.push({ center: rect.x + rect.width / 2, viewportCenter: innerWidth / 2 })
          }
        }
        await new Promise(requestAnimationFrame)
      }
      return samples
    }, selector),
    trigger(),
  ])
  assert.ok(samples.length > 3, `Expected visible animation frames for ${selector}`)
  assert.ok(samples.every(sample => Math.abs(sample.center - sample.viewportCenter) < 1), `${selector} moved sideways during animation: ${JSON.stringify(samples)}`)
}

try {
  for (const width of [320, 390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 700 })
    const page = await context.newPage()
    page.setDefaultTimeout(15000)
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(baseUrl)
    await page.getByRole('button', { name: 'Add The Everyday Flask', exact: true }).waitFor()
    const layoutTransitions = await page.evaluate(() => {
      const findings = []
      for (const sheet of document.styleSheets) for (const rule of sheet.cssRules) {
        if (!rule.style?.transition) continue
        if (/(?:^|,)\s*(?:width|height|max-height|margin|padding)(?:\s|:)/.test(rule.style.transition)) findings.push(rule.cssText)
      }
      return findings
    })
    assert.deepEqual(layoutTransitions, [], 'Application CSS does not animate layout dimensions')
    assert.equal(await page.locator('.order-bar').count(), 0)

    // Any item reveals the bar; removing the last item removes it again.
    await page.getByRole('button', { name: 'Add Asam Boi', exact: true }).click()
    await page.locator('.order-bar').waitFor()
    await page.getByRole('button', { name: 'Remove Asam Boi', exact: true }).click()
    await page.locator('.order-bar').waitFor({ state: 'detached' })
    await page.getByRole('button', { name: 'Add The Everyday Flask', exact: true }).click()
    await checkCentered(page, '.drawer-content', () => page.getByRole('button', { name: 'LOCK MY BOTTLE' }).click())
    await checkCentered(page, '.drawer-content', () => page.getByRole('button', { name: 'Close checkout' }).click())
    await page.locator('.drawer-content').waitFor({ state: 'detached' })
    await checkCentered(page, '.drawer-content', () => page.getByRole('button', { name: 'LOCK MY BOTTLE' }).click())

    // A drag writes an inline transform, so it must also preserve centering.
    const handle = await page.locator('.drawer-handle').boundingBox()
    assert.ok(handle)
    await checkCentered(page, '.drawer-content', async () => {
      await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
      await page.mouse.down()
      await page.mouse.move(handle.x + handle.width / 2, handle.y + 50, { steps: 12 })
      await page.mouse.up()
    })
    if (await page.getByRole('button', { name: 'Close checkout' }).isVisible()) {
      await page.getByRole('button', { name: 'Close checkout' }).click()
    }
    await page.locator('.drawer-content').waitFor({ state: 'detached' })
    await page.getByRole('button', { name: 'Remove one The Everyday Flask', exact: true }).click()
    await page.locator('.order-bar').waitFor({ state: 'detached' })

    await page.getByRole('link', { name: 'Admin', exact: true }).click()
    await page.locator('.checklist-day').waitFor()
    assert.equal(await page.locator('.calendar-date').count(), 0, 'Checklist is limited to today')
    assert.equal(await page.locator('.metric-grid').count(), 0, 'Checklist stays free of summary cards')
    await page.getByRole('link', { name: 'Calendar', exact: true }).click()
    await page.locator('.admin-drop-picker').waitFor()
    const dates = page.locator('.admin-drop-picker').getByRole('group', { name: 'Delivery dates', exact: true })
    assert.ok(await dates.getByRole('button').count() >= 28, 'Admin dates use a full month calendar')
    await dates.locator('.calendar-date.available:not(.selected)').first().click()
    assert.equal(await page.locator('.manual-orders').count(), 1, 'Calendar includes manual order management')
    const headerBeforeScroll = await page.locator('.app-header').boundingBox()
    const navBeforeScroll = await page.locator('.bottom-nav').boundingBox()
    const frame = await page.locator('.app-shell').boundingBox()
    assert.ok(frame && frame.height <= 900, 'The app frame fits within the viewport')
    await page.locator('.app-content').evaluate(element => { element.scrollTop = element.scrollHeight })
    assert.deepEqual(await page.locator('.app-header').boundingBox(), headerBeforeScroll, 'Header stays in place while content scrolls')
    assert.deepEqual(await page.locator('.bottom-nav').boundingBox(), navBeforeScroll, 'Floating nav stays in place while content scrolls')
    assert.ok(navBeforeScroll && frame && Math.abs(frame.y + frame.height - navBeforeScroll.y - navBeforeScroll.height - (width >= 700 ? 8 : 10)) < 1, 'Navigation sits close to the bottom of the app frame')
    await page.getByRole('link', { name: 'Log', exact: true }).click()
    await checkCentered(page, '.record-dialog', () => page.getByRole('button', { name: 'Add expense', exact: true }).click())
    await checkCentered(page, '.record-dialog', () => page.getByRole('button', { name: 'Cancel', exact: true }).click())
    await page.locator('.record-dialog').waitFor({ state: 'detached' })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Horizontal overflow at ${width}px`)
    await context.close()
  }

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(baseUrl)
  await page.getByRole('button', { name: 'Add The Everyday Flask', exact: true }).click()
  await page.getByRole('button', { name: 'LOCK MY BOTTLE' }).click()
  const motion = await page.locator('.drawer-content').evaluate(element => ({ animation: getComputedStyle(element).animationName, transition: getComputedStyle(element).transitionDuration }))
  assert.equal(motion.animation, 'none')
  assert.equal(motion.transition, '0s')
  await page.getByRole('button', { name: 'Close checkout' }).click()
  await page.locator('.drawer-content').waitFor({ state: 'detached' })
  await context.close()
  assert.deepEqual(errors, [])
  console.log('PASS: conditional cart bar; centered sheets and dialogs; separate admin calendar; viewport frame with stable header and low floating nav; 320/390/1440px; reduced-motion support; no browser errors.')
} finally {
  await browser.close()
}
