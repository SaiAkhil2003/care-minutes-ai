import {
  createStaff,
  deleteStaff,
  listStaff,
  updateStaff
} from '../services/staffservice.js'
import { asyncHandler, sendData, sendDeleted } from '../utils/http.js'
import { requireUuid } from '../utils/validation.js'

export const getAllStaff = asyncHandler(async (req, res) => {
  const facilityId = requireUuid(req.query.facility_id, 'facility_id')
  const staff = await listStaff(facilityId)

  sendData(res, staff)
})

export const createStaffController = asyncHandler(async (req, res) => {
  const staff = await createStaff(req.body)

  sendData(res, staff, 201)
})

export const updateStaffController = asyncHandler(async (req, res) => {
  const facilityId = requireUuid(req.body.facility_id ?? req.query.facility_id, 'facility_id')
  const staffId = requireUuid(req.params.id, 'staff_id')
  const staff = await updateStaff(facilityId, staffId, req.body)

  sendData(res, staff)
})

export const deleteStaffController = asyncHandler(async (req, res) => {
  const facilityId = requireUuid(req.query.facility_id, 'facility_id')
  const staffId = requireUuid(req.params.id, 'staff_id')
  const result = await deleteStaff(facilityId, staffId)

  sendDeleted(res, result)
})
