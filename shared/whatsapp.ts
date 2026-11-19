export const defaultWhatsAppOpening = 'Hi {name}! Here is your Tebu Drop ticket {tag}. Check packing, pantry drop and collection status here:'
export const whatsAppOpeningMaxLength = 1000
export function renderWhatsAppOpening(template: string, ticket: { name: string; tag: string }) {
  return template.trim().replace(/\{(name|tag)\}/g, (_, field: 'name' | 'tag') => ticket[field])
}
