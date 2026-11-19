import { products, type Cart, type Harvest, type Ticket } from './domain'

/** Keep browser records saved before the bottle IDs were renamed readable. */
export function migrateStoredCart(cart: Partial<Cart> & { flask?: number; jug?: number }): Cart {
  const { flask, jug, ...rest } = cart
  return { ...rest, kecik: cart.kecik ?? cart.flask ?? 0, besar: cart.besar ?? cart.jug ?? 0, asam: cart.asam ?? 0, limau: cart.limau ?? 0 }
}

export function migrateStoredTicket(ticket: Ticket): Ticket {
  const cart = migrateStoredCart(ticket.cart)
  const splitId = (id: string) => ticket.varietyId && ticket.varietyId !== 'tebu-1' && ['kecik', 'besar'].includes(id) ? `${ticket.varietyId}-${id}` : id
  const splitCart = Object.fromEntries(Object.entries(cart).map(([id, quantity]) => [splitId(id), quantity]))
  splitCart.kecik ??= 0; splitCart.besar ??= 0
  return { ...ticket, varietyId: undefined, varietyName: undefined, cart: splitCart, ...(ticket.items ? { items: ticket.items.map(item => {
    const productId = splitId(item.productId === 'flask' ? 'kecik' : item.productId === 'jug' ? 'besar' : item.productId)
    const product = products.find(product => product.id === productId)
    if (product?.kind === 'bottle' && (ticket.varietyId || ['flask', 'jug'].includes(item.productId))) return { ...item, productId, name: item.name?.includes(' · ') ? item.name : `${ticket.varietyName || (productId.startsWith('tebu-2-') ? 'Tebu 2' : 'Tebu 1')} · ${item.name || product.name.split(' · ')[1]}`, size: ['flask', 'jug'].includes(item.productId) ? product.size : item.size }
    return product?.kind === 'addon' && item.size === '1 pouch' ? { ...item, size: ['flask', 'jug'].includes(item.productId) ? product.size : item.size } : item
  }) } : {}) }
}

export function migrateStoredHarvest(harvest: Harvest & { flaskQty?: number; jugQty?: number }): Harvest {
  const { flaskQty, jugQty, ...record } = harvest
  return { ...record, kecikQty: record.kecikQty ?? flaskQty ?? 0, besarQty: record.besarQty ?? jugQty ?? 0 }
}
