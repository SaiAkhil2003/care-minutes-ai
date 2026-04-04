import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildEmptySettingsForm,
  normalizeSettingsPayload,
  validateRecipientDraft
} from './settings.js'

test('normalizeSettingsPayload fills missing settings sections with stable defaults', () => {
  const settings = normalizeSettingsPayload({
    facility_details: {
      name: 'Harbour View Care'
    },
    alert_recipients: [
      {
        name: 'Ops Inbox',
        email: 'ops@example.com'
      }
    ]
  })

  assert.equal(settings.facility_details.name, 'Harbour View Care')
  assert.equal(settings.facility_details.timezone, 'Australia/Sydney')
  assert.equal(settings.alert_preferences.send_time, '07:00')
  assert.equal(settings.anacc_settings.subsidy_model, 'AN-ACC')
  assert.equal(settings.alert_recipients[0].channel, 'email')
  assert.equal(settings.alert_recipients[0].role, 'Recipient')
})

test('buildEmptySettingsForm keeps the UI-safe single-facility MVP defaults', () => {
  const settings = buildEmptySettingsForm()

  assert.equal(settings.manager_details.full_name, '')
  assert.equal(settings.alert_preferences.in_app_enabled, true)
  assert.equal(settings.regional_settings.locale, 'en-AU')
  assert.deepEqual(settings.alert_recipients, [])
})

test('validateRecipientDraft catches blank and malformed recipient input', () => {
  assert.equal(validateRecipientDraft({ name: '', email: '' }), 'Recipient name is required.')
  assert.equal(
    validateRecipientDraft({ name: 'Ops Inbox', email: 'not-an-email' }),
    'Recipient email must be a valid email address.'
  )
  assert.equal(validateRecipientDraft({ name: 'Ops Inbox', email: 'ops@example.com' }), '')
})
