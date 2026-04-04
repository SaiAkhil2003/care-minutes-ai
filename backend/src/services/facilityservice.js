import { randomUUID } from 'node:crypto'
import { getTodayInTimeZone } from '../../../shared/careCalculations.js'
import { invariant } from '../utils/http.js'
import {
  optionalEmail,
  optionalNonNegativeNumber,
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
const DEFAULT_LOCALE = 'en-AU'
const DEFAULT_WEEK_START = 'Monday'
const DEFAULT_SEND_TIME = '07:00'
const DEFAULT_SUBSIDY_MODEL = 'AN-ACC'
const DEFAULT_PROTECTED_REVENUE_BUFFER = '2'
const VALID_RECIPIENT_CHANNELS = new Set(['email', 'in_app'])
const VALID_WEEK_STARTS = new Set([
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday'
])

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
    full_name: 'Operations manager',
    email: facility?.email ?? '',
    phone: facility?.phone ?? ''
  }

const buildDefaultRecipients = (facility, manager) => [
  facility?.email
    ? {
        id: 'facility-email',
        name: facility.name,
        email: facility.email,
        channel: 'email',
        role: 'Facility inbox'
      }
    : null,
  manager?.email
    ? {
        id: manager.id ?? 'manager-email',
        name: manager.full_name,
        email: manager.email,
        channel: 'email',
        role: 'Clinical lead'
      }
    : null
].filter(Boolean)

const mapStoredSettingsToResponse = ({ facility, storedSettings, manager, hasAlerts }) => ({
  facility_details: {
    name: facility?.name ?? '',
    address: facility?.address ?? '',
    phone: facility?.phone ?? '',
    email: facility?.email ?? '',
    timezone: facility?.timezone ?? DEFAULT_TIMEZONE,
    resident_count: String(facility?.resident_count ?? '')
  },
  manager_details: {
    full_name: storedSettings?.manager_full_name ?? manager?.full_name ?? 'Operations manager',
    role: storedSettings?.manager_role ?? 'Director of Nursing',
    email: storedSettings?.manager_email ?? manager?.email ?? facility?.email ?? '',
    phone: storedSettings?.manager_phone ?? manager?.phone ?? facility?.phone ?? ''
  },
  alert_preferences: {
    send_time: String(storedSettings?.alert_send_time ?? DEFAULT_SEND_TIME).slice(0, 5),
    in_app_enabled: storedSettings?.alert_in_app_enabled ?? true,
    email_enabled: storedSettings?.alert_email_enabled ?? Boolean(facility?.email),
    escalate_rn_gap: storedSettings?.alert_escalate_rn_gap ?? true,
    include_weekly_digest: storedSettings?.alert_include_weekly_digest ?? hasAlerts
  },
  anacc_settings: {
    care_minutes_target: String(facility?.care_minutes_target ?? ''),
    rn_minutes_target: String(facility?.rn_minutes_target ?? ''),
    subsidy_model: storedSettings?.subsidy_model ?? DEFAULT_SUBSIDY_MODEL,
    protected_revenue_buffer: String(
      storedSettings?.protected_revenue_buffer ?? DEFAULT_PROTECTED_REVENUE_BUFFER
    )
  },
  alert_recipients: Array.isArray(storedSettings?.alert_recipients) && storedSettings.alert_recipients.length
    ? storedSettings.alert_recipients
    : buildDefaultRecipients(facility, manager),
  regional_settings: {
    language: storedSettings?.language ?? DEFAULT_LANGUAGE,
    locale: storedSettings?.locale ?? DEFAULT_LOCALE,
    week_starts_on: storedSettings?.week_starts_on ?? DEFAULT_WEEK_START
  }
})

const normalizeRecipient = (recipient, index) => {
  const data = requireObject(recipient, `alert_recipients[${index}]`)
  const channel = requireString(data.channel, `alert_recipients[${index}].channel`)
  invariant(
    VALID_RECIPIENT_CHANNELS.has(channel),
    400,
    `alert_recipients[${index}].channel must be email or in_app`
  )

  return {
    id: optionalString(data.id) ?? randomUUID(),
    name: requireString(data.name, `alert_recipients[${index}].name`),
    email: requireEmail(data.email, `alert_recipients[${index}].email`),
    channel,
    role: requireString(data.role, `alert_recipients[${index}].role`)
  }
}

