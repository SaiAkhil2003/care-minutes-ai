import { invariant } from './http.js'
import { normalizeDateString, isValidDateString } from '../../../shared/careCalculations.js'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TIME_PATTERN = /^\d{2}:\d{2}(?::\d{2})?$/
const ISO_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const STAFF_TYPES = new Set(['rn', 'en', 'pcw'])
const EMPLOYMENT_TYPES = new Set(['permanent', 'part_time', 'casual', 'agency'])

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0

export const requireUuid = (value, fieldName) => {
  invariant(isNonEmptyString(value), 400, `${fieldName} is required`)
  invariant(UUID_PATTERN.test(value), 400, `${fieldName} must be a valid UUID`)
  return value
}

export const requireDate = (value, fieldName) => {
  const dateString = normalizeDateString(value)
  invariant(dateString, 400, `${fieldName} is required`)
  invariant(isValidDateString(dateString), 400, `${fieldName} must be a valid date`)
  return dateString
}

export const optionalDate = (value, fieldName) => {
  if (value === undefined || value === null || value === '') {
    return null
  }

  return requireDate(value, fieldName)
}

export const requireDateRange = (startDate, endDate, startFieldName = 'start_date', endFieldName = 'end_date') => {
  const normalizedStartDate = requireDate(startDate, startFieldName)
  const normalizedEndDate = requireDate(endDate, endFieldName)
  invariant(
    normalizedStartDate <= normalizedEndDate,
    400,
    `${startFieldName} must be on or before ${endFieldName}`
  )

  return {
    startDate: normalizedStartDate,
    endDate: normalizedEndDate
  }
}

export const requireString = (value, fieldName) => {
  invariant(isNonEmptyString(value), 400, `${fieldName} is required`)
  return value.trim()
}

export const optionalString = (value) => {
  if (value === undefined || value === null) {
    return null
  }

  const normalizedValue = String(value).trim()
  return normalizedValue ? normalizedValue : null
}

export const requireEmail = (value, fieldName) => {
  const email = requireString(value, fieldName)
  invariant(EMAIL_PATTERN.test(email), 400, `${fieldName} must be a valid email address`)
  return email.toLowerCase()
}

export const optionalEmail = (value, fieldName) => {
  if (value === undefined || value === null || value === '') {
    return null
  }

  return requireEmail(value, fieldName)
}

export const optionalNumber = (value, fieldName) => {
  if (value === undefined || value === null || value === '') {
    return null
  }

  const numericValue = Number(value)
  invariant(Number.isFinite(numericValue), 400, `${fieldName} must be a valid number`)
  return numericValue
}

export const optionalNonNegativeNumber = (value, fieldName) => {
  const numericValue = optionalNumber(value, fieldName)

  if (numericValue === null) {
    return null
  }

  invariant(numericValue >= 0, 400, `${fieldName} must be zero or greater`)
  return numericValue
}

export const requirePositiveNumber = (value, fieldName) => {
  const numericValue = Number(value)
  invariant(Number.isFinite(numericValue), 400, `${fieldName} must be a valid number`)
  invariant(numericValue >= 0, 400, `${fieldName} must be zero or greater`)
  return numericValue
}

export const requireStaffType = (value, fieldName = 'staff_type') => {
  const staffType = requireString(value, fieldName).toLowerCase()
  invariant(STAFF_TYPES.has(staffType), 400, `${fieldName} must be one of rn, en, or pcw`)
  return staffType
}

export const requireEmploymentType = (value, fieldName = 'employment_type') => {
  const employmentType = requireString(value, fieldName).toLowerCase()
  invariant(
    EMPLOYMENT_TYPES.has(employmentType),
    400,
    `${fieldName} must be one of permanent, part_time, casual, or agency`
  )
  return employmentType
}

export const requireTime = (value, fieldName) => {
  invariant(isNonEmptyString(value), 400, `${fieldName} is required`)
  const normalizedValue = value.trim()
  invariant(
    TIME_PATTERN.test(normalizedValue) || ISO_DATE_TIME_PATTERN.test(normalizedValue),
    400,
    `${fieldName} must be a valid time in HH:MM, HH:MM:SS, or ISO date-time format`
  )
  return normalizedValue
}
