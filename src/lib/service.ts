import { addMonths, format, parseISO, differenceInDays } from 'date-fns'
import type { ServiceLogEntry, Watch } from '../types'

export interface ServiceDueInfo {
  /** Most recent full-service date, or null if none recorded. */
  lastFullService: string | null
  /** When the next service is due. Priority:
   *    1. explicit nextDueDate on the latest full-service entry
   *    2. lastFullService + serviceIntervalMonths
   *    3. manufactureDate + serviceIntervalMonths (no service recorded yet —
   *       the movement was factory-fresh at manufacture, so that anchors the
   *       FIRST service for newer watches)
   *  Null when none of these are derivable — we don't alarm on guesses. */
  dueDate: string | null
  /** Days until due; negative = overdue. Null when dueDate is null. */
  daysUntil: number | null
  /** What the due date was derived from. */
  basis: 'service' | 'manufacture' | null
}

export function serviceDue(watch: Watch, serviceLog: ServiceLogEntry[]): ServiceDueInfo {
  const full = serviceLog
    .filter((e) => e.watchId === watch.id && e.type === 'full-service')
    .sort((a, b) => b.date.localeCompare(a.date))
  const last = full[0] ?? null

  let dueDate: string | null = null
  let basis: ServiceDueInfo['basis'] = null
  if (last?.nextDueDate) {
    dueDate = last.nextDueDate
    basis = 'service'
  } else if (last && watch.serviceIntervalMonths) {
    dueDate = format(addMonths(parseISO(last.date), watch.serviceIntervalMonths), 'yyyy-MM-dd')
    basis = 'service'
  } else if (!last && watch.manufactureDate && watch.serviceIntervalMonths) {
    dueDate = format(
      addMonths(parseISO(watch.manufactureDate), watch.serviceIntervalMonths),
      'yyyy-MM-dd',
    )
    basis = 'manufacture'
  }

  const daysUntil =
    dueDate == null ? null : differenceInDays(parseISO(dueDate), new Date())

  return { lastFullService: last?.date ?? null, dueDate, daysUntil, basis }
}
