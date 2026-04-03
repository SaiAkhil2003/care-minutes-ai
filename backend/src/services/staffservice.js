import { saveDailyComplianceForDates } from './complianceservice.js'
import { AppError } from '../utils/errors.js'
import {
  requireEmploymentType,
  requireStaffType,
  requireString,
  requireUuid,
  optionalString
} from '../utils/validation.js'
import { getRepository } from '../data/repository.js'

const buildStaffPayload = (payload, requireAllFields = true) => {
  const data = {}

  if (requireAllFields || payload.full_name !== undefined) {
    data.full_name = requireString(payload.full_name, 'full_name')
  }

  if (requireAllFields || payload.staff_type !== undefined) {
    data.staff_type = requireStaffType(payload.staff_type)
  }

  if (requireAllFields || payload.employment_type !== undefined) {
    data.employment_type = requireEmploymentType(payload.employment_type)
  }

  if (payload.email !== undefined) {
    data.email = optionalString(payload.email)
  }

  if (payload.phone !== undefined) {
    data.phone = optionalString(payload.phone)
  }

  return data
}

export const listStaff = async (facilityId) => {
  requireUuid(facilityId, 'facility_id')
  return getRepository().listStaff(facilityId)
}

export const getStaffById = async (facilityId, staffId) => {
  requireUuid(facilityId, 'facility_id')
  requireUuid(staffId, 'staff_id')
  return getRepository().getStaffById(facilityId, staffId)
}

export const createStaff = async (payload) => {
  const facilityId = requireUuid(payload.facility_id, 'facility_id')
  const insertPayload = buildStaffPayload(payload, true)
  return getRepository().createStaff({
    facility_id: facilityId,
    ...insertPayload
  })
}

export const updateStaff = async (facilityId, staffId, payload) => {
  requireUuid(facilityId, 'facility_id')
  requireUuid(staffId, 'staff_id')

  const updatePayload = buildStaffPayload(payload, false)

  if (!Object.keys(updatePayload).length) {
    throw new AppError(400, 'At least one staff field must be provided')
  }
  return getRepository().updateStaff(facilityId, staffId, updatePayload)
}

export const deleteStaff = async (facilityId, staffId) => {
  requireUuid(facilityId, 'facility_id')
  requireUuid(staffId, 'staff_id')
  await getStaffById(facilityId, staffId)
  const impactedShifts = await getRepository().listShiftsByStaff(facilityId, staffId)
  await getRepository().deleteStaff(facilityId, staffId)

  const impactedDates = [...new Set((impactedShifts ?? []).map((shift) => shift.shift_date).filter(Boolean))]

  if (impactedDates.length) {
    await saveDailyComplianceForDates(facilityId, impactedDates)
  }

  return {
    id: staffId,
    deleted: true
  }
}
