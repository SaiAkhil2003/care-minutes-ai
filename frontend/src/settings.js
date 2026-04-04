const DEFAULT_TIMEZONE = 'Australia/Sydney'

export const buildEmptySettingsForm = () => ({
  facility_details: {
    name: '',
    address: '',
    phone: '',
    email: '',
    timezone: DEFAULT_TIMEZONE,
    resident_count: ''
  },
  manager_details: {
    full_name: '',
    role: '',
    email: '',
    phone: ''
  },
  alert_preferences: {
    send_time: '07:00',
    in_app_enabled: true,
    email_enabled: false,
    escalate_rn_gap: true,
    include_weekly_digest: false
  },
  anacc_settings: {
    care_minutes_target: '',
    rn_minutes_target: '',
    subsidy_model: 'AN-ACC',
    protected_revenue_buffer: '2'
  },
  alert_recipients: [],
  regional_settings: {
    language: 'English',
    locale: 'en-AU',
    week_starts_on: 'Monday'
  }
})

export const normalizeSettingsPayload = (payload) => {
  const defaults = buildEmptySettingsForm()

  return {
    facility_details: {
      ...defaults.facility_details,
      ...(payload?.facility_details ?? {})
    },
    manager_details: {
      ...defaults.manager_details,
      ...(payload?.manager_details ?? {})
    },
    alert_preferences: {
      ...defaults.alert_preferences,
      ...(payload?.alert_preferences ?? {})
    },
    anacc_settings: {
      ...defaults.anacc_settings,
      ...(payload?.anacc_settings ?? {})
    },
    alert_recipients: Array.isArray(payload?.alert_recipients)
      ? payload.alert_recipients.map((recipient, index) => ({
          id: recipient?.id ?? `recipient-${index}`,
          name: recipient?.name ?? '',
          email: recipient?.email ?? '',
          channel: recipient?.channel ?? 'email',
          role: recipient?.role ?? 'Recipient'
        }))
      : [],
    regional_settings: {
      ...defaults.regional_settings,
      ...(payload?.regional_settings ?? {})
    }
  }
}

export const validateRecipientDraft = (draft) => {
  const name = String(draft?.name ?? '').trim()
  const email = String(draft?.email ?? '').trim()

  if (!name) {
    return 'Recipient name is required.'
  }

  if (!email) {
    return 'Recipient email is required.'
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'Recipient email must be a valid email address.'
  }

  return ''
}
