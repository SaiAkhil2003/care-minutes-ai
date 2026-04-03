export const DEFAULT_CARE_MINUTES_TARGET = 215
export const DEFAULT_RN_MINUTES_TARGET = 44
export const PENALTY_RATE_PER_RESIDENT = 31.64
export const DEFAULT_SHIFT_MINUTES = 480
export const DAILY_ALERT_HOUR_IN_FACILITY_TIME = 7

export const FORECAST_PENALTY_ASSUMPTION = {
  rate_per_resident_per_non_compliant_day: PENALTY_RATE_PER_RESIDENT,
  model: 'Projected funding at risk is estimated by converting projected minute shortfall into equivalent non-compliant facility days, then multiplying by the per-resident daily penalty cap.',
  note: 'This is a planning estimate only. Actual government funding impacts can vary based on official assessment outcomes.'
}

const VALID_STAFF_TYPES = new Set(['rn', 'en', 'pcw'])

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})[tT\s](\d{2}):(\d{2})(?::(\d{2}))?/
const TIME_PATTERN = /^(\d{2}):(\d{2})(?::(\d{2}))?$/

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

export const roundToTwo = (value) => Number(toNumber(value).toFixed(2))

const clampPercentage = (value) => Math.max(toNumber(value), 0)

export const calculateCompliancePercent = (actualMinutes, targetMinutes) => {
  const safeActualMinutes = Math.max(toNumber(actualMinutes), 0)
  const safeTargetMinutes = Math.max(toNumber(targetMinutes), 0)

  if (safeTargetMinutes <= 0) {
    return 100
  }

  return (safeActualMinutes / safeTargetMinutes) * 100
}

export const calculateDailyPenaltyEstimate = ({
  shortfallMinutes = 0,
  requiredTotalMinutes = 0,
  residentCount = 0,
  penaltyRatePerResident = PENALTY_RATE_PER_RESIDENT
}) => {
  const safeShortfallMinutes = Math.max(toNumber(shortfallMinutes), 0)
  const safeRequiredTotalMinutes = Math.max(toNumber(requiredTotalMinutes), 0)
  const safeResidentCount = Math.max(toNumber(residentCount), 0)

  if (safeShortfallMinutes <= 0 || safeRequiredTotalMinutes <= 0 || safeResidentCount <= 0) {
    return 0
  }

  const equivalentNonCompliantFacilityDays = safeShortfallMinutes / safeRequiredTotalMinutes
  return roundToTwo(equivalentNonCompliantFacilityDays * safeResidentCount * penaltyRatePerResident)
}

export const calculateFundingAtRisk = ({
  projectedShortfallMinutes = 0,
  averageRequiredMinutesPerDay = 0,
  averageResidentCount = 0,
  penaltyRatePerResident = PENALTY_RATE_PER_RESIDENT
}) => {
  const safeProjectedShortfallMinutes = Math.max(toNumber(projectedShortfallMinutes), 0)
  const safeAverageRequiredMinutesPerDay = Math.max(toNumber(averageRequiredMinutesPerDay), 0)
  const safeAverageResidentCount = Math.max(toNumber(averageResidentCount), 0)

  if (
    safeProjectedShortfallMinutes <= 0
    || safeAverageRequiredMinutesPerDay <= 0
    || safeAverageResidentCount <= 0
  ) {
    return {
      equivalent_non_compliant_days: 0,
      average_resident_count: roundToTwo(safeAverageResidentCount),
      estimated_dollar_value_at_risk: 0
    }
  }

  const equivalentNonCompliantDays =
    safeProjectedShortfallMinutes / safeAverageRequiredMinutesPerDay

  return {
    equivalent_non_compliant_days: roundToTwo(equivalentNonCompliantDays),
    average_resident_count: roundToTwo(safeAverageResidentCount),
    estimated_dollar_value_at_risk: roundToTwo(
      equivalentNonCompliantDays * safeAverageResidentCount * penaltyRatePerResident
    )
  }
}

