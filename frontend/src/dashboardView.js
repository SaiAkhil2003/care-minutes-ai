const toFiniteNumber = (value, fallback = 0) => {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : fallback
}

export const clampScenarioValue = (
  value,
  {
    minimum = 0,
    maximum = 1440,
    fallback = 0
  } = {}
) => {
  if (value === '' || value === null || value === undefined) {
    return fallback
  }

  const numericValue = toFiniteNumber(value, fallback)
  return Math.min(maximum, Math.max(minimum, Math.round(numericValue)))
}

export const getDailyStatusPercent = (dailyCompliance) => {
  const overallCompliancePercent = toFiniteNumber(dailyCompliance?.overall_compliance_percent, NaN)

  if (Number.isFinite(overallCompliancePercent)) {
    return overallCompliancePercent
  }

  return toFiniteNumber(dailyCompliance?.compliance_percent)
}

export const getTodayStaffTypeBreakdown = (dailyCompliance) => [
  { name: 'RN', minutes: toFiniteNumber(dailyCompliance?.actual_rn_minutes), color: '#e50914' },
  { name: 'EN', minutes: toFiniteNumber(dailyCompliance?.actual_en_minutes), color: '#9ca3af' },
  { name: 'PCW', minutes: toFiniteNumber(dailyCompliance?.actual_pcw_minutes), color: '#f59e0b' }
]

export const hasBreakdownMinutes = (rows = []) =>
  rows.some((row) => toFiniteNumber(row?.minutes) > 0)

export const buildPdfFilename = (facilityName, startDate, endDate) => {
  const slug = String(facilityName ?? 'facility')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return `${slug || 'facility'}-audit-${startDate ?? 'start'}-to-${endDate ?? 'end'}.pdf`
}
