import { getFacilityById } from './facilityservice.js'
import { getComplianceHistory } from './complianceservice.js'
import { calculateQuarterForecast } from '../../../shared/careCalculations.js'

export const getQuarterlyForecast = async (
  facilityId,
  quarterStartDate,
  quarterEndDate,
  todayDate,
  scenarioShiftMinutes = 0,
  scenarioShiftsPerWeek = 0
) => {
  const facility = await getFacilityById(facilityId)
  const history = await getComplianceHistory(facilityId, quarterStartDate, quarterEndDate)

  return {
    facility_id: facilityId,
    ...calculateQuarterForecast({
      facility,
      history,
      quarterStartDate,
      quarterEndDate,
      todayDate,
      scenarioShiftMinutes,
      scenarioShiftsPerWeek
    })
  }
}
