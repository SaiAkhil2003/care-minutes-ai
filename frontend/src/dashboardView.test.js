import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPdfFilename,
  clampScenarioValue,
  getDailyStatusPercent,
  getTodayStaffTypeBreakdown,
  hasBreakdownMinutes,
  isDashboardBundleReady
} from './dashboardView.js'

test('clampScenarioValue normalizes blank, invalid, and out-of-range values', () => {
  assert.equal(clampScenarioValue(''), 0)
  assert.equal(clampScenarioValue('not-a-number', { fallback: 120 }), 120)
  assert.equal(clampScenarioValue(-15), 0)
  assert.equal(clampScenarioValue(1500), 1440)
  assert.equal(clampScenarioValue(482.7), 483)
})

test('getDailyStatusPercent prefers overall compliance to avoid misleading RAG values', () => {
  assert.equal(getDailyStatusPercent({
    compliance_percent: 101,
    overall_compliance_percent: 82.4
  }), 82.4)
  assert.equal(getDailyStatusPercent({
    compliance_percent: 91.5
  }), 91.5)
})

test('today staff type breakdown includes agency without double counting role totals', () => {
  const rows = getTodayStaffTypeBreakdown({
    actual_rn_minutes: 320,
    actual_en_minutes: 240,
    actual_pcw_minutes: 180,
    actual_agency_minutes: 120,
    actual_rn_agency_minutes: 0,
    actual_en_agency_minutes: 0,
    actual_pcw_agency_minutes: 120
  })

  assert.deepEqual(rows.map((row) => row.name), ['RN', 'EN', 'PCW', 'Agency'])
  assert.deepEqual(rows.map((row) => row.minutes), [320, 240, 60, 120])
  assert.equal(rows.reduce((total, row) => total + row.minutes, 0), 740)
  assert.equal(hasBreakdownMinutes(rows), true)
  assert.equal(hasBreakdownMinutes(getTodayStaffTypeBreakdown(null)), false)
})

test('buildPdfFilename produces a stable local download filename', () => {
  assert.equal(
    buildPdfFilename('Harbour View Care', '2026-04-01', '2026-04-04'),
    'harbour-view-care-audit-2026-04-01-to-2026-04-04.pdf'
  )
})

test('isDashboardBundleReady hides stale or unavailable facility bundles', () => {
  const dashboard = {
    facility: {
      id: 'facility-1'
    }
  }

  assert.equal(isDashboardBundleReady({
    selectedFacilityId: 'facility-1',
    dashboardStatus: 'ready',
    dashboard,
    forecast: {},
    report: {}
  }), true)

  assert.equal(isDashboardBundleReady({
    selectedFacilityId: 'facility-1',
    dashboardStatus: 'loading',
    dashboard,
    forecast: {},
    report: {}
  }), false)

  assert.equal(isDashboardBundleReady({
    selectedFacilityId: 'facility-2',
    dashboardStatus: 'ready',
    dashboard,
    forecast: {},
    report: {}
  }), false)
})
