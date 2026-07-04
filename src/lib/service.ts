import { addMonths, format, parseISO, differenceInDays } from 'date-fns'
import type { ServiceLogEntry, Watch } from '../types'

export interface ServiceDueInfo {
  /** Most recent full-service date, or null if none recorded. */
  lastFullService: string | null
  /** When the next service is due (explicit nextDueDate on the latest full
   *  service wins; otherwise lastFullService + serviceIntervalMonths).
   *  Null when it can't be derived — we don't alarm on guesses. */
  dueDate: string | null
  /** Days until due; negative = overdue. Null when dueDate is null. */
  daysUntil: number | null
}

export function serviceDue(watch: Watch, serviceLog: ServiceLogEntry[]): ServiceDueInfo {
  const full = serviceLog
    .filter((e) => e.watchId === watch.id && e.type === 'full-service')
    .sort((a, b) => b.date.localeCompare(a.date))
  const last = full[0] ?? null

  let dueDate: string | null = null
  if (last?.nextDueDate) {
    dueDate = last.nextDueDate
  } else if (last && watch.serviceIntervalMonths) {
    dueDate = format(addMonths(parseISO(last.date), watch.serviceIntervalMonths), 'yyyy-MM-dd')
  }

  const daysUntil =
    dueDate == null ? null : differenceInDays(parseISO(dueDate), new Date())

  return { lastFullService: last?.date ?? null, dueDate, daysUntil }
}
