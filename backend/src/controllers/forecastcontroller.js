import { getQuarterlyForecast } from '../services/forecastservice.js'
import { getFacilityById } from '../services/facilityservice.js'
import { asyncHandler, invariant, sendData } from '../utils/http.js'
import {
  getQuarterBounds,
  getTodayInTimeZone
} from '../../../shared/careCalculations.js'
import {
  optionalDate,
  optionalNonNegativeNumber,
  requireUuid
} from '../utils/validation.js'

export const getQuarterlyForecastController = asyncHandler(async (req, res) => {
  const facilityId = requireUuid(req.query.facility_id, 'facility_id')
  const facility = await getFacilityById(facilityId)
  const timezone = facility.timezone || 'Australia/Sydney'
  const todayDate = optionalDate(req.query.today_date, 'today_date')
    ?? getTodayInTimeZone(timezone)
  const quarterBounds = getQuarterBounds(todayDate)
  const quarterStartDate = optionalDate(req.query.quarter_start_date, 'quarter_start_date') ?? quarterBounds.start
  const quarterEndDate = optionalDate(req.query.quarter_end_date, 'quarter_end_date') ?? quarterBounds.end
  invariant(quarterStartDate <= quarterEndDate, 400, 'quarter_start_date must be on or before quarter_end_date')
  const scenarioShiftMinutes =
    optionalNonNegativeNumber(req.query.scenario_shift_minutes, 'scenario_shift_minutes') ?? 0
  const scenarioShiftsPerWeek =
    optionalNonNegativeNumber(req.query.scenario_shifts_per_week, 'scenario_shifts_per_week') ?? 0
  const result = await getQuarterlyForecast(
    facilityId,
    quarterStartDate,
    quarterEndDate,
    todayDate,
    scenarioShiftMinutes,
    scenarioShiftsPerWeek
  )

  sendData(res, result)
})
