import { products, type Cart, type Harvest, type Ticket } from './domain'

/** Keep browser records saved before the bottle IDs were renamed readable. */
export function migrateStoredCart(cart: Partial<Cart> & { flask?: number; jug?: number }): Cart {
  return { kecik: cart.kecik ?? cart.flask ?? 0, besar: cart.besar ?? cart.jug ?? 0, asam: cart.asam ?? 0, limau: cart.limau ?? 0 }
}

export function migrateStoredTicket(ticket: Ticket): Ticket {
  return { ...ticket, cart: migrateStoredCart(ticket.cart), ...(ticket.items ? { items: ticket.items.map(item => {
    const productId = item.productId === 'flask' ? 'kecik' : item.productId === 'jug' ? 'besar' : item.productId
    const product = products.find(product => product.id === productId)
    if (product?.kind === 'bottle') return { ...item, productId, name: product.name, size: product.size }
    return product?.kind === 'addon' && item.size === '1 pouch' ? { ...item, size: product.size } : item
  }) } : {}) }
}

export function migrateStoredHarvest(harvest: Harvest & { flaskQty?: number; jugQty?: number }): Harvest {
  const { flaskQty, jugQty, ...record } = harvest
  return { ...record, kecikQty: record.kecikQty ?? flaskQty ?? 0, besarQty: record.besarQty ?? jugQty ?? 0 }
}
