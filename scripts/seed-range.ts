import { malaysiaToday } from '../shared/domain'

export function developmentSeedRange(now = new Date()) {
  const first = new Date(`${malaysiaToday(now)}T00:00:00Z`)
  first.setUTCDate(first.getUTCDate() + (5 - first.getUTCDay() + 7) % 7)
  const days = Array.from({ length: 9 }, (_, offset) => {
    const date = new Date(first)
    date.setUTCDate(date.getUTCDate() + offset)
    return date.toISOString().slice(0, 10)
  })
  return { start: days[0]!, end: days[8]!, restockDate: days[0]!, days, label: `${days[0]} – ${days[8]}` }
}
