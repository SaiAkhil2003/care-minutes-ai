import { getFacilityById } from './facilityservice.js'
import {
  addDaysToDateString,
  summarizeDailyCompliance
} from '../../../shared/careCalculations.js'
import { getRepository } from '../data/repository.js'

const findEffectiveRecordForDate = (records, date) =>
  records.find((record) => record.effective_date <= date) ?? null

const buildFacilitySnapshotForDate = ({
  facility,
  date,
  complianceTargets,
  residentCounts
}) => {
  const effectiveTarget = findEffectiveRecordForDate(complianceTargets, date)
  const effectiveResidentCount = findEffectiveRecordForDate(residentCounts, date)

  return {
    ...facility,
    resident_count: effectiveResidentCount?.resident_count ?? facility.resident_count,
    care_minutes_target: effectiveTarget?.daily_total_target ?? facility.care_minutes_target,
    rn_minutes_target: effectiveTarget?.rn_daily_minimum ?? facility.rn_minutes_target
  }
}

const listShiftsForComplianceRange = async (facilityId, startDate, endDate) => {
  return getRepository().listShifts(facilityId, {
    startDate: addDaysToDateString(startDate, -1),
    endDate
  })
}

const loadComplianceInputs = async (facilityId, endDate) => {
  const repository = getRepository()
  const [facility, complianceTargets, residentCounts] = await Promise.all([
    getFacilityById(facilityId),
    repository.listComplianceTargets(facilityId, { endDate }),
    repository.listResidentCounts(facilityId, { endDate })
  ])

  return {
    facility,
    complianceTargets,
    residentCounts
  }
}

export const calculateDailyCompliance = async (facilityId, date) => {
  const inputs = await loadComplianceInputs(facilityId, date)
  const shifts = await listShiftsForComplianceRange(facilityId, date, date)
  const facility = buildFacilitySnapshotForDate({
    facility: inputs.facility,
    date,
    complianceTargets: inputs.complianceTargets,
    residentCounts: inputs.residentCounts
  })

  return {
    facility_id: facilityId,
    ...summarizeDailyCompliance({
      facility,
      date,
      shifts
    })
  }
}

export const saveDailyCompliance = async (facilityId, date) => {
  const result = await calculateDailyCompliance(facilityId, date)
  return getRepository().upsertDailyCompliance({
    facility_id: result.facility_id,
    compliance_date: result.compliance_date,
    resident_count: result.resident_count,
    required_total_minutes: result.required_total_minutes,
    required_rn_minutes: result.required_rn_minutes,
    actual_total_minutes: result.actual_total_minutes,
    actual_rn_minutes: result.actual_rn_minutes,
    actual_en_minutes: result.actual_en_minutes,
    actual_pcw_minutes: result.actual_pcw_minutes,
    actual_agency_minutes: result.actual_agency_minutes,
    actual_permanent_minutes: result.actual_permanent_minutes,
    compliance_percent: result.compliance_percent,
    rn_compliance_percent: result.rn_compliance_percent,
    status: result.status,
    is_total_target_met: result.is_total_target_met,
    is_rn_target_met: result.is_rn_target_met,
    penalty_amount: result.penalty_amount
  })
}

export const saveDailyComplianceForDates = async (facilityId, dates = []) => {
  const uniqueDates = [...new Set(dates.filter(Boolean))]

  for (const date of uniqueDates) {
    await saveDailyCompliance(facilityId, date)
  }
}

export const getComplianceHistory = async (facilityId, startDate, endDate) => {
  const inputs = await loadComplianceInputs(facilityId, endDate)
  const shifts = await listShiftsForComplianceRange(facilityId, startDate, endDate)
  const history = []

  for (let date = startDate; date && date <= endDate; date = addDaysToDateString(date, 1)) {
    history.push({
      facility_id: facilityId,
      ...summarizeDailyCompliance({
        facility: buildFacilitySnapshotForDate({
          facility: inputs.facility,
          date,
          complianceTargets: inputs.complianceTargets,
          residentCounts: inputs.residentCounts
        }),
        date,
        shifts
      })
    })
  }

  return history
}
