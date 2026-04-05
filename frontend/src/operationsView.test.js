import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildShiftImportPayloads,
  normalizeEmailAddress,
  normalizeStaffLookupKey,
  validateReportRange,
  validateShiftForm,
  validateStaffForm
} from './operationsView.js'

test('validateStaffForm trims required fields and rejects malformed optional contacts', () => {
  assert.equal(validateStaffForm({
    full_name: '  ',
    email: '',
    phone: ''
  }), 'Full name is required.')

  assert.equal(validateStaffForm({
    full_name: 'Priya Shah',
    email: 'not-an-email',
    phone: ''
  }), 'Enter a valid email address or leave the field blank.')

  assert.equal(validateStaffForm({
    full_name: 'Priya Shah',
    email: 'priya.shah@example.com',
    phone: 'bad-phone'
  }), 'Enter a valid phone number or leave the field blank.')

  assert.equal(validateStaffForm({
    full_name: 'Priya Shah',
    email: 'priya.shah@example.com',
    phone: '0400 000 001'
  }), '')
})

test('validateShiftForm enforces required values, current-facility staff, and date ordering rules', () => {
  const staffIds = new Set(['staff-1'])

  assert.equal(validateShiftForm({
    form: {
      staff_id: '',
      shift_date: '',
      start_time: '',
      end_time: ''
    },
    staffIds
  }), 'Staff, date, start time, and end time are required.')

  assert.equal(validateShiftForm({
    form: {
      staff_id: 'missing',
      shift_date: '2026-03-14',
      start_time: '07:00',
      end_time: '15:00'
    },
    staffIds
  }), 'Select a valid staff member for the current facility.')

  assert.equal(validateShiftForm({
    form: {
      staff_id: 'staff-1',
      shift_date: '14/03/2026',
      start_time: '07:00',
      end_time: '15:00'
    },
    staffIds
  }), 'Enter a valid shift date.')

  assert.equal(validateShiftForm({
    form: {
      staff_id: 'staff-1',
      shift_date: '2026-03-14',
      start_time: '07:99',
      end_time: '15:00'
    },
    staffIds
  }), 'Enter valid start and end times in HH:MM.')

  assert.equal(validateShiftForm({
    form: {
      staff_id: 'staff-1',
      shift_date: '2026-03-14',
      start_time: '22:00',
      end_time: '06:00'
    },
    staffIds
  }), '')
})

test('validateReportRange prevents malformed report requests', () => {
  assert.equal(validateReportRange({
    start_date: '',
    end_date: ''
  }), 'Start and end dates are required.')

  assert.equal(validateReportRange({
    start_date: '2026/03/01',
    end_date: '2026-03-10'
  }), 'Enter a valid report date range.')

  assert.equal(validateReportRange({
    start_date: '2026-03-10',
    end_date: '2026-03-01'
  }), 'Start date must be on or before end date.')

  assert.equal(validateReportRange({
    start_date: '2026-03-01',
    end_date: '2026-03-10'
  }), '')
})

test('buildShiftImportPayloads validates headers, staff matching, and duplicate rows before import', () => {
  const staffById = new Map([
    ['staff-1', { id: 'staff-1', full_name: 'Sarah Nguyen' }]
  ])
  const staffByNormalizedName = new Map([
    ['sarah nguyen', { id: 'staff-1', full_name: 'Sarah Nguyen' }]
  ])

  const payloads = buildShiftImportPayloads({
    csvText: 'staff_name,shift_date,start_time,end_time,notes\nSarah Nguyen,2026-03-14,07:00,15:00,Morning round',
    staffById,
    staffByNormalizedName
  })

  assert.deepEqual(payloads, [
    {
      staff_id: 'staff-1',
      shift_date: '2026-03-14',
      start_time: '07:00',
      end_time: '15:00',
      notes: 'Morning round'
    }
  ])

  assert.throws(() => buildShiftImportPayloads({
    csvText: 'staff_name,start_time,end_time\nSarah Nguyen,07:00,15:00',
    staffById,
    staffByNormalizedName
  }), /CSV requires shift_date, start_time, and end_time columns/)

  assert.throws(() => buildShiftImportPayloads({
    csvText: 'staff_name,shift_date,start_time,end_time\nUnknown,2026-03-14,07:00,15:00',
    staffById,
    staffByNormalizedName
  }), /Unable to match staff on CSV row 2/)

  assert.throws(() => buildShiftImportPayloads({
    csvText: [
      'staff_name,shift_date,start_time,end_time',
      'Sarah Nguyen,2026-03-14,07:00,15:00',
      'Sarah Nguyen,2026-03-14,07:00,15:00'
    ].join('\n'),
    staffById,
    staffByNormalizedName
  }), /duplicates another shift row/)
})

test('lookup normalizers keep facility and staff matching stable', () => {
  assert.equal(normalizeEmailAddress(' Priya.Shah@Example.com '), 'priya.shah@example.com')
  assert.equal(normalizeStaffLookupKey('  Sarah Nguyen  '), 'sarah nguyen')
})
