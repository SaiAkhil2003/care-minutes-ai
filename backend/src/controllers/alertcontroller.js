import { asyncHandler, sendData } from '../utils/http.js'
import { optionalDate, requireUuid } from '../utils/validation.js'
import { generateDailyAiAlert, getLatestAiAlert } from '../services/alertservice.js'

export const getLatestAlertController = asyncHandler(async (req, res) => {
  const facilityId = requireUuid(req.query.facility_id, 'facility_id')
  const date = optionalDate(req.query.date, 'date')
  const alert = await getLatestAiAlert(facilityId, date)

  sendData(res, alert)
})

export const generateAlertController = asyncHandler(async (req, res) => {
  const facilityId = requireUuid(req.body.facility_id ?? req.query.facility_id, 'facility_id')
  const date = optionalDate(req.body.date ?? req.query.date, 'date')
  const alert = await generateDailyAiAlert(facilityId, date)

  sendData(res, alert, 201)
})
