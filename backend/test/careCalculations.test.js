import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildDailyHistoryRows,
  calculateAgencyPermanentSplit,
  calculateQuarterForecast,
  calculateShiftDurationMinutes,
  getStatusFromCompliance,
  summarizeHistoryTotals,
  summarizeDailyCompliance
} from '../../shared/careCalculations.js'

const baseFacility = {
  resident_count: 1,
  care_minutes_target: 215,
  rn_minutes_target: 44,
  timezone: 'Australia/Sydney'
}

const createShift = ({
  shift_date = '2025-01-15',
  start_time = '08:00',
  end_time = '16:00',
  staff_type_snapshot = 'rn',
  employment_type_snapshot = 'permanent'
} = {}) => ({
  shift_date,
  start_time,
  end_time,
  staff_type_snapshot,
  employment_type_snapshot
})

test('no shifts returns zero delivered minutes', () => {
  const result = summarizeDailyCompliance({
    facility: baseFacility,
    date: '2025-01-15',
    shifts: []
  })

  assert.equal(result.actual_total_minutes, 0)
  assert.equal(result.actual_rn_minutes, 0)
  assert.equal(result.compliance_percent, 0)
  assert.equal(result.rn_compliance_percent, 0)
  assert.equal(result.status, 'red')
})

test('only RN shifts count to total and RN minimum', () => {
  const result = summarizeDailyCompliance({
    facility: baseFacility,
    date: '2025-01-15',
    shifts: [
      createShift()
    ]
  })

  assert.equal(result.actual_total_minutes, 480)
  assert.equal(result.actual_rn_minutes, 480)
  assert.equal(result.is_total_target_met, true)
  assert.equal(result.is_rn_target_met, true)
})

test('only EN and PCW shifts count to total but not RN minimum', () => {
  const result = summarizeDailyCompliance({
    facility: baseFacility,
    date: '2025-01-15',
    shifts: [
      createShift({ staff_type_snapshot: 'en' }),
      createShift({ start_time: '16:00', end_time: '20:00', staff_type_snapshot: 'pcw' })
    ]
  })

  assert.equal(result.actual_total_minutes, 720)
  assert.equal(result.actual_rn_minutes, 0)
  assert.equal(result.actual_en_minutes, 480)
  assert.equal(result.actual_pcw_minutes, 240)
  assert.equal(result.is_total_target_met, true)
  assert.equal(result.is_rn_target_met, false)
})

test('mixed staff types aggregate correctly', () => {
  const result = summarizeDailyCompliance({
    facility: {
      ...baseFacility,
      resident_count: 4
    },
    date: '2025-01-15',
    shifts: [
      createShift({ staff_type_snapshot: 'rn' }),
      createShift({ start_time: '08:00', end_time: '14:00', staff_type_snapshot: 'en' }),
      createShift({ start_time: '14:00', end_time: '20:00', staff_type_snapshot: 'pcw' })
    ]
  })

  assert.equal(result.actual_total_minutes, 1200)
  assert.equal(result.actual_rn_minutes, 480)
  assert.equal(result.actual_en_minutes, 360)
  assert.equal(result.actual_pcw_minutes, 360)
})

test('RN minimum can be met while total target is still missed', () => {
  const result = summarizeDailyCompliance({
    facility: {
      ...baseFacility,
      resident_count: 3
    },
    date: '2025-01-15',
    shifts: [
      createShift({ start_time: '08:00', end_time: '10:12', staff_type_snapshot: 'rn' })
    ]
  })

  assert.equal(result.actual_rn_minutes, 132)
  assert.equal(result.is_rn_target_met, true)
  assert.equal(result.is_total_target_met, false)
})

test('total target can be met while RN minimum is missed', () => {
  const result = summarizeDailyCompliance({
    facility: baseFacility,
    date: '2025-01-15',
    shifts: [
      createShift({ start_time: '08:00', end_time: '11:35', staff_type_snapshot: 'en' })
    ]
  })

  assert.equal(result.actual_total_minutes, 215)
  assert.equal(result.is_total_target_met, true)
  assert.equal(result.is_rn_target_met, false)
  assert.equal(result.status, 'red')
})

