import { getFacilityById } from './facilityservice.js'
import { getComplianceHistory } from './complianceservice.js'
import { calculateQuarterForecast } from '../../../shared/careCalculations.js'
import { getRepository } from '../data/repository.js'

export const getQuarterlyForecast = async (
  facilityId,
  quarterStartDate,
  quarterEndDate,
  todayDate,
  scenarioShiftMinutes = 0,
  scenarioShiftsPerWeek = 0
) => {
  const repository = getRepository()
  const [facility, facilitySettings] = await Promise.all([
    getFacilityById(facilityId),
    repository.getFacilitySettings(facilityId)
  ])
  const history = await getComplianceHistory(facilityId, quarterStartDate, quarterEndDate)
  const configuredRate = Number(
    facilitySettings?.anacc_rate_per_resident
    ?? facility?.anacc_rate_per_resident
  )

  return {
    facility_id: facilityId,
    ...calculateQuarterForecast({
      facility,
      history,
      quarterStartDate,
      quarterEndDate,
      todayDate,
      penaltyRatePerResident: Number.isFinite(configuredRate) ? configuredRate : undefined,
      scenarioShiftMinutes,
      scenarioShiftsPerWeek
    })
  }
}
