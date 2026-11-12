import { z } from 'zod'
import { malaysiaToday, activeOrderingWeek, testingOrderingWindow, isOfficeWeekday } from '../../shared/domain'
export const calendarDate = z.iso.date()
export function requireFutureDate(id: string) {
  const testing = String(useRuntimeConfig().public.testingCalendar) === 'true'
  // Production rejects today as well: id <= malaysiaToday().
  if (!calendarDate.safeParse(id).success || (testing ? id < malaysiaToday() : id <= malaysiaToday())) throw createError({ statusCode: 400, message: 'Choose an available delivery date.' })
  const limit = new Date(`${malaysiaToday()}T00:00:00Z`)
  limit.setUTCFullYear(limit.getUTCFullYear() + 1)
  if (id > limit.toISOString().slice(0, 10)) throw createError({ statusCode: 400, message: 'Choose a date within the next year.' })
}

export function requireActiveWeekDate(id: string, now = new Date()) {
  const testing = String(useRuntimeConfig().public.testingCalendar) === 'true'
  if (!testing && !isOfficeWeekday(id)) throw createError({ statusCode: 400, message: 'Office deliveries are available Monday to Friday only.' })
  // Production: const week = activeOrderingWeek(now)
  const week = testing ? testingOrderingWindow(now) : activeOrderingWeek(now)
  if (id < week.start || id > week.end) throw createError({ statusCode: 400, message: 'Orders are open for the active week only. Choose a date shown on the menu.' })
}
