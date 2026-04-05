const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^\+?[0-9()\-\s.]{6,20}$/
const TIME_PATTERN = /^\d{2}:\d{2}$/

export const settingsTimezoneOptions = [
  { value: 'Australia/Sydney', label: 'Sydney / Melbourne (AEST/AEDT)' },
  { value: 'Australia/Brisbane', label: 'Brisbane (AEST)' },
  { value: 'Australia/Hobart', label: 'Hobart (AEST/AEDT)' },
  { value: 'Australia/Adelaide', label: 'Adelaide (ACST/ACDT)' },
  { value: 'Australia/Darwin', label: 'Darwin (ACST)' },
  { value: 'Australia/Perth', label: 'Perth (AWST)' }
]

const toTrimmedString = (value) => String(value ?? '').trim()
const normalizeEmail = (value) => toTrimmedString(value).toLowerCase()
const normalizePhoneLookup = (value) => toTrimmedString(value).replace(/[^\d+]/g, '')
const normalizeBoolean = (value, fallback = false) => (typeof value === 'boolean' ? value : fallback)

const buildRecipientKey = (recipient) => {
  const channel = recipient?.channel === 'sms' ? 'sms' : 'email'
  const target = channel === 'sms'
    ? normalizePhoneLookup(recipient?.target ?? recipient?.phone)
    : normalizeEmail(recipient?.target ?? recipient?.email)

  return `${channel}:${target}`
}

