import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildSettingsForm,
  buildSettingsPayload,
  isSettingsFormDirty,
  validateSettingsForm
} from './settingsView.js'

const baseSettings = {
  facility_details: {
    name: 'Harbour View Care',
    abn: '51824753556',
    state: 'NSW',
    street_address: '12 Seabreeze Avenue',
    postcode: '2000',
    resident_count: '32'
  },
  manager_details: {
    name: 'Sarah Nguyen',
    role: 'Director of Nursing',
    email: 'sarah.nguyen@example.com',
    phone: '0400000001'
  },
  alert_preferences: {
    daily_alert_time: '07:00',
    in_app_alerts_enabled: true,
    email_alerts_enabled: true,
    sms_alerts_enabled: false,
    urgent_breach_alerts_enabled: true
  },
  anacc_settings: {
    rate_per_resident_per_day: '31.64',
    care_minutes_target: '215',
    rn_minutes_target: '44'
  },
  alert_recipients: [
    {
      id: 'primary-email',
      name: 'Sarah Nguyen',
      channel: 'email',
      target: 'sarah.nguyen@example.com',
      is_active: true
    }
  ],
  regional_settings: {
    language: 'English',
    date_format: 'DD/MM/YYYY',
    timezone: 'Australia/Sydney',
    currency_display: 'AUD',
    show_cents: false
  }
}

test('buildSettingsPayload preserves read-only facility compliance inputs and syncs contact email recipients', () => {
  const form = {
    ...buildSettingsForm(baseSettings),
    facility_name: 'Harbour View Care West',
    manager_name: 'Priya Shah',
    manager_role: 'Operations Manager',
    manager_email: 'priya.shah@example.com',
    timezone: 'Australia/Perth',
    email_alerts_enabled: true
  }

  const payload = buildSettingsPayload({
    currentSettings: baseSettings,
    form
  })

  assert.equal(payload.facility_details.name, 'Harbour View Care West')
  assert.equal(payload.facility_details.resident_count, '32')
  assert.equal(payload.anacc_settings.care_minutes_target, '215')
  assert.equal(payload.regional_settings.timezone, 'Australia/Perth')
  assert.equal(payload.manager_details.role, 'Operations Manager')
  assert.equal(payload.alert_recipients[0].target, 'priya.shah@example.com')
})

test('validateSettingsForm catches missing or malformed core inputs', () => {
  assert.equal(validateSettingsForm({
    ...buildSettingsForm(baseSettings),
    manager_email: 'not-an-email'
  }), 'Enter a valid email address for the primary contact.')

  assert.equal(validateSettingsForm({
    ...buildSettingsForm(baseSettings),
    daily_alert_time: '7am'
  }), 'Daily alert time must use HH:MM.')
})

test('isSettingsFormDirty detects user changes but ignores already-normalized values', () => {
  const initialForm = buildSettingsForm(baseSettings)

  assert.equal(isSettingsFormDirty({
    currentSettings: baseSettings,
    form: initialForm
  }), false)

  assert.equal(isSettingsFormDirty({
    currentSettings: baseSettings,
    form: {
      ...initialForm,
      facility_name: 'Harbour View Care West'
    }
  }), true)
})
