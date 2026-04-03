import {
  createShift,
  deleteShift,
  listShifts,
  updateShift
} from '../services/shiftservice.js'
import { asyncHandler, sendData, sendDeleted } from '../utils/http.js'
import { optionalDate, requireUuid } from '../utils/validation.js'

export const getAllShifts = asyncHandler(async (req, res) => {
  const facilityId = requireUuid(req.query.facility_id, 'facility_id')
  const shifts = await listShifts(facilityId, {
    startDate: optionalDate(req.query.start_date, 'start_date'),
    endDate: optionalDate(req.query.end_date, 'end_date')
  })

  sendData(res, shifts)
})

export const createShiftController = asyncHandler(async (req, res) => {
  const shift = await createShift(req.body)

  sendData(res, shift, 201)
})

export const updateShiftController = asyncHandler(async (req, res) => {
  const facilityId = requireUuid(req.body.facility_id ?? req.query.facility_id, 'facility_id')
  const shiftId = requireUuid(req.params.id, 'shift_id')
  const shift = await updateShift(facilityId, shiftId, req.body)

  sendData(res, shift)
})

export const deleteShiftController = asyncHandler(async (req, res) => {
  const facilityId = requireUuid(req.query.facility_id, 'facility_id')
  const shiftId = requireUuid(req.params.id, 'shift_id')
  const result = await deleteShift(facilityId, shiftId)

  sendDeleted(res, result)
})