const dedupeRecipients = (recipients) => {
  const seen = new Set()

  return recipients.filter((recipient) => {
    const key = buildRecipientKey(recipient)

    if (!key || seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

const syncAlertRecipients = ({ currentSettings, form }) => {
  const currentRecipients = Array.isArray(currentSettings?.alert_recipients)
    ? currentSettings.alert_recipients
    : []
  const originalEmail = normalizeEmail(currentSettings?.manager_details?.email)
  const originalPhone = normalizePhoneLookup(currentSettings?.manager_details?.phone)
  const nextEmail = normalizeEmail(form.manager_email)
  const nextPhone = toTrimmedString(form.manager_phone)
  const nextName = toTrimmedString(form.manager_name)
  let hasActiveEmailRecipient = false
  let hasActiveSmsRecipient = false

  const recipients = currentRecipients.map((recipient) => {
    const channel = recipient?.channel === 'sms' ? 'sms' : 'email'
    const nextRecipient = {
      ...recipient,
      channel,
      target: toTrimmedString(recipient?.target ?? recipient?.email ?? recipient?.phone),
      is_active: recipient?.is_active !== false
    }

    if (
      channel === 'email'
      && originalEmail
      && normalizeEmail(nextRecipient.target) === originalEmail
    ) {
      nextRecipient.name = nextName
      nextRecipient.target = nextEmail
    }

    if (
      channel === 'sms'
      && originalPhone
      && normalizePhoneLookup(nextRecipient.target) === originalPhone
    ) {
      nextRecipient.name = nextName
      nextRecipient.target = nextPhone
    }

    if (nextRecipient.is_active !== false && channel === 'email') {
      hasActiveEmailRecipient = true
    }

    if (nextRecipient.is_active !== false && channel === 'sms') {
      hasActiveSmsRecipient = true
    }

    return nextRecipient
  })

  if (form.email_alerts_enabled && !hasActiveEmailRecipient) {
    recipients.unshift({
      id: 'primary-contact-email',
      name: nextName,
      channel: 'email',
      target: nextEmail,
      is_active: true
    })
  }

  if (form.sms_alerts_enabled && !hasActiveSmsRecipient) {
    recipients.push({
      id: 'primary-contact-sms',
      name: nextName,
      channel: 'sms',
      target: nextPhone,
      is_active: true
    })
  }

  return dedupeRecipients(recipients)
}

export const buildSettingsForm = (settings) => ({
  facility_name: toTrimmedString(settings?.facility_details?.name),
  manager_name: toTrimmedString(settings?.manager_details?.name),
  manager_role: toTrimmedString(settings?.manager_details?.role ?? 'Facility manager'),
  manager_email: toTrimmedString(settings?.manager_details?.email),
  manager_phone: toTrimmedString(settings?.manager_details?.phone),
  timezone: toTrimmedString(settings?.regional_settings?.timezone ?? 'Australia/Sydney'),
  daily_alert_time: toTrimmedString(settings?.alert_preferences?.daily_alert_time ?? '07:00'),
  email_alerts_enabled: normalizeBoolean(settings?.alert_preferences?.email_alerts_enabled, false),
  in_app_alerts_enabled: normalizeBoolean(settings?.alert_preferences?.in_app_alerts_enabled, true),
  urgent_breach_alerts_enabled: normalizeBoolean(settings?.alert_preferences?.urgent_breach_alerts_enabled, true),
  sms_alerts_enabled: normalizeBoolean(settings?.alert_preferences?.sms_alerts_enabled, false)
})

export const validateSettingsForm = (form) => {
  if (!toTrimmedString(form.manager_name)) {
    return 'Primary contact name is required.'
  }

  if (!toTrimmedString(form.manager_role)) {
    return 'Role or title is required.'
  }

  if (!toTrimmedString(form.facility_name)) {
    return 'Facility name is required.'
  }

  if (!EMAIL_PATTERN.test(normalizeEmail(form.manager_email))) {
    return 'Enter a valid email address for the primary contact.'
  }

  if (!PHONE_PATTERN.test(toTrimmedString(form.manager_phone))) {
    return 'Enter a valid phone number for the primary contact.'
  }

  if (!TIME_PATTERN.test(toTrimmedString(form.daily_alert_time))) {
    return 'Daily alert time must use HH:MM.'
  }

  if (!settingsTimezoneOptions.some((option) => option.value === form.timezone)) {
    return 'Select a valid timezone.'
  }

  return ''
}

export const buildSettingsPayload = ({ currentSettings, form }) => ({
  facility_details: {
    ...currentSettings.facility_details,
    name: toTrimmedString(form.facility_name)
  },
  manager_details: {
    ...currentSettings.manager_details,
    name: toTrimmedString(form.manager_name),
    role: toTrimmedString(form.manager_role),
    email: normalizeEmail(form.manager_email),
    phone: toTrimmedString(form.manager_phone)
  },
  alert_preferences: {
    ...currentSettings.alert_preferences,
    daily_alert_time: toTrimmedString(form.daily_alert_time),
    email_alerts_enabled: normalizeBoolean(form.email_alerts_enabled, false),
    in_app_alerts_enabled: normalizeBoolean(form.in_app_alerts_enabled, true),
    sms_alerts_enabled: normalizeBoolean(form.sms_alerts_enabled, false),
    urgent_breach_alerts_enabled: normalizeBoolean(form.urgent_breach_alerts_enabled, true)
  },
  anacc_settings: {
    ...currentSettings.anacc_settings
  },
  alert_recipients: syncAlertRecipients({ currentSettings, form }),
  regional_settings: {
    ...currentSettings.regional_settings,
    timezone: toTrimmedString(form.timezone)
  }
})

export const isSettingsFormDirty = ({ currentSettings, form }) => {
  if (!currentSettings) {
    return false
  }

  const initialForm = buildSettingsForm(currentSettings)

  return JSON.stringify(initialForm) !== JSON.stringify({
    ...initialForm,
    ...form,
    manager_email: normalizeEmail(form.manager_email),
    facility_name: toTrimmedString(form.facility_name),
    manager_name: toTrimmedString(form.manager_name),
    manager_phone: toTrimmedString(form.manager_phone),
    manager_role: toTrimmedString(form.manager_role),
    timezone: toTrimmedString(form.timezone),
    daily_alert_time: toTrimmedString(form.daily_alert_time)
  })
}
