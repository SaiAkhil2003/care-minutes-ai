import { getFacilityById } from './facilityservice.js'
import { getComplianceHistory } from './complianceservice.js'
import { summarizeHistoryTotals } from '../../../shared/careCalculations.js'
import { getRepository } from '../data/repository.js'

export const generateAuditReport = async (facilityId, startDate, endDate, { persistMetadata = false } = {}) => {
  const facility = await getFacilityById(facilityId)
  const dailyBreakdown = await getComplianceHistory(facilityId, startDate, endDate)
  const summary = summarizeHistoryTotals(dailyBreakdown)
  const generatedAt = new Date().toISOString()
  const complianceResult = summary.compliance_percent >= 100 && summary.rn_compliance_percent >= 100
    ? 'met'
    : 'not met'

  const report = {
    facility: {
      id: facility.id,
      name: facility.name,
      resident_count: facility.resident_count,
      care_minutes_target: facility.care_minutes_target,
      rn_minutes_target: facility.rn_minutes_target,
      timezone: facility.timezone
    },
    report_period: {
      start_date: startDate,
      end_date: endDate
    },
    generated_at: generatedAt,
    compliance_result: complianceResult,
    summary,
    staff_type_breakdown: [
      { name: 'RN', minutes: summary.total_actual_rn_minutes },
      { name: 'EN', minutes: summary.total_actual_en_minutes },
      { name: 'PCW', minutes: summary.total_actual_pcw_minutes },
      { name: 'Agency', minutes: summary.total_actual_agency_minutes }
    ],
    agency_permanent_split: summary.agency_permanent_split,
    trend_chart: dailyBreakdown.map((row) => ({
      date: row.compliance_date,
      compliance_percent: row.compliance_percent
    })),
    daily_breakdown: dailyBreakdown
  }

  if (persistMetadata) {
    await getRepository().createReport({
      facility_id: facilityId,
      report_type: 'audit_pdf',
      start_date: startDate,
      end_date: endDate,
      file_name: `care-minutes-audit-${startDate}-to-${endDate}.pdf`,
      file_url: null,
      generated_by: null
    })
  }

  return report
}

export const generateDailyReport = generateAuditReport
