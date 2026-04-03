import { getStaffById } from './staffservice.js'
import { saveDailyComplianceForDates } from './complianceservice.js'
import { AppError } from '../utils/errors.js'
import { invariant } from '../utils/http.js'
import {
  calculateShiftDurationMinutes,
  getImpactedDatesForShift,
  addDaysToDateString
} from '../../../shared/careCalculations.js'
import {
  optionalDate,
  optionalString,
  requireDate,
  requireTime,
  requireUuid
} from '../utils/validation.js'
import { getRepository } from '../data/repository.js'

const buildShiftDateTimes = ({ shiftDate, startTime, endTime }) => {
  const normalizedStartTime = requireTime(startTime, 'start_time')
  const normalizedEndTime = requireTime(endTime, 'end_time')

  const startDateTime = normalizedStartTime.includes('T')
    ? normalizedStartTime
    : `${shiftDate}T${normalizedStartTime.length === 5 ? `${normalizedStartTime}:00` : normalizedStartTime}`

  let endDateTime = normalizedEndTime.includes('T')
    ? normalizedEndTime
    : `${shiftDate}T${normalizedEndTime.length === 5 ? `${normalizedEndTime}:00` : normalizedEndTime}`

  const durationMinutes = calculateShiftDurationMinutes({
    shift_date: shiftDate,
    start_time: startDateTime,
    end_time: endDateTime
  })

  if (durationMinutes <= 0 && !normalizedEndTime.includes('T')) {
    const nextDate = addDaysToDateString(shiftDate, 1)
    endDateTime = `${nextDate}T${normalizedEndTime.length === 5 ? `${normalizedEndTime}:00` : normalizedEndTime}`
  }

  const correctedDurationMinutes = calculateShiftDurationMinutes({
    shift_date: shiftDate,
    start_time: startDateTime,
    end_time: endDateTime
  })

  invariant(correctedDurationMinutes > 0, 400, 'end_time must be later than start_time')
  invariant(correctedDurationMinutes <= 1440, 400, 'shift duration must not exceed 24 hours')

  return {
    start_time: startDateTime,
    end_time: endDateTime,
    duration_minutes: correctedDurationMinutes
  }
}

const buildShiftPayload = async (facilityId, payload, currentShift = null) => {
  const staffId = requireUuid(payload.staff_id ?? currentShift?.staff_id, 'staff_id')
  const shiftDate = requireDate(payload.shift_date ?? currentShift?.shift_date, 'shift_date')

  const shiftTimes = buildShiftDateTimes({
    shiftDate,
    startTime: payload.start_time ?? currentShift?.start_time,
    endTime: payload.end_time ?? currentShift?.end_time
  })

  const staffMember = await getStaffById(facilityId, staffId)

  return {
    staff_id: staffId,
    shift_date: shiftDate,
    start_time: shiftTimes.start_time,
    end_time: shiftTimes.end_time,
    duration_minutes: shiftTimes.duration_minutes,
    staff_type_snapshot: staffMember.staff_type,
    employment_type_snapshot: staffMember.employment_type,
    notes: payload.notes !== undefined ? optionalString(payload.notes) : currentShift?.notes ?? null
  }
}

const checkShiftOverlap = async (
  facilityId,
  staffId,
  startTime,
  endTime,
  excludeShiftId = null
) => {
  const data = (await getRepository().listShiftsByStaff(facilityId, staffId))
    .filter((shift) => !excludeShiftId || shift.id !== excludeShiftId)

  const newStart = new Date(startTime).getTime()
  const newEnd = new Date(endTime).getTime()

  for (const shift of data ?? []) {
    const existingStart = new Date(shift.start_time).getTime()
    const existingEnd = new Date(shift.end_time).getTime()

    if (newStart === existingStart && newEnd === existingEnd) {
      throw new AppError(400, 'Duplicate shift already exists for this staff')
    }

    if (newStart < existingEnd && newEnd > existingStart) {
      throw new AppError(400, 'Shift overlaps with existing shift for this staff')
    }
  }
}

export const listShifts = async (facilityId, { startDate = null, endDate = null } = {}) => {
  requireUuid(facilityId, 'facility_id')

  const effectiveStartDate = startDate ? optionalDate(startDate, 'start_date') : null
  const effectiveEndDate = endDate ? optionalDate(endDate, 'end_date') : null
  return getRepository().listShifts(facilityId, {
    startDate: effectiveStartDate,
    endDate: effectiveEndDate
  })
}

export const getShiftById = async (facilityId, shiftId) => {
  requireUuid(facilityId, 'facility_id')
  requireUuid(shiftId, 'shift_id')
  return getRepository().getShiftById(facilityId, shiftId)
}

export const createShift = async (payload) => {
  const facilityId = requireUuid(payload.facility_id, 'facility_id')
  const insertPayload = await buildShiftPayload(facilityId, payload)

  await checkShiftOverlap(
    facilityId,
    insertPayload.staff_id,
    insertPayload.start_time,
    insertPayload.end_time
  )
  const data = await getRepository().createShift({
    facility_id: facilityId,
    ...insertPayload
  })

  await saveDailyComplianceForDates(facilityId, getImpactedDatesForShift(data))

  return data
}

export const updateShift = async (facilityId, shiftId, payload) => {
  const currentShift = await getShiftById(facilityId, shiftId)
  const updatePayload = await buildShiftPayload(facilityId, payload, currentShift)

  await checkShiftOverlap(
    facilityId,
    updatePayload.staff_id,
    updatePayload.start_time,
    updatePayload.end_time,
    shiftId
  )
  const data = await getRepository().updateShift(facilityId, shiftId, updatePayload)

  const impactedDates = [
    ...new Set([
      ...getImpactedDatesForShift(currentShift),
      ...getImpactedDatesForShift(data)
    ])
  ]

  await saveDailyComplianceForDates(facilityId, impactedDates)

  return data
}

export const deleteShift = async (facilityId, shiftId) => {
  const currentShift = await getShiftById(facilityId, shiftId)
  await getRepository().deleteShift(facilityId, shiftId)

  await saveDailyComplianceForDates(facilityId, getImpactedDatesForShift(currentShift))

  return {
    id: shiftId,
    deleted: true
  }
}