test('zero resident count produces zero targets without false non-compliance', () => {
  const result = summarizeDailyCompliance({
    facility: {
      ...baseFacility,
      resident_count: 0
    },
    date: '2025-01-15',
    shifts: []
  })

  assert.equal(result.required_total_minutes, 0)
  assert.equal(result.required_rn_minutes, 0)
  assert.equal(result.compliance_percent, 100)
  assert.equal(result.rn_compliance_percent, 100)
  assert.equal(result.status, 'green')
  assert.equal(result.penalty_amount, 0)
})

test('status thresholds are exact at 85, 99, and 100 percent', () => {
  assert.equal(getStatusFromCompliance(84.99), 'red')
  assert.equal(getStatusFromCompliance(85), 'amber')
  assert.equal(getStatusFromCompliance(99), 'amber')
  assert.equal(getStatusFromCompliance(100), 'green')
})

test('agency minutes count in total but remain separated in reporting', () => {
  const result = summarizeDailyCompliance({
    facility: baseFacility,
    date: '2025-01-15',
    shifts: [
      createShift({
        staff_type_snapshot: 'pcw',
        employment_type_snapshot: 'agency'
      }),
      createShift({
        start_time: '16:00',
        end_time: '20:00',
        staff_type_snapshot: 'rn',
        employment_type_snapshot: 'permanent'
      })
    ]
  })

  assert.equal(result.actual_total_minutes, 720)
  assert.equal(result.actual_agency_minutes, 480)
  assert.equal(result.actual_permanent_minutes, 240)
})

test('required minutes change with resident count', () => {
  const low = summarizeDailyCompliance({
    facility: {
      ...baseFacility,
      resident_count: 10
    },
    date: '2025-01-15',
    shifts: []
  })
  const high = summarizeDailyCompliance({
    facility: {
      ...baseFacility,
      resident_count: 20
    },
    date: '2025-01-15',
    shifts: []
  })

  assert.equal(low.required_total_minutes, 2150)
  assert.equal(high.required_total_minutes, 4300)
  assert.equal(low.required_rn_minutes, 440)
  assert.equal(high.required_rn_minutes, 880)
})

test('invalid or missing staff role is ignored safely', () => {
  const result = summarizeDailyCompliance({
    facility: baseFacility,
    date: '2025-01-15',
    shifts: [
      createShift({ staff_type_snapshot: 'chef' }),
      createShift({ staff_type_snapshot: null }),
      createShift({ staff_type_snapshot: 'rn', start_time: '08:00', end_time: '10:00' })
    ]
  })

  assert.equal(result.actual_total_minutes, 120)
  assert.equal(result.actual_rn_minutes, 120)
})

test('overnight shifts split correctly across facility days', () => {
  const overnightShift = createShift({
    shift_date: '2025-01-15',
    start_time: '2025-01-15T22:00:00',
    end_time: '2025-01-16T06:00:00',
    staff_type_snapshot: 'rn'
  })

  assert.equal(calculateShiftDurationMinutes(overnightShift), 480)

  const history = buildDailyHistoryRows({
    facility: baseFacility,
    shifts: [overnightShift],
    startDate: '2025-01-15',
    endDate: '2025-01-16'
  })

  assert.equal(history[0].actual_total_minutes, 120)
  assert.equal(history[0].actual_rn_minutes, 120)
  assert.equal(history[1].actual_total_minutes, 360)
  assert.equal(history[1].actual_rn_minutes, 360)
})

test('quarterly forecast math and penalty risk follow the shared formula', () => {
  const facility = {
    ...baseFacility,
    resident_count: 50
  }
  const dailyTarget = facility.resident_count * facility.care_minutes_target
  const history = Array.from({ length: 7 }, (_, index) => ({
    compliance_date: `2025-01-0${index + 1}`,
    resident_count: facility.resident_count,
    actual_total_minutes: index < 2 ? 8600 : 0,
    required_total_minutes: dailyTarget
  }))

  const result = calculateQuarterForecast({
    facility,
    history,
    quarterStartDate: '2025-01-01',
    quarterEndDate: '2025-01-07',
    todayDate: '2025-01-02',
    scenarioShiftMinutes: 480,
    scenarioShiftsPerWeek: 2
  })

  assert.equal(result.days_elapsed, 2)
  assert.equal(result.days_remaining, 5)
  assert.equal(result.actual_minutes_so_far, 17200)
  assert.equal(result.projected_total_minutes, 60200)
  assert.equal(result.projected_shortfall_minutes, 15050)
  assert.equal(result.daily_shortfall_minutes, 3010)
  assert.equal(result.minutes_needed_per_day_to_recover, 11610)
  assert.equal(result.average_required_minutes_per_day, 10750)
  assert.equal(result.funding_at_risk.equivalent_non_compliant_days, 1.4)
  assert.equal(result.dollar_value_at_risk, 2214.8)
  assert.equal(result.scenario.projected_total_minutes, 60886)
  assert.equal(result.scenario.will_meet_target, false)
})

