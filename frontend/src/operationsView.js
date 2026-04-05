const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^\+?[0-9()\-\s.]{6,20}$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^\d{2}:\d{2}$/

const toTrimmedString = (value) => String(value ?? '').trim()

export const normalizeEmailAddress = (value) => toTrimmedString(value).toLowerCase()

export const normalizeStaffLookupKey = (value) => toTrimmedString(value).toLowerCase()

const isValidDateValue = (value) => DATE_PATTERN.test(toTrimmedString(value))

const isValidTimeValue = (value) => {
  const normalizedValue = toTrimmedString(value)

  if (!TIME_PATTERN.test(normalizedValue)) {
    return false
  }

  const [hours, minutes] = normalizedValue.split(':').map(Number)
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59
}

const toMinutes = (value) => {
  const [hours, minutes] = toTrimmedString(value).split(':').map(Number)
  return (hours * 60) + minutes
}

const calculateShiftDurationMinutes = ({ startTime, endTime }) => {
  const startMinutes = toMinutes(startTime)
  const endMinutes = toMinutes(endTime)

  if (startMinutes === endMinutes) {
    return 1440
  }

  return endMinutes > startMinutes
    ? endMinutes - startMinutes
    : (1440 - startMinutes) + endMinutes
}

export const validateStaffForm = (form) => {
  if (!toTrimmedString(form?.full_name)) {
    return 'Full name is required.'
  }

  const email = toTrimmedString(form?.email)
  if (email && !EMAIL_PATTERN.test(normalizeEmailAddress(email))) {
    return 'Enter a valid email address or leave the field blank.'
  }

  const phone = toTrimmedString(form?.phone)
  if (phone && !PHONE_PATTERN.test(phone)) {
    return 'Enter a valid phone number or leave the field blank.'
  }

  return ''
}

export const validateShiftForm = ({ form, staffIds }) => {
  if (!form?.staff_id || !form?.shift_date || !form?.start_time || !form?.end_time) {
    return 'Staff, date, start time, and end time are required.'
  }

  if (!(staffIds instanceof Set) || !staffIds.has(form.staff_id)) {
    return 'Select a valid staff member for the current facility.'
  }

  if (!isValidDateValue(form.shift_date)) {
    return 'Enter a valid shift date.'
  }

  if (!isValidTimeValue(form.start_time) || !isValidTimeValue(form.end_time)) {
    return 'Enter valid start and end times in HH:MM.'
  }

  const durationMinutes = calculateShiftDurationMinutes({
    startTime: form.start_time,
    endTime: form.end_time
  })

  if (durationMinutes <= 0 || durationMinutes > 1440) {
    return 'Shift duration must be greater than 0 and no more than 24 hours.'
  }

  return ''
}

export const validateReportRange = ({ start_date: startDate, end_date: endDate }) => {
  if (!startDate || !endDate) {
    return 'Start and end dates are required.'
  }

  if (!isValidDateValue(startDate) || !isValidDateValue(endDate)) {
    return 'Enter a valid report date range.'
  }

  if (startDate > endDate) {
    return 'Start date must be on or before end date.'
  }

  return ''
}

const parseCsvRow = (line) => {
  const cells = []
  let current = ''
  let isQuoted = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    const nextCharacter = line[index + 1]

    if (character === '"' && isQuoted && nextCharacter === '"') {
      current += '"'
      index += 1
      continue
    }

    if (character === '"') {
      isQuoted = !isQuoted
      continue
    }

    if (character === ',' && !isQuoted) {
      cells.push(current.trim())
      current = ''
      continue
    }

    current += character
  }

  cells.push(current.trim())
  return cells
}

export const buildShiftImportPayloads = ({
  csvText,
  staffById,
  staffByNormalizedName
}) => {
  const rows = String(csvText ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (rows.length < 2) {
    throw new Error('CSV must include a header row and at least one shift row.')
  }

  const headers = parseCsvRow(rows[0]).map((header) => header.trim().toLowerCase())
  const requiredFields = ['shift_date', 'start_time', 'end_time']

  if (!requiredFields.every((field) => headers.includes(field))) {
    throw new Error('CSV requires shift_date, start_time, and end_time columns.')
  }

  const payloads = []
  const seenRows = new Set()

  for (let index = 1; index < rows.length; index += 1) {
    const values = parseCsvRow(rows[index])
    const row = Object.fromEntries(headers.map((header, headerIndex) => [header, values[headerIndex] ?? '']))
    const staffId = toTrimmedString(row.staff_id)
    const matchingStaff = staffId
      ? staffById.get(staffId)
      : staffByNormalizedName.get(normalizeStaffLookupKey(row.staff_name))

    if (!matchingStaff?.id) {
      throw new Error(`Unable to match staff on CSV row ${index + 1}. Include staff_id or an exact staff_name.`)
    }

    const payload = {
      staff_id: matchingStaff.id,
      shift_date: toTrimmedString(row.shift_date),
      start_time: toTrimmedString(row.start_time),
      end_time: toTrimmedString(row.end_time),
      notes: toTrimmedString(row.notes)
    }

    const validationError = validateShiftForm({
      form: payload,
      staffIds: new Set([matchingStaff.id])
    })

    if (validationError) {
      throw new Error(`CSV row ${index + 1}: ${validationError}`)
    }

    const dedupeKey = [
      payload.staff_id,
      payload.shift_date,
      payload.start_time,
      payload.end_time
    ].join(':')

    if (seenRows.has(dedupeKey)) {
      throw new Error(`CSV row ${index + 1} duplicates another shift row in this file.`)
    }

    seenRows.add(dedupeKey)
    payloads.push(payload)
  }

  return payloads
}
