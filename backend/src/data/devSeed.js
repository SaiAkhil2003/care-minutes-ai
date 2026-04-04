import { randomUUID } from 'node:crypto'
import {
  addDaysToDateString,
  getTodayInTimeZone
} from '../../../shared/careCalculations.js'

const createShiftWindow = (shiftDate, startTime, endTime) => ({
  shift_date: shiftDate,
  start_time: `${shiftDate}T${startTime}:00`,
  end_time: `${shiftDate}T${endTime}:00`
})

export const createSeedData = () => {
  const facilityId = '11111111-1111-4111-8111-111111111111'
  const today = getTodayInTimeZone('Australia/Sydney')

  const staff = [
    {
      id: '22222222-2222-4222-8222-222222222221',
      full_name: 'Sarah Nguyen',
      email: 'sarah.nguyen@example.com',
      phone: '0400000001',
      staff_type: 'rn',
      employment_type: 'permanent'
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      full_name: 'Mia Thompson',
      email: 'mia.thompson@example.com',
      phone: '0400000002',
      staff_type: 'rn',
      employment_type: 'casual'
    },
    {
      id: '22222222-2222-4222-8222-222222222223',
      full_name: 'Daniel Chen',
      email: 'daniel.chen@example.com',
      phone: '0400000003',
      staff_type: 'en',
      employment_type: 'permanent'
    },
    {
      id: '22222222-2222-4222-8222-222222222224',
      full_name: 'Ava Robinson',
      email: 'ava.robinson@example.com',
      phone: '0400000004',
      staff_type: 'pcw',
      employment_type: 'agency'
    },
    {
      id: '22222222-2222-4222-8222-222222222225',
      full_name: 'Noah Patel',
      email: 'noah.patel@example.com',
      phone: '0400000005',
      staff_type: 'pcw',
      employment_type: 'permanent'
    }
  ].map((member) => ({
    facility_id: facilityId,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...member
  }))

  const shifts = []

  for (let offset = -13; offset <= 0; offset += 1) {
    const shiftDate = addDaysToDateString(today, offset)
    const includeSecondRn = offset % 3 !== 0
    const includeAgency = offset % 4 === 0

    shifts.push({
      id: randomUUID(),
      facility_id: facilityId,
      staff_id: staff[0].id,
      duration_minutes: 480,
      staff_type_snapshot: 'rn',
      employment_type_snapshot: 'permanent',
      notes: 'Morning RN coverage',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...createShiftWindow(shiftDate, '07:00', '15:00')
    })

    if (includeSecondRn) {
      shifts.push({
        id: randomUUID(),
        facility_id: facilityId,
        staff_id: staff[1].id,
        duration_minutes: 480,
        staff_type_snapshot: 'rn',
        employment_type_snapshot: 'casual',
        notes: 'Afternoon RN support',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...createShiftWindow(shiftDate, '15:00', '23:00')
      })
    }

    shifts.push({
      id: randomUUID(),
      facility_id: facilityId,
      staff_id: staff[2].id,
      duration_minutes: 480,
      staff_type_snapshot: 'en',
      employment_type_snapshot: 'permanent',
      notes: 'EN day shift',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...createShiftWindow(shiftDate, '08:00', '16:00')
    })

    shifts.push({
      id: randomUUID(),
      facility_id: facilityId,
      staff_id: staff[4].id,
      duration_minutes: 480,
      staff_type_snapshot: 'pcw',
      employment_type_snapshot: 'permanent',
      notes: 'PCW day shift',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...createShiftWindow(shiftDate, '06:00', '14:00')
    })

    if (includeAgency) {
      shifts.push({
        id: randomUUID(),
        facility_id: facilityId,
        staff_id: staff[3].id,
        duration_minutes: 480,
        staff_type_snapshot: 'pcw',
        employment_type_snapshot: 'agency',
        notes: 'Agency backfill shift',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...createShiftWindow(shiftDate, '14:00', '22:00')
      })
    }
  }

  return {
    facilities: [
      {
        id: facilityId,
        name: 'Harbour View Care',
        email: 'ops@harbourview.example.com',
        phone: '0290000000',
        address: '12 Seabreeze Avenue, Sydney NSW',
        resident_count: 32,
        care_minutes_target: 215,
        rn_minutes_target: 44,
        timezone: 'Australia/Sydney',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ],
    facility_settings: [],
    compliance_targets: [
      {
        id: randomUUID(),
        facility_id: facilityId,
        effective_date: '2025-01-01',
        daily_total_target: 215,
        rn_daily_minimum: 44,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ],
    resident_counts: [
      {
        id: randomUUID(),
        facility_id: facilityId,
        effective_date: '2025-01-01',
        resident_count: 32,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ],
    staff,
    shifts,
    daily_compliance: [],
    alerts: [],
    reports: []
  }
}
