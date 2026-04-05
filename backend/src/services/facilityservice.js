import { randomUUID } from 'node:crypto'
import {
  PENALTY_RATE_PER_RESIDENT,
  getTodayInTimeZone
} from '../../../shared/careCalculations.js'
import { invariant } from '../utils/http.js'
import {
  optionalString,
  requireEmail,
  requirePositiveNumber,
  requireString,
  requireTime,
  requireUuid
} from '../utils/validation.js'
import { getRepository } from '../data/repository.js'

const DEFAULT_TIMEZONE = 'Australia/Sydney'
const DEFAULT_LANGUAGE = 'English'
const DEFAULT_DATE_FORMAT = 'DD/MM/YYYY'
const DEFAULT_CURRENCY_DISPLAY = 'AUD'
const DEFAULT_SEND_TIME = '07:00'
const DEFAULT_FACILITY_STATE = 'NSW'
const DEFAULT_ANACC_RATE = String(PENALTY_RATE_PER_RESIDENT)
const VALID_FACILITY_STATES = new Set(['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA'])
const VALID_RECIPIENT_CHANNELS = new Set(['email', 'sms'])
const VALID_DATE_FORMATS = new Set(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'])
const VALID_CURRENCY_DISPLAYS = new Set(['AUD', 'USD', 'EUR', 'GBP'])
const PHONE_PATTERN = /^\+?[0-9()\-\s.]{6,20}$/
const POSTCODE_PATTERN = /^\d{4}$/
const ABN_PATTERN = /^\d{11}$/

const requireObject = (value, fieldName) => {
  invariant(value && typeof value === 'object' && !Array.isArray(value), 400, `${fieldName} is required`)
  return value
}

const requireBoolean = (value, fieldName) => {
  invariant(typeof value === 'boolean', 400, `${fieldName} must be true or false`)
  return value
}

const deriveManager = (staff = [], facility) =>
  staff.find((member) => member.staff_type === 'rn')
  ?? staff[0]
  ?? {
    full_name: 'Facility manager',
    email: facility?.email ?? '',
    phone: facility?.phone ?? ''
  }

const normalizeAbn = (value, fieldName) => {
  const abn = requireString(value, fieldName).replace(/\s+/g, '')
  invariant(ABN_PATTERN.test(abn), 400, `${fieldName} must be an 11 digit ABN`)
  return abn
}

const requireState = (value, fieldName) => {
  const state = requireString(value, fieldName).toUpperCase()
  invariant(VALID_FACILITY_STATES.has(state), 400, `${fieldName} must be a valid Australian state or territory`)
  return state
}

const requirePostcode = (value, fieldName) => {
  const postcode = requireString(value, fieldName)
  invariant(POSTCODE_PATTERN.test(postcode), 400, `${fieldName} must be a valid 4 digit postcode`)
  return postcode
}

const isValidTimeZone = (value) => {
  try {
    Intl.DateTimeFormat('en-AU', { timeZone: value }).format(new Date())
    return true
  } catch {
    return false
  }
}

const requireTimeZone = (value, fieldName) => {
  const timeZone = requireString(value, fieldName)
  invariant(isValidTimeZone(timeZone), 400, `${fieldName} must be a valid IANA timezone`)
  return timeZone
}

const normalizePhone = (value, fieldName, { required = false } = {}) => {
  if (!required && (value === undefined || value === null || value === '')) {
    return null
  }

  const phone = requireString(value, fieldName)
  invariant(PHONE_PATTERN.test(phone), 400, `${fieldName} must be a valid phone number`)
  return phone
}

const requireEnum = (value, fieldName, allowedValues, errorMessage) => {
  const normalizedValue = requireString(value, fieldName)
  invariant(allowedValues.has(normalizedValue), 400, errorMessage)
  return normalizedValue
}

const normalizeRecipientTarget = (recipient) => {
  if (recipient.channel === 'sms') {
    return recipient.phone.replace(/[^\d+]/g, '')
  }

  return recipient.email
}

const buildFacilityAddress = ({ streetAddress, state, postcode }) =>
  [streetAddress, `${state} ${postcode}`].filter(Boolean).join(', ')

const buildDefaultRecipients = (facility, manager) => [
  manager?.email
    ? {
        id: manager.id ?? 'manager-email',
        name: manager.full_name,
        channel: 'email',
        target: manager.email,
        email: manager.email,
        is_active: true
      }
    : null,
  facility?.email
    ? {
        id: 'facility-email',
        name: facility.name,
        channel: 'email',
        target: facility.email,
        email: facility.email,
        is_active: true
      }
    : null,
  manager?.phone
    ? {
        id: manager.id ? `${manager.id}-sms` : 'manager-sms',
        name: manager.full_name,
        channel: 'sms',
        target: manager.phone,
        phone: manager.phone,
        is_active: true
      }
    : null
].filter(Boolean)

const mapStoredRecipientToResponse = (recipient, index) => {
  const channel = recipient?.channel === 'sms' ? 'sms' : 'email'
  const target = String(
    recipient?.target
      ?? (channel === 'sms' ? recipient?.phone : recipient?.email)
      ?? ''
  ).trim()

  return {
    id: recipient?.id ?? `recipient-${index}`,
    name: String(recipient?.name ?? '').trim(),
    channel,
    target,
    email: channel === 'email' ? target : null,
    phone: channel === 'sms' ? target : null,
    is_active: recipient?.is_active !== false
  }
}

const mapStoredSettingsToResponse = ({ facility, storedSettings, manager }) => ({
  facility_details: {
    name: facility?.name ?? '',
    abn: facility?.abn ?? '',
    state: facility?.state ?? DEFAULT_FACILITY_STATE,
    street_address: facility?.street_address ?? facility?.address ?? '',
    postcode: facility?.postcode ?? '',
    resident_count: String(facility?.resident_count ?? '')
  },
  manager_details: {
    name: storedSettings?.manager_name
      ?? storedSettings?.manager_full_name
      ?? manager?.full_name
      ?? 'Facility manager',
    role: storedSettings?.manager_role ?? 'Facility manager',
    email: storedSettings?.manager_email ?? manager?.email ?? facility?.email ?? '',
    phone: storedSettings?.manager_phone ?? manager?.phone ?? facility?.phone ?? ''
  },
  alert_preferences: {
    daily_alert_time: String(storedSettings?.alert_send_time ?? DEFAULT_SEND_TIME).slice(0, 5),
    in_app_alerts_enabled: storedSettings?.alert_in_app_enabled ?? true,
    email_alerts_enabled: storedSettings?.alert_email_enabled ?? Boolean(facility?.email),
    sms_alerts_enabled: storedSettings?.alert_sms_enabled ?? false,
    urgent_breach_alerts_enabled: storedSettings?.alert_escalate_rn_gap ?? true
  },
  anacc_settings: {
    rate_per_resident_per_day: String(
      storedSettings?.anacc_rate_per_resident ?? DEFAULT_ANACC_RATE
    ),
    care_minutes_target: String(facility?.care_minutes_target ?? ''),
    rn_minutes_target: String(facility?.rn_minutes_target ?? '')
  },
  alert_recipients: Array.isArray(storedSettings?.alert_recipients) && storedSettings.alert_recipients.length
    ? storedSettings.alert_recipients.map(mapStoredRecipientToResponse)
    : buildDefaultRecipients(facility, manager),
  regional_settings: {
    language: storedSettings?.language ?? DEFAULT_LANGUAGE,
    date_format: storedSettings?.date_format ?? DEFAULT_DATE_FORMAT,
    timezone: facility?.timezone ?? DEFAULT_TIMEZONE,
    currency_display: storedSettings?.currency_display ?? DEFAULT_CURRENCY_DISPLAY,
    show_cents: storedSettings?.show_cents ?? false
  }
})

const normalizeRecipient = (recipient, index) => {
  const data = requireObject(recipient, `alert_recipients[${index}]`)
  const channel = requireString(data.channel, `alert_recipients[${index}].channel`).toLowerCase()
  invariant(
    VALID_RECIPIENT_CHANNELS.has(channel),
    400,
    `alert_recipients[${index}].channel must be email or sms`
  )

  const fieldBase = `alert_recipients[${index}]`
  const target = requireString(
    data.target ?? (channel === 'sms' ? data.phone : data.email),
    `${fieldBase}.target`
  )

  const normalizedTarget = channel === 'sms'
    ? normalizePhone(target, `${fieldBase}.target`, { required: true })
    : requireEmail(target, `${fieldBase}.target`)

  return {
    id: optionalString(data.id) ?? randomUUID(),
    name: requireString(data.name, `${fieldBase}.name`),
    channel,
    target: normalizedTarget,
    email: channel === 'email' ? normalizedTarget : null,
    phone: channel === 'sms' ? normalizedTarget : null,
    is_active: data.is_active !== false
  }
}

const validateSettingsPayload = (payload, { currentFacility, currentSettings }) => {
  const data = requireObject(
    payload?.settings && typeof payload.settings === 'object'
      ? payload.settings
      : payload,
    'settings'
  )
  const facilityDetails = requireObject(data.facility_details, 'facility_details')
  const managerDetails = requireObject(data.manager_details, 'manager_details')
  const alertPreferences = requireObject(data.alert_preferences, 'alert_preferences')
  const anaccSettings = requireObject(data.anacc_settings, 'anacc_settings')
  const regionalSettings = requireObject(data.regional_settings, 'regional_settings')
  const recipients = Array.isArray(data.alert_recipients) ? data.alert_recipients : []

  const normalizedRecipients = recipients.map(normalizeRecipient)
  const recipientKeys = new Set()
  for (const recipient of normalizedRecipients) {
    const recipientKey = `${recipient.channel}:${normalizeRecipientTarget(recipient)}`
    invariant(!recipientKeys.has(recipientKey), 400, 'alert_recipients must not contain duplicates')
    recipientKeys.add(recipientKey)
  }

  const careMinutesTarget = anaccSettings.care_minutes_target ?? currentFacility?.care_minutes_target
  const rnMinutesTarget = anaccSettings.rn_minutes_target ?? currentFacility?.rn_minutes_target
  const emailRecipients = normalizedRecipients.filter(
    (recipient) => recipient.channel === 'email' && recipient.is_active !== false
  )
  const smsRecipients = normalizedRecipients.filter(
    (recipient) => recipient.channel === 'sms' && recipient.is_active !== false
  )

  const validated = {
    facility_details: {
      name: requireString(facilityDetails.name, 'facility_details.name'),
      abn: normalizeAbn(facilityDetails.abn, 'facility_details.abn'),
      state: requireState(facilityDetails.state, 'facility_details.state'),
      street_address: requireString(facilityDetails.street_address, 'facility_details.street_address'),
      postcode: requirePostcode(facilityDetails.postcode, 'facility_details.postcode'),
      resident_count: requirePositiveNumber(facilityDetails.resident_count, 'facility_details.resident_count')
    },
    manager_details: {
      name: requireString(
        managerDetails.name ?? managerDetails.full_name,
        'manager_details.name'
      ),
      role: requireString(
        managerDetails.role ?? managerDetails.title ?? currentSettings?.manager_role ?? 'Facility manager',
        'manager_details.role'
      ),
      email: requireEmail(managerDetails.email, 'manager_details.email'),
      phone: normalizePhone(managerDetails.phone, 'manager_details.phone', { required: true })
    },
    alert_preferences: {
      daily_alert_time: requireTime(
        alertPreferences.daily_alert_time ?? alertPreferences.send_time,
        'alert_preferences.daily_alert_time'
      ).slice(0, 5),
      in_app_alerts_enabled: requireBoolean(
        alertPreferences.in_app_alerts_enabled ?? currentSettings?.alert_in_app_enabled ?? true,
        'alert_preferences.in_app_alerts_enabled'
      ),
      email_alerts_enabled: requireBoolean(
        alertPreferences.email_alerts_enabled ?? alertPreferences.email_enabled,
        'alert_preferences.email_alerts_enabled'
      ),
      sms_alerts_enabled: requireBoolean(
        alertPreferences.sms_alerts_enabled ?? alertPreferences.sms_enabled,
        'alert_preferences.sms_alerts_enabled'
      ),
      urgent_breach_alerts_enabled: requireBoolean(
        alertPreferences.urgent_breach_alerts_enabled
          ?? alertPreferences.alert_escalate_rn_gap
          ?? currentSettings?.alert_escalate_rn_gap
          ?? true,
        'alert_preferences.urgent_breach_alerts_enabled'
      )
    },
    anacc_settings: {
      rate_per_resident_per_day: requirePositiveNumber(
        anaccSettings.rate_per_resident_per_day ?? anaccSettings.anacc_rate_per_resident,
        'anacc_settings.rate_per_resident_per_day'
      ),
      rn_minutes_target: requirePositiveNumber(
        rnMinutesTarget,
        'anacc_settings.rn_minutes_target'
      ),
      care_minutes_target: requirePositiveNumber(careMinutesTarget, 'anacc_settings.care_minutes_target')
    },
    alert_recipients: normalizedRecipients,
    regional_settings: {
      language: requireString(regionalSettings.language, 'regional_settings.language'),
      date_format: requireEnum(
        regionalSettings.date_format,
        'regional_settings.date_format',
        VALID_DATE_FORMATS,
        'regional_settings.date_format must be DD/MM/YYYY, MM/DD/YYYY, or YYYY-MM-DD'
      ),
      timezone: requireTimeZone(regionalSettings.timezone, 'regional_settings.timezone'),
      currency_display: requireEnum(
        regionalSettings.currency_display,
        'regional_settings.currency_display',
        VALID_CURRENCY_DISPLAYS,
        'regional_settings.currency_display must be AUD, USD, EUR, or GBP'
      ),
      show_cents: requireBoolean(regionalSettings.show_cents, 'regional_settings.show_cents')
    },
    legacy: {
      alert_include_weekly_digest: currentSettings?.alert_include_weekly_digest ?? false
    }
  }

  if (validated.alert_preferences.email_alerts_enabled) {
    invariant(emailRecipients.length > 0, 400, 'At least one active email alert recipient is required when email alerts are enabled')
  }

  if (validated.alert_preferences.sms_alerts_enabled) {
    invariant(smsRecipients.length > 0, 400, 'At least one active SMS alert recipient is required when SMS alerts are enabled')
  }

  return validated
}

export const listFacilities = async () => {
  return getRepository().listFacilities()
}

export const getFacilityById = async (facilityId) => {
  requireUuid(facilityId, 'facility_id')
  return getRepository().getFacilityById(facilityId)
}

export const getFacilitySettings = async (facilityId) => {
  requireUuid(facilityId, 'facility_id')

  const repository = getRepository()
  const [facility, staff, storedSettings] = await Promise.all([
    repository.getFacilityById(facilityId),
    repository.listStaff(facilityId),
    repository.getFacilitySettings(facilityId)
  ])

  return mapStoredSettingsToResponse({
    facility,
    storedSettings,
    manager: deriveManager(staff, facility)
  })
}

export const updateFacilitySettings = async (facilityId, payload) => {
  requireUuid(facilityId, 'facility_id')

  const repository = getRepository()
  const [currentFacility, currentSettings] = await Promise.all([
    repository.getFacilityById(facilityId),
    repository.getFacilitySettings(facilityId)
  ])
  const validated = validateSettingsPayload(payload, {
    currentFacility,
    currentSettings
  })
  const effectiveDate = getTodayInTimeZone(
    validated.regional_settings.timezone || currentFacility.timezone || DEFAULT_TIMEZONE
  )

  await repository.updateFacility(facilityId, {
    name: validated.facility_details.name,
    abn: validated.facility_details.abn,
    state: validated.facility_details.state,
    street_address: validated.facility_details.street_address,
    postcode: validated.facility_details.postcode,
    address: buildFacilityAddress({
      streetAddress: validated.facility_details.street_address,
      state: validated.facility_details.state,
      postcode: validated.facility_details.postcode
    }),
    timezone: validated.regional_settings.timezone,
    resident_count: validated.facility_details.resident_count,
    care_minutes_target: validated.anacc_settings.care_minutes_target,
    rn_minutes_target: validated.anacc_settings.rn_minutes_target
  })

  await repository.upsertComplianceTarget({
    facility_id: facilityId,
    effective_date: effectiveDate,
    daily_total_target: validated.anacc_settings.care_minutes_target,
    rn_daily_minimum: validated.anacc_settings.rn_minutes_target
  })

  await repository.upsertResidentCount({
    facility_id: facilityId,
    effective_date: effectiveDate,
    resident_count: validated.facility_details.resident_count
  })

  await repository.upsertFacilitySettings({
    facility_id: facilityId,
    manager_name: validated.manager_details.name,
    manager_full_name: validated.manager_details.name,
    manager_role: validated.manager_details.role,
    manager_email: validated.manager_details.email,
    manager_phone: validated.manager_details.phone,
    alert_send_time: validated.alert_preferences.daily_alert_time,
    alert_in_app_enabled: validated.alert_preferences.in_app_alerts_enabled,
    alert_email_enabled: validated.alert_preferences.email_alerts_enabled,
    alert_sms_enabled: validated.alert_preferences.sms_alerts_enabled,
    alert_escalate_rn_gap: validated.alert_preferences.urgent_breach_alerts_enabled,
    alert_include_weekly_digest: validated.legacy.alert_include_weekly_digest,
    anacc_rate_per_resident: validated.anacc_settings.rate_per_resident_per_day,
    language: validated.regional_settings.language,
    date_format: validated.regional_settings.date_format,
    currency_display: validated.regional_settings.currency_display,
    show_cents: validated.regional_settings.show_cents,
    alert_recipients: validated.alert_recipients
  })

  return getFacilitySettings(facilityId)
}

export const ensureFacilitySettingsPayload = validateSettingsPayload
