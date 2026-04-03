import {
  calculateDailyCompliance,
  getComplianceHistory,
  saveDailyCompliance
} from '../services/complianceservice.js'
import { asyncHandler, sendData } from '../utils/http.js'
import { invariant } from '../utils/http.js'
import { requireDate, requireUuid, optionalDate } from '../utils/validation.js'
import {
  addDaysToDateString,
  getTodayInTimeZone
} from '../../../shared/careCalculations.js'
import { getFacilityById } from '../services/facilityservice.js'

export const getDailyCompliance = asyncHandler(async (req, res) => {
  const facilityId = requireUuid(req.query.facility_id, 'facility_id')
  const facility = await getFacilityById(facilityId)
  const date = req.query.date
    ? requireDate(req.query.date, 'date')
    : getTodayInTimeZone(facility.timezone || 'Australia/Sydney')
  const result = await calculateDailyCompliance(facilityId, date)

  sendData(res, result)
})

export const postDailyCompliance = asyncHandler(async (req, res) => {
  const facilityId = requireUuid(req.body.facility_id, 'facility_id')
  const date = requireDate(req.body.date, 'date')
  const result = await saveDailyCompliance(facilityId, date)

  sendData(res, result, 201)
})

export const getComplianceHistoryController = asyncHandler(async (req, res) => {
  const facilityId = requireUuid(req.query.facility_id, 'facility_id')
  const facility = await getFacilityById(facilityId)
  const endDate = optionalDate(req.query.end_date, 'end_date')
    ?? getTodayInTimeZone(facility.timezone || 'Australia/Sydney')
  const startDate = optionalDate(req.query.start_date, 'start_date')
    ?? addDaysToDateString(endDate, -13)
  invariant(startDate <= endDate, 400, 'start_date must be on or before end_date')
  const history = await getComplianceHistory(facilityId, startDate, endDate)

  sendData(res, history)
})
