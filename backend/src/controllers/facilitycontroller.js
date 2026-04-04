import {
  getFacilityById,
  getFacilitySettings,
  listFacilities,
  updateFacilitySettings
} from '../services/facilityservice.js'
import { asyncHandler, sendData } from '../utils/http.js'
import { requireUuid } from '../utils/validation.js'

export const getFacilities = asyncHandler(async (req, res) => {
  const facilities = await listFacilities()
  sendData(res, facilities)
})

export const getFacility = asyncHandler(async (req, res) => {
  const facilityId = requireUuid(req.params.id, 'facility_id')
  const facility = await getFacilityById(facilityId)
  sendData(res, facility)
})

export const getFacilitySettingsController = asyncHandler(async (req, res) => {
  const facilityId = requireUuid(req.params.id, 'facility_id')
  const settings = await getFacilitySettings(facilityId)
  sendData(res, settings)
})

export const updateFacilitySettingsController = asyncHandler(async (req, res) => {
  const facilityId = requireUuid(req.params.id, 'facility_id')
  const settings = await updateFacilitySettings(facilityId, req.body)
  sendData(res, settings)
})
