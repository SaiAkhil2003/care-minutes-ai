import { getFacilityById } from '../services/facilityservice.js'
import { listStaff } from '../services/staffservice.js'
import { listShifts } from '../services/shiftservice.js'
import { calculateDailyCompliance, getComplianceHistory } from '../services/complianceservice.js'
import { getQuarterlyForecast } from '../services/forecastservice.js'
import { getLatestAiAlert } from '../services/alertservice.js'
import { asyncHandler, sendData } from '../utils/http.js'
import { invariant } from '../utils/http.js'
import {
  addDaysToDateString,
  getQuarterBounds,
  getTodayInTimeZone
} from '../../../shared/careCalculations.js'
import { optionalDate, requireUuid } from '../utils/validation.js'

export const getDashboardSummary = asyncHandler(async (req, res) => {
  const facilityId = requireUuid(req.query.facility_id, 'facility_id')
  const facility = await getFacilityById(facilityId)
  const timezone = facility.timezone || 'Australia/Sydney'
  const date = optionalDate(req.query.date, 'date') ?? getTodayInTimeZone(timezone)
  const historyStartDate = optionalDate(req.query.history_start_date, 'history_start_date')
    ?? addDaysToDateString(date, -13)
  const historyEndDate = optionalDate(req.query.history_end_date, 'history_end_date') ?? date
  invariant(historyStartDate <= historyEndDate, 400, 'history_start_date must be on or before history_end_date')
  const quarterBounds = getQuarterBounds(date)

  const [staff, shifts, dailyCompliance, history, forecast, aiAlert] = await Promise.all([
    listStaff(facilityId),
    listShifts(facilityId, {
      startDate: historyStartDate,
      endDate: historyEndDate
    }),
    calculateDailyCompliance(facilityId, date),
    getComplianceHistory(facilityId, historyStartDate, historyEndDate),
    getQuarterlyForecast(facilityId, quarterBounds.start, quarterBounds.end, date),
    getLatestAiAlert(facilityId, date)
  ])

  sendData(res, {
    facility,
    date,
    history_start_date: historyStartDate,
    history_end_date: historyEndDate,
    daily_compliance: dailyCompliance,
    history,
    forecast,
    ai_alert: aiAlert,
    staff,
    shifts
  })
})