const validateSettingsPayload = (payload) => {
  const data = requireObject(payload, 'settings')
  const facilityDetails = requireObject(data.facility_details, 'facility_details')
  const managerDetails = requireObject(data.manager_details, 'manager_details')
  const alertPreferences = requireObject(data.alert_preferences, 'alert_preferences')
  const anaccSettings = requireObject(data.anacc_settings, 'anacc_settings')
  const regionalSettings = requireObject(data.regional_settings, 'regional_settings')
  const recipients = Array.isArray(data.alert_recipients) ? data.alert_recipients : []

  const weekStartsOn = requireString(regionalSettings.week_starts_on, 'regional_settings.week_starts_on')
  invariant(
    VALID_WEEK_STARTS.has(weekStartsOn),
    400,
    'regional_settings.week_starts_on must be a valid weekday'
  )

  const normalizedRecipients = recipients.map(normalizeRecipient)
  const recipientKeys = new Set()
  for (const recipient of normalizedRecipients) {
    const recipientKey = `${recipient.channel}:${recipient.email}`
    invariant(!recipientKeys.has(recipientKey), 400, 'alert_recipients must not contain duplicates')
    recipientKeys.add(recipientKey)
  }

  const validated = {
    facility_details: {
      name: requireString(facilityDetails.name, 'facility_details.name'),
      address: optionalString(facilityDetails.address),
      phone: optionalString(facilityDetails.phone),
      email: requireEmail(facilityDetails.email, 'facility_details.email'),
      timezone: requireString(facilityDetails.timezone, 'facility_details.timezone'),
      resident_count: requirePositiveNumber(facilityDetails.resident_count, 'facility_details.resident_count')
    },
    manager_details: {
      full_name: requireString(managerDetails.full_name, 'manager_details.full_name'),
      role: requireString(managerDetails.role, 'manager_details.role'),
      email: optionalEmail(managerDetails.email, 'manager_details.email'),
      phone: optionalString(managerDetails.phone)
    },
    alert_preferences: {
      send_time: requireTime(alertPreferences.send_time, 'alert_preferences.send_time').slice(0, 5),
      in_app_enabled: requireBoolean(alertPreferences.in_app_enabled, 'alert_preferences.in_app_enabled'),
      email_enabled: requireBoolean(alertPreferences.email_enabled, 'alert_preferences.email_enabled'),
      escalate_rn_gap: requireBoolean(alertPreferences.escalate_rn_gap, 'alert_preferences.escalate_rn_gap'),
      include_weekly_digest: requireBoolean(
        alertPreferences.include_weekly_digest,
        'alert_preferences.include_weekly_digest'
      )
    },
    anacc_settings: {
      care_minutes_target: requirePositiveNumber(
        anaccSettings.care_minutes_target,
        'anacc_settings.care_minutes_target'
      ),
      rn_minutes_target: requirePositiveNumber(
        anaccSettings.rn_minutes_target,
        'anacc_settings.rn_minutes_target'
      ),
      subsidy_model: requireString(anaccSettings.subsidy_model, 'anacc_settings.subsidy_model'),
      protected_revenue_buffer: optionalNonNegativeNumber(
        anaccSettings.protected_revenue_buffer,
        'anacc_settings.protected_revenue_buffer'
      ) ?? 0
    },
    alert_recipients: normalizedRecipients,
    regional_settings: {
      language: requireString(regionalSettings.language, 'regional_settings.language'),
      locale: requireString(regionalSettings.locale, 'regional_settings.locale'),
      week_starts_on: weekStartsOn
    }
  }

  if (validated.alert_preferences.email_enabled) {
    const emailRecipients = validated.alert_recipients.filter((recipient) => recipient.channel === 'email')
    invariant(emailRecipients.length > 0, 400, 'At least one email alert recipient is required when email delivery is enabled')
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
  const [facility, staff, storedSettings, alerts] = await Promise.all([
    repository.getFacilityById(facilityId),
    repository.listStaff(facilityId),
    repository.getFacilitySettings(facilityId),
    repository.listAlerts(facilityId, { limit: 1 })
  ])

  return mapStoredSettingsToResponse({
    facility,
    storedSettings,
    manager: deriveManager(staff, facility),
    hasAlerts: Boolean(alerts?.length)
  })
}

export const updateFacilitySettings = async (facilityId, payload) => {
  requireUuid(facilityId, 'facility_id')

  const validated = validateSettingsPayload(payload)
  const repository = getRepository()
  const currentFacility = await repository.getFacilityById(facilityId)
  const effectiveDate = getTodayInTimeZone(
    validated.facility_details.timezone || currentFacility.timezone || DEFAULT_TIMEZONE
  )

  await repository.updateFacility(facilityId, {
    name: validated.facility_details.name,
    address: validated.facility_details.address,
    phone: validated.facility_details.phone,
    email: validated.facility_details.email,
    timezone: validated.facility_details.timezone,
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
    manager_full_name: validated.manager_details.full_name,
    manager_role: validated.manager_details.role,
    manager_email: validated.manager_details.email,
    manager_phone: validated.manager_details.phone,
    alert_send_time: validated.alert_preferences.send_time,
    alert_in_app_enabled: validated.alert_preferences.in_app_enabled,
    alert_email_enabled: validated.alert_preferences.email_enabled,
    alert_escalate_rn_gap: validated.alert_preferences.escalate_rn_gap,
    alert_include_weekly_digest: validated.alert_preferences.include_weekly_digest,
    subsidy_model: validated.anacc_settings.subsidy_model,
    protected_revenue_buffer: validated.anacc_settings.protected_revenue_buffer,
    language: validated.regional_settings.language,
    locale: validated.regional_settings.locale,
    week_starts_on: validated.regional_settings.week_starts_on,
    alert_recipients: validated.alert_recipients
  })

  return getFacilitySettings(facilityId)
}

export const ensureFacilitySettingsPayload = validateSettingsPayload
