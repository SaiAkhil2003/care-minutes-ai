import {
  DAILY_ALERT_HOUR_IN_FACILITY_TIME,
  addDaysToDateString,
  formatDateString,
} from '../../../shared/careCalculations.js'
import { generateDailyAiAlertsForAllFacilities } from './alertservice.js'

let timeoutHandle = null
let schedulerEnabled = false

const FACILITY_TIME_ZONE = 'Australia/Sydney'

const TIME_ZONE_OFFSET_PATTERN = /^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/

const getDateTimePartsInTimeZone = (timeZone, value = new Date()) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  })
  const parts = formatter.formatToParts(value)

  return {
    year: Number(parts.find((part) => part.type === 'year')?.value),
    month: Number(parts.find((part) => part.type === 'month')?.value),
    day: Number(parts.find((part) => part.type === 'day')?.value),
    hour: Number(parts.find((part) => part.type === 'hour')?.value),
    minute: Number(parts.find((part) => part.type === 'minute')?.value),
    second: Number(parts.find((part) => part.type === 'second')?.value)
  }
}

const getTimeZoneOffsetMinutes = (timeZone, value) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
    hour: '2-digit'
  })
  const offsetValue = formatter
    .formatToParts(value)
    .find((part) => part.type === 'timeZoneName')
    ?.value
  const match = TIME_ZONE_OFFSET_PATTERN.exec(offsetValue ?? '')

  if (!match) {
    return 0
  }

  const sign = match[1] === '-' ? -1 : 1
  const hours = Number(match[2])
  const minutes = Number(match[3] ?? 0)
  return sign * (hours * 60 + minutes)
}

const getUtcDateForFacilityClock = ({ year, month, day, hour, minute = 0, second = 0 }) => {
  const firstGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second, 0))
  const firstOffset = getTimeZoneOffsetMinutes(FACILITY_TIME_ZONE, firstGuess)
  let utcDate = new Date(firstGuess.getTime() - firstOffset * 60 * 1000)
  const correctedOffset = getTimeZoneOffsetMinutes(FACILITY_TIME_ZONE, utcDate)

  if (correctedOffset !== firstOffset) {
    utcDate = new Date(firstGuess.getTime() - correctedOffset * 60 * 1000)
  }

  return utcDate
}

const getNextAestRunTime = (value = new Date()) => {
  const now = value instanceof Date ? value : new Date(value)
  const localParts = getDateTimePartsInTimeZone(FACILITY_TIME_ZONE, now)
  const localDate = formatDateString(localParts.year, localParts.month, localParts.day)
  const hasPassedDailyRun =
    localParts.hour > DAILY_ALERT_HOUR_IN_FACILITY_TIME
    || (
      localParts.hour === DAILY_ALERT_HOUR_IN_FACILITY_TIME
      && (localParts.minute > 0 || localParts.second > 0)
    )
  const runDate = hasPassedDailyRun ? addDaysToDateString(localDate, 1) : localDate
  const [year, month, day] = runDate.split('-').map(Number)

  return getUtcDateForFacilityClock({
    year,
    month,
    day,
    hour: DAILY_ALERT_HOUR_IN_FACILITY_TIME
  })
}

export const getDelayUntilNextAestRun = (value = new Date()) => {
  const now = value instanceof Date ? value : new Date(value)
  const nextRun = getNextAestRunTime(now)

  return Math.max(nextRun.getTime() - now.getTime(), 0)
}

const clearSchedulerTimeout = () => {
  if (timeoutHandle) {
    clearTimeout(timeoutHandle)
    timeoutHandle = null
  }
}

const isSchedulerEnabledByConfig = () =>
  String(process.env.ENABLE_ALERT_SCHEDULER ?? '').trim().toLowerCase() === 'true'

const scheduleNextRun = () => {
  if (!schedulerEnabled) {
    return
  }

  timeoutHandle = setTimeout(async () => {
    clearSchedulerTimeout()

    try {
      await generateDailyAiAlertsForAllFacilities()
    } catch (error) {
      console.error('AI alert scheduler failed', error)
    } finally {
      scheduleNextRun()
    }
  }, getDelayUntilNextAestRun())
}

export const startAlertScheduler = () => {
  if (schedulerEnabled || !isSchedulerEnabledByConfig()) {
    return
  }

  schedulerEnabled = true
  scheduleNextRun()
}

export const stopAlertScheduler = () => {
  schedulerEnabled = false
  clearSchedulerTimeout()
}