test('daily penalty formula scales to the proportion of the missed facility day', () => {
  const result = summarizeDailyCompliance({
    facility: {
      ...baseFacility,
      resident_count: 2
    },
    date: '2025-01-15',
    shifts: []
  })

  assert.equal(result.penalty_amount, 63.28)
})

test('history totals include agency and permanent split percentages', () => {
  const summary = summarizeHistoryTotals([
    {
      actual_total_minutes: 480,
      required_total_minutes: 215,
      actual_rn_minutes: 120,
      required_rn_minutes: 44,
      actual_en_minutes: 180,
      actual_pcw_minutes: 180,
      actual_agency_minutes: 180,
      actual_permanent_minutes: 300,
      is_total_target_met: true,
      is_rn_target_met: true
    }
  ])

  assert.equal(summary.agency_permanent_split.agency_percent, 37.5)
  assert.equal(summary.agency_permanent_split.permanent_percent, 62.5)
})

test('agency and permanent split is zero-safe', () => {
  const split = calculateAgencyPermanentSplit({
    actualAgencyMinutes: 0,
    actualPermanentMinutes: 0
  })

  assert.equal(split.agency_percent, 0)
  assert.equal(split.permanent_percent, 0)
})

test('missing facility values and null shift fields stay zero-safe', () => {
  const result = summarizeDailyCompliance({
    facility: {
      resident_count: null,
      care_minutes_target: null,
      rn_minutes_target: undefined
    },
    date: '2025-01-15',
    shifts: [
      {
        shift_date: '2025-01-15',
        start_time: null,
        end_time: '16:00',
        staff_type_snapshot: 'rn'
      },
      {
        shift_date: '2025-01-15',
        start_time: '08:00',
        end_time: null,
        staff_type_snapshot: 'pcw',
        employment_type_snapshot: 'agency'
      }
    ]
  })

  assert.equal(result.resident_count, 0)
  assert.equal(result.required_total_minutes, 0)
  assert.equal(result.required_rn_minutes, 0)
  assert.equal(result.actual_total_minutes, 0)
  assert.equal(result.actual_rn_minutes, 0)
  assert.equal(result.actual_agency_minutes, 0)
  assert.equal(result.compliance_percent, 100)
  assert.equal(result.rn_compliance_percent, 100)
  assert.equal(result.penalty_amount, 0)
})

test('quarter forecast stays zero-safe when history is partial or missing', () => {
  const facility = {
    ...baseFacility,
    resident_count: 0
  }

  const result = calculateQuarterForecast({
    facility,
    history: [
      {
        compliance_date: '2025-01-01',
        resident_count: null,
        actual_total_minutes: null,
        required_total_minutes: undefined
      }
    ],
    quarterStartDate: '2025-01-01',
    quarterEndDate: '2025-01-07',
    todayDate: '2025-01-03',
    scenarioShiftMinutes: null,
    scenarioShiftsPerWeek: undefined
  })

  assert.equal(result.actual_minutes_so_far, 0)
  assert.equal(result.required_minutes_so_far, 0)
  assert.equal(result.projected_total_minutes, 0)
  assert.equal(result.total_required_minutes, 0)
  assert.equal(result.current_compliance_percent, 100)
  assert.equal(result.projected_compliance_percent, 100)
  assert.equal(result.projected_shortfall_minutes, 0)
  assert.equal(result.minutes_needed_per_day_to_recover, 0)
  assert.equal(result.funding_at_risk.equivalent_non_compliant_days, 0)
  assert.equal(result.dollar_value_at_risk, 0)
  assert.equal(result.scenario.additional_minutes_total, 0)
  assert.equal(result.scenario.projected_total_minutes, 0)
})
