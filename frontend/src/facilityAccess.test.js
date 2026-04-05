import test from 'node:test'
import assert from 'node:assert/strict'
import {
  FACILITY_NOT_FOUND_MESSAGE,
  PROFILE_NOT_SET_UP_MESSAGE,
  buildFacilitySummaryFromSettings,
  getSettingsEmptyState,
  isMissingProfileError,
  resolveFacilityAccessError
} from './facilityAccess.js'

test('resolveFacilityAccessError maps missing profile responses to a setup error', () => {
  const error = {
    code: 'PGRST116',
    details: 'The result contains 0 rows'
  }

  assert.equal(isMissingProfileError(error), true)
  assert.equal(resolveFacilityAccessError(error), PROFILE_NOT_SET_UP_MESSAGE)
})

test('buildFacilitySummaryFromSettings creates a dashboard-safe fallback facility model', () => {
  const summary = buildFacilitySummaryFromSettings({
    facility_details: {
      name: 'Harbour View Care',
      resident_count: '42'
    },
    anacc_settings: {
      care_minutes_target: '215',
      rn_minutes_target: '44'
    },
    regional_settings: {
      timezone: 'Australia/Perth'
    }
  }, 'facility-123')

  assert.deepEqual(summary, {
    id: 'facility-123',
    name: 'Harbour View Care',
    resident_count: '42',
    care_minutes_target: '215',
    rn_minutes_target: '44',
    timezone: 'Australia/Perth'
  })
})

test('getSettingsEmptyState returns meaningful profile and facility copy', () => {
  assert.deepEqual(getSettingsEmptyState(PROFILE_NOT_SET_UP_MESSAGE), {
    title: PROFILE_NOT_SET_UP_MESSAGE,
    description: 'Your account is signed in, but no profile record with a facility assignment is available yet.'
  })

  assert.deepEqual(getSettingsEmptyState(FACILITY_NOT_FOUND_MESSAGE), {
    title: FACILITY_NOT_FOUND_MESSAGE,
    description: 'Your profile is linked to a facility that could not be loaded.'
  })
})
