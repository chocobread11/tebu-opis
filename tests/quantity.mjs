import { chromium } from 'playwright'
import assert from 'node:assert/strict'

const browser = await chromium.launch({ headless: true })
const baseUrl = process.env.TEBU_TEST_URL || 'http://127.0.0.1:3000'

async function checkStable(control, button) {
  await control.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }))
  const [frames] = await Promise.all([
    control.evaluate(async element => {
      const card = element.closest('article')
      const read = () => {
        const parent = card.getBoundingClientRect()
        const counter = element.getBoundingClientRect()
        const plus = element.querySelector('.quantity-increase').getBoundingClientRect()
        return [parent.width, parent.height, counter.x - parent.x, counter.y - parent.y, counter.width, counter.height, plus.x + plus.width / 2 - parent.x, plus.y + plus.height / 2 - parent.y]
      }
      const frames = [read()]
      const start = performance.now()
      while (performance.now() - start < 320) {
        await new Promise(requestAnimationFrame)
        frames.push(read())
      }
      return frames
    }),
    button.click(),
  ])
  assert.ok(frames.length > 3)
  assert.ok(frames.every(frame => frame.every((value, index) => Math.abs(value - frames[0][index]) < 0.5)), `Quantity change moved the card, control, or plus button: ${JSON.stringify(frames)}`)
}

try {
  for (const width of [320, 390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    const page = await context.newPage()
    page.setDefaultTimeout(15000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(baseUrl)
    for (const [name, price] of [['The Everyday Flask', 6], ['The Sharing Jug', 11], ['Asam Boi', 1], ['Limau Kasturi', 1]]) {
      const control = page.getByRole('group', { name: `${name} quantity`, exact: true })
      const plus = control.locator('.quantity-increase')
      const minus = control.locator('.quantity-decrease')
      const maximum = Number(await control.getByRole('spinbutton').getAttribute('aria-valuemax'))
      await control.waitFor()
      assert.equal(await minus.isDisabled(), true, 'Zero quantity disables the decrement button')
      const contentBeforeAdd = await page.locator('.app-content').boundingBox()
      await checkStable(control, plus) // 0 → 1, where the original layout jumped.
      await page.waitForFunction(() => !document.querySelector('.order-bar-slot')?.className.includes('enter-'))
      const item = page.getByRole('list', { name: 'Items in your order', exact: true }).getByRole('listitem')
      assert.equal(await item.count(), 1)
      assert.ok((await item.innerText()).includes(name), 'The overlay names the added item')
      assert.equal(await item.locator('.order-item-quantity').innerText(), '1×')
      assert.equal(await item.locator('.order-item-price').innerText(), `RM ${price.toFixed(2)}`)
      const header = await page.locator('.app-header').boundingBox()
      const orderBar = await page.locator('.order-bar').boundingBox()
      const content = await page.locator('.app-content').boundingBox()
      assert.deepEqual(content, contentBeforeAdd, 'Adding the first item does not move or resize the product area')
      assert.ok(header && orderBar && content && orderBar.y < header.y + header.height && orderBar.y + orderBar.height > header.y, 'The order bar overlays the header')
      assert.ok(header && content && Math.abs(content.y - header.y - header.height) < 1, 'The order bar reserves no space between the header and scrolling content')
      await page.locator('.app-content').evaluate(element => { element.scrollTop += 80 })
      const afterScroll = await page.locator('.order-bar').boundingBox()
      assert.ok(afterScroll && Object.keys(orderBar).every(key => Math.abs(afterScroll[key] - orderBar[key]) < 0.5), 'The top order bar stays in place when the products scroll')
      await checkStable(control, plus) // 1 → 2, without resizing the field.
      for (let count = 2; count < maximum - 1; count++) await plus.click()
      await checkStable(control, plus) // The final increment respects the current bottle-size limit.
      assert.equal(await item.locator('.order-item-quantity').innerText(), `${maximum}×`)
      assert.equal(await item.locator('.order-item-price').innerText(), `RM ${(price * maximum).toFixed(2)}`)
      assert.equal(await plus.isDisabled(), true)
      await checkStable(control, minus)
      for (let count = maximum - 1; count > 1; count--) await minus.click()
      await checkStable(control, minus) // 1 → 0 keeps the same footprint.
      assert.equal(await minus.isDisabled(), true)
    }
    await page.locator('.order-bar').waitFor({ state: 'detached' })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    assert.deepEqual(errors, [])
    await context.close()
  }
  console.log('PASS: stable bottle/add-on card size, counter and plus-button position during quantity changes at 320/390/1440px; order bar overlays the header without moving content and stays fixed during scrolling; quantity limits and cart clearing work.')
} finally {
  await browser.close()
}