export const formatDateString = (year, month, day) =>
  `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

export const normalizeDateString = (value) => {
  if (typeof value !== 'string') {
    return null
  }

  const trimmedValue = value.trim()

  if (!trimmedValue) {
    return null
  }

  const dateMatch = trimmedValue.match(/^(\d{4}-\d{2}-\d{2})/)
  return dateMatch ? dateMatch[1] : null
}

export const isValidDateString = (value) => DATE_PATTERN.test(value ?? '')

export const addDaysToDateString = (dateString, days) => {
  const match = DATE_PATTERN.exec(dateString ?? '')

  if (!match) {
    return null
  }

  const [, year, month, day] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) + days))

  return formatDateString(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate()
  )
}

export const differenceInDays = (startDate, endDate) => {
  if (!isValidDateString(startDate) || !isValidDateString(endDate)) {
    return 0
  }

  const start = dateStringToUtcMinutes(startDate)
  const end = dateStringToUtcMinutes(endDate)

  return Math.floor((end - start) / 1440)
}

export const buildDateRange = (startDate, endDate) => {
  if (!isValidDateString(startDate) || !isValidDateString(endDate) || startDate > endDate) {
    return []
  }

  const dates = []
  let currentDate = startDate

  while (currentDate && currentDate <= endDate) {
    dates.push(currentDate)
    currentDate = addDaysToDateString(currentDate, 1)
  }

  return dates
}

export const getDatePartsInTimeZone = (timeZone, value = new Date()) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })

  const parts = formatter.formatToParts(value)

  return {
    year: Number(parts.find((part) => part.type === 'year')?.value),
    month: Number(parts.find((part) => part.type === 'month')?.value),
    day: Number(parts.find((part) => part.type === 'day')?.value)
  }
}

export const getTodayInTimeZone = (timeZone, value = new Date()) => {
  const { year, month, day } = getDatePartsInTimeZone(timeZone, value)
  return formatDateString(year, month, day)
}

export const getQuarterBounds = (referenceDate) => {
  const dateString = normalizeDateString(referenceDate)

  if (!dateString) {
    return {
      start: null,
      end: null
    }
  }

  const [, yearValue, monthValue] = DATE_PATTERN.exec(dateString)
  const year = Number(yearValue)
  const monthIndex = Number(monthValue) - 1
  const quarterStartMonth = Math.floor(monthIndex / 3) * 3
  const quarterEndDate = new Date(Date.UTC(year, quarterStartMonth + 3, 0))

  return {
    start: formatDateString(year, quarterStartMonth + 1, 1),
    end: formatDateString(
      quarterEndDate.getUTCFullYear(),
      quarterEndDate.getUTCMonth() + 1,
      quarterEndDate.getUTCDate()
    )
  }
}

export const getQuarterBoundsForTimeZone = (timeZone, value = new Date()) =>
  getQuarterBounds(getTodayInTimeZone(timeZone, value))

export const getWeekBounds = (referenceDate) => {
  const dateString = normalizeDateString(referenceDate)

  if (!dateString) {
    return {
      start: null,
      end: null
    }
  }

  const date = new Date(`${dateString}T00:00:00Z`)
  const dayOfWeek = date.getUTCDay()
  const daysFromMonday = (dayOfWeek + 6) % 7
  const start = addDaysToDateString(dateString, -daysFromMonday)
  const end = addDaysToDateString(start, 6)

  return { start, end }
}

export const getStatusFromCompliance = (percent) => {
  const safePercent = clampPercentage(percent)

  if (safePercent >= 100) {
    return 'green'
  }

  if (safePercent >= 85) {
    return 'amber'
  }

  return 'red'
}

export const getStatusMeta = (status) => {
  if (status === 'green') {
    return {
      color: '#166534',
      background: '#dcfce7',
      label: 'Green'
    }
  }

  if (status === 'amber') {
    return {
      color: '#b45309',
      background: '#fef3c7',
      label: 'Amber'
    }
  }

  return {
    color: '#b91c1c',
    background: '#fee2e2',
    label: 'Red'
  }
}

export const parseTimeString = (value) => {
  if (typeof value !== 'string') {
    return null
  }

  const trimmedValue = value.trim()
  let match = DATE_TIME_PATTERN.exec(trimmedValue)

  if (match) {
    return {
      hours: Number(match[4]),
      minutes: Number(match[5]),
      seconds: Number(match[6] ?? 0)
    }
  }

  match = TIME_PATTERN.exec(trimmedValue)

  if (!match) {
    return null
  }

  return {
    hours: Number(match[1]),
    minutes: Number(match[2]),
    seconds: Number(match[3] ?? 0)
  }
}

export const parseLocalDateTime = (value, fallbackDate) => {
  if (typeof value !== 'string') {
    return null
  }

  const trimmedValue = value.trim()
  let match = DATE_TIME_PATTERN.exec(trimmedValue)

  if (match) {
    return {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hours: Number(match[4]),
      minutes: Number(match[5]),
      seconds: Number(match[6] ?? 0)
    }
  }

  const timeParts = parseTimeString(trimmedValue)

  if (!timeParts || !isValidDateString(fallbackDate)) {
    return null
  }

  const [, year, month, day] = DATE_PATTERN.exec(fallbackDate)

  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hours: timeParts.hours,
    minutes: timeParts.minutes,
    seconds: timeParts.seconds
  }
}

export const dateStringToUtcMinutes = (dateString) => {
  const match = DATE_PATTERN.exec(dateString ?? '')

  if (!match) {
    return null
  }

  const [, year, month, day] = match
  return Math.floor(Date.UTC(Number(year), Number(month) - 1, Number(day), 0, 0, 0) / 60000)
}

export const toUtcMinutes = (parts) =>
  Math.floor(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hours,
      parts.minutes,
      parts.seconds ?? 0
    ) / 60000
  )

export const getShiftWindow = (shift) => {
  const shiftDate = normalizeDateString(shift?.shift_date)
  const startParts = parseLocalDateTime(shift?.start_time, shiftDate)
  const endParts = parseLocalDateTime(shift?.end_time, shiftDate)

  if (!shiftDate || !startParts || !endParts) {
    return null
  }

  const startMinutes = toUtcMinutes(startParts)
  let endMinutes = toUtcMinutes(endParts)

  if (endMinutes < startMinutes) {
    endMinutes += 1440
  }

  const durationMinutes = endMinutes - startMinutes

  return {
    shiftDate,
    startMinutes,
    endMinutes,
    durationMinutes
  }
}

export const calculateShiftDurationMinutes = (shift) => {
  const window = getShiftWindow(shift)

  if (!window || window.durationMinutes <= 0) {
    return 0
  }

  return window.durationMinutes
}

export const calculateShiftMinutesForDate = (shift, date) => {
  const window = getShiftWindow(shift)
  const dateStart = dateStringToUtcMinutes(date)

  if (!window || dateStart === null) {
    return 0
  }

  const dateEnd = dateStart + 1440
  const overlapMinutes = Math.min(window.endMinutes, dateEnd) - Math.max(window.startMinutes, dateStart)

  return overlapMinutes > 0 ? overlapMinutes : 0
}

export const calculateAgencyPermanentSplit = ({
  actualAgencyMinutes = 0,
  actualPermanentMinutes = 0
}) => {
  const agencyMinutes = Math.max(toNumber(actualAgencyMinutes), 0)
  const permanentMinutes = Math.max(toNumber(actualPermanentMinutes), 0)
  const totalMinutes = agencyMinutes + permanentMinutes

  return {
    agency_minutes: agencyMinutes,
    permanent_minutes: permanentMinutes,
    agency_percent: totalMinutes > 0 ? roundToTwo((agencyMinutes / totalMinutes) * 100) : 0,
    permanent_percent: totalMinutes > 0 ? roundToTwo((permanentMinutes / totalMinutes) * 100) : 0
  }
}

export const getImpactedDatesForShift = (shift) => {
  const window = getShiftWindow(shift)
  const shiftDate = window?.shiftDate
  const shiftDateStart = dateStringToUtcMinutes(shiftDate)

  if (!window || shiftDateStart === null || window.durationMinutes <= 0) {
    return []
  }

  const lastDayOffset = Math.floor((window.endMinutes - 1 - shiftDateStart) / 1440)
  const lastDate = addDaysToDateString(shiftDate, lastDayOffset)

  return buildDateRange(shiftDate, lastDate)
}

export const summarizeDailyCompliance = ({
  facility,
  date,
  shifts = []
}) => {
  const residentCount = Math.max(0, Math.trunc(toNumber(facility?.resident_count ?? facility?.residentCount)))
  const careMinutesTarget = Math.max(
    0,
    Math.trunc(toNumber(facility?.care_minutes_target ?? facility?.careMinutesTarget, DEFAULT_CARE_MINUTES_TARGET))
  )
  const rnMinutesTarget = Math.max(
    0,
    Math.trunc(toNumber(facility?.rn_minutes_target ?? facility?.rnMinutesTarget, DEFAULT_RN_MINUTES_TARGET))
  )

  let actualTotalMinutes = 0
  let actualRnMinutes = 0
  let actualEnMinutes = 0
  let actualPcwMinutes = 0
  let actualAgencyMinutes = 0
  let actualPermanentMinutes = 0

  for (const shift of shifts) {
    const staffType = String(shift?.staff_type_snapshot ?? shift?.staff_type ?? '').toLowerCase()

    if (!VALID_STAFF_TYPES.has(staffType)) {
      continue
    }

    const minutesForDate = calculateShiftMinutesForDate(shift, date)

    if (minutesForDate <= 0) {
      continue
    }

    actualTotalMinutes += minutesForDate

    if (staffType === 'rn') {
      actualRnMinutes += minutesForDate
    }

    if (staffType === 'en') {
      actualEnMinutes += minutesForDate
    }

    if (staffType === 'pcw') {
      actualPcwMinutes += minutesForDate
    }

    const employmentType = String(
      shift?.employment_type_snapshot ?? shift?.employment_type ?? ''
    ).toLowerCase()

    if (employmentType === 'agency') {
      actualAgencyMinutes += minutesForDate
    } else {
      actualPermanentMinutes += minutesForDate
    }
  }

  const requiredTotalMinutes = residentCount * careMinutesTarget
  const requiredRnMinutes = residentCount * rnMinutesTarget
  const compliancePercent = calculateCompliancePercent(actualTotalMinutes, requiredTotalMinutes)
  const rnCompliancePercent = calculateCompliancePercent(actualRnMinutes, requiredRnMinutes)
  const overallCompliancePercent = Math.min(compliancePercent, rnCompliancePercent)
  const status = getStatusFromCompliance(overallCompliancePercent)
  const shortfallMinutes = Math.max(requiredTotalMinutes - actualTotalMinutes, 0)
  const penaltyAmount = calculateDailyPenaltyEstimate({
    shortfallMinutes,
    requiredTotalMinutes,
    residentCount
  })

  return {
    compliance_date: date,
    resident_count: residentCount,
    required_total_minutes: requiredTotalMinutes,
    required_rn_minutes: requiredRnMinutes,
    actual_total_minutes: actualTotalMinutes,
    actual_rn_minutes: actualRnMinutes,
    actual_en_minutes: actualEnMinutes,
    actual_pcw_minutes: actualPcwMinutes,
    actual_agency_minutes: actualAgencyMinutes,
    actual_permanent_minutes: actualPermanentMinutes,
    compliance_percent: roundToTwo(compliancePercent),
    rn_compliance_percent: roundToTwo(rnCompliancePercent),
    overall_compliance_percent: roundToTwo(overallCompliancePercent),
    status,
    is_total_target_met: requiredTotalMinutes <= 0 || actualTotalMinutes >= requiredTotalMinutes,
    is_rn_target_met: requiredRnMinutes <= 0 || actualRnMinutes >= requiredRnMinutes,
    penalty_amount: roundToTwo(penaltyAmount)
  }
}

export const buildDailyHistoryRows = ({
  facility,
  shifts = [],
  startDate,
  endDate
}) => {
  const dates = buildDateRange(startDate, endDate)

  return dates.map((date) => summarizeDailyCompliance({
    facility,
    date,
    shifts
  }))
}

export const calculateQuarterForecast = ({
  facility,
  history = [],
  quarterStartDate,
  quarterEndDate,
  todayDate,
  scenarioShiftMinutes = 0,
  scenarioShiftsPerWeek = 0
}) => {
  const residentCount = Math.max(0, Math.trunc(toNumber(facility?.resident_count ?? facility?.residentCount)))
  const totalDaysInQuarter = quarterStartDate && quarterEndDate
    ? Math.max(differenceInDays(quarterStartDate, quarterEndDate) + 1, 0)
    : 0

  let daysElapsed = 0

  if (quarterStartDate && quarterEndDate && todayDate) {
    if (todayDate < quarterStartDate) {
      daysElapsed = 0
    } else {
      const effectiveEnd = todayDate > quarterEndDate ? quarterEndDate : todayDate
      daysElapsed = Math.max(differenceInDays(quarterStartDate, effectiveEnd) + 1, 0)
    }
  }

  const daysRemaining = Math.max(totalDaysInQuarter - daysElapsed, 0)
  const elapsedHistory = history.slice(0, daysElapsed)

  const actualMinutesSoFar = elapsedHistory.reduce(
    (total, row) => total + toNumber(row.actual_total_minutes),
    0
  )
  const requiredMinutesSoFar = elapsedHistory.reduce(
    (total, row) => total + toNumber(row.required_total_minutes),
    0
  )
  const totalRequiredMinutes = history.reduce(
    (total, row) => total + toNumber(row.required_total_minutes),
    0
  )
  const currentCompliancePercent = calculateCompliancePercent(actualMinutesSoFar, requiredMinutesSoFar)
  const averageMinutesPerDay = daysElapsed > 0 ? actualMinutesSoFar / daysElapsed : 0
  const projectedTotalMinutes = Math.round(averageMinutesPerDay * totalDaysInQuarter)
  const projectedCompliancePercent = calculateCompliancePercent(projectedTotalMinutes, totalRequiredMinutes)
  const projectedShortfallMinutes = Math.max(totalRequiredMinutes - projectedTotalMinutes, 0)
  const dailyShortfallMinutes = daysRemaining > 0 ? projectedShortfallMinutes / daysRemaining : 0
  const minutesNeededPerDayToRecover = daysRemaining > 0
    ? Math.max(totalRequiredMinutes - actualMinutesSoFar, 0) / daysRemaining
    : 0
  const averageRequiredMinutesPerDay = totalDaysInQuarter > 0
    ? totalRequiredMinutes / totalDaysInQuarter
    : 0
  const averageResidentCount = history.length
    ? history.reduce(
      (total, row) => total + Math.max(toNumber(row.resident_count), 0),
      0
    ) / history.length
    : residentCount
  const fundingAtRisk = calculateFundingAtRisk({
    projectedShortfallMinutes,
    averageRequiredMinutesPerDay,
    averageResidentCount
  })

  const normalizedScenarioShiftMinutes = Math.max(toNumber(scenarioShiftMinutes), 0)
  const normalizedScenarioShiftsPerWeek = Math.max(toNumber(scenarioShiftsPerWeek), 0)
  const scenarioAdditionalMinutesPerDay = (normalizedScenarioShiftMinutes * normalizedScenarioShiftsPerWeek) / 7
  const scenarioAdditionalMinutes = Math.round(scenarioAdditionalMinutesPerDay * daysRemaining)
  const scenarioProjectedTotalMinutes = projectedTotalMinutes + scenarioAdditionalMinutes
  const scenarioProjectedCompliancePercent = calculateCompliancePercent(
    scenarioProjectedTotalMinutes,
    totalRequiredMinutes
  )

  return {
    quarter_start_date: quarterStartDate,
    quarter_end_date: quarterEndDate,
    days_elapsed: daysElapsed,
    days_remaining: daysRemaining,
    total_days_in_quarter: totalDaysInQuarter,
    actual_minutes_so_far: actualMinutesSoFar,
    required_minutes_so_far: requiredMinutesSoFar,
    current_compliance_percent: roundToTwo(currentCompliancePercent),
    average_minutes_per_day: roundToTwo(averageMinutesPerDay),
    projected_total_minutes: projectedTotalMinutes,
    total_required_minutes: totalRequiredMinutes,
    projected_compliance_percent: roundToTwo(projectedCompliancePercent),
    projected_shortfall_minutes: Math.round(projectedShortfallMinutes),
    daily_shortfall_minutes: roundToTwo(dailyShortfallMinutes),
    minutes_needed_per_day_to_recover: roundToTwo(minutesNeededPerDayToRecover),
    average_required_minutes_per_day: roundToTwo(averageRequiredMinutesPerDay),
    funding_at_risk: fundingAtRisk,
    dollar_value_at_risk: fundingAtRisk.estimated_dollar_value_at_risk,
    penalty_assumption: FORECAST_PENALTY_ASSUMPTION,
    scenario: {
      shift_minutes: normalizedScenarioShiftMinutes,
      shifts_per_week: normalizedScenarioShiftsPerWeek,
      additional_minutes_per_day: roundToTwo(scenarioAdditionalMinutesPerDay),
      additional_minutes_total: scenarioAdditionalMinutes,
      projected_total_minutes: scenarioProjectedTotalMinutes,
      projected_compliance_percent: roundToTwo(scenarioProjectedCompliancePercent),
      will_meet_target: scenarioProjectedTotalMinutes >= totalRequiredMinutes
    }
  }
}

export const summarizeHistoryTotals = (history = []) => {
  const totals = history.reduce((accumulator, row) => {
    accumulator.total_days += 1
    accumulator.total_actual_minutes += toNumber(row.actual_total_minutes)
    accumulator.total_required_minutes += toNumber(row.required_total_minutes)
    accumulator.total_actual_rn_minutes += toNumber(row.actual_rn_minutes)
    accumulator.total_required_rn_minutes += toNumber(row.required_rn_minutes)
    accumulator.total_actual_en_minutes += toNumber(row.actual_en_minutes)
    accumulator.total_actual_pcw_minutes += toNumber(row.actual_pcw_minutes)
    accumulator.total_actual_agency_minutes += toNumber(row.actual_agency_minutes)
    accumulator.total_actual_permanent_minutes += toNumber(row.actual_permanent_minutes)

    if (row.is_total_target_met) {
      accumulator.total_days_met += 1
    }

    if (row.is_rn_target_met) {
      accumulator.total_rn_days_met += 1
    }

    return accumulator
  }, {
    total_days: 0,
    total_days_met: 0,
    total_rn_days_met: 0,
    total_actual_minutes: 0,
    total_required_minutes: 0,
    total_actual_rn_minutes: 0,
    total_required_rn_minutes: 0,
    total_actual_en_minutes: 0,
    total_actual_pcw_minutes: 0,
    total_actual_agency_minutes: 0,
    total_actual_permanent_minutes: 0
  })

  return {
    ...totals,
    compliance_percent: roundToTwo(
      calculateCompliancePercent(totals.total_actual_minutes, totals.total_required_minutes)
    ),
    rn_compliance_percent: roundToTwo(
      calculateCompliancePercent(totals.total_actual_rn_minutes, totals.total_required_rn_minutes)
    ),
    agency_permanent_split: calculateAgencyPermanentSplit({
      actualAgencyMinutes: totals.total_actual_agency_minutes,
      actualPermanentMinutes: totals.total_actual_permanent_minutes
    })
  }
}
