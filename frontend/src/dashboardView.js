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

const getExclusiveMinutes = (dailyCompliance, totalField, nonAgencyField, agencyField) => {
  const explicitNonAgencyMinutes = toFiniteNumber(dailyCompliance?.[nonAgencyField], NaN)

  if (Number.isFinite(explicitNonAgencyMinutes)) {
    return Math.max(explicitNonAgencyMinutes, 0)
  }

  const totalMinutes = toFiniteNumber(dailyCompliance?.[totalField])
  const agencyMinutes = toFiniteNumber(dailyCompliance?.[agencyField])

  return Math.max(totalMinutes - agencyMinutes, 0)
}

export const getTodayStaffTypeBreakdown = (dailyCompliance) => [
  {
    name: 'RN',
    minutes: getExclusiveMinutes(dailyCompliance, 'actual_rn_minutes', 'actual_rn_non_agency_minutes', 'actual_rn_agency_minutes'),
    color: '#e50914'
  },
  {
    name: 'EN',
    minutes: getExclusiveMinutes(dailyCompliance, 'actual_en_minutes', 'actual_en_non_agency_minutes', 'actual_en_agency_minutes'),
    color: '#9ca3af'
  },
  {
    name: 'PCW',
    minutes: getExclusiveMinutes(dailyCompliance, 'actual_pcw_minutes', 'actual_pcw_non_agency_minutes', 'actual_pcw_agency_minutes'),
    color: '#f59e0b'
  },
  { name: 'Agency', minutes: toFiniteNumber(dailyCompliance?.actual_agency_minutes), color: '#38bdf8' }
]

export const hasBreakdownMinutes = (rows = []) =>
  rows.some((row) => toFiniteNumber(row?.minutes) > 0)

export const isDashboardBundleReady = ({
  selectedFacilityId,
  dashboardStatus,
  dashboard,
  forecast,
  report
}) => {
  if (dashboardStatus !== 'ready' || !selectedFacilityId || !dashboard || !forecast || !report) {
    return false
  }

  return String(dashboard?.facility?.id ?? '') === String(selectedFacilityId)
}

export const buildPdfFilename = (facilityName, startDate, endDate) => {
  const slug = String(facilityName ?? 'facility')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return `${slug || 'facility'}-audit-${startDate ?? 'start'}-to-${endDate ?? 'end'}.pdf`
}
