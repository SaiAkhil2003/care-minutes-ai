import { DEFAULT_SHIFT_MINUTES, getWeekBounds, getTodayInTimeZone } from '../../../shared/careCalculations.js'
import { getRepository } from '../data/repository.js'
import { getFacilityById, listFacilities } from './facilityservice.js'
import { getComplianceHistory } from './complianceservice.js'
import { listStaff } from './staffservice.js'
import { listShifts } from './shiftservice.js'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const RESEND_API_URL = 'https://api.resend.com/emails'

const STAFF_TYPE_LABELS = {
  rn: 'RN',
  en: 'EN',
  pcw: 'PCW'
}

const EMPLOYMENT_PRIORITY = {
  permanent: 0,
  part_time: 1,
  casual: 2,
  agency: 3
}

const parseStaffIds = (value) => {
  if (!value) {
    return []
  }

  if (Array.isArray(value)) {
    return value
  }

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const getMedian = (values) => {
  const numbers = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b)

  if (!numbers.length) {
    return DEFAULT_SHIFT_MINUTES
  }

  const middle = Math.floor(numbers.length / 2)
  return numbers.length % 2 === 0
    ? Math.round((numbers[middle - 1] + numbers[middle]) / 2)
    : numbers[middle]
}

const getEstimatedShiftMinutes = (shifts, staffType) =>
  getMedian(
    shifts
      .filter((shift) => shift.staff_type_snapshot === staffType)
      .map((shift) => Number(shift.duration_minutes))
  )

const buildSuggestedStaff = ({ staff, shifts, date, preferredTypes }) => {
  const busyStaffIds = new Set(
    shifts
      .filter((shift) => shift.shift_date === date)
      .map((shift) => shift.staff_id)
  )

  return staff
    .filter((member) => member.is_active !== false)
    .map((member) => ({
      id: member.id,
      full_name: member.full_name,
      staff_type: member.staff_type,
      employment_type: member.employment_type,
      available: !busyStaffIds.has(member.id),
      type_rank: preferredTypes.indexOf(member.staff_type),
      employment_rank: EMPLOYMENT_PRIORITY[member.employment_type] ?? 99
    }))
    .filter((member) => member.available)
    .sort((left, right) => {
      if (left.type_rank !== right.type_rank) {
        return left.type_rank - right.type_rank
      }

      if (left.employment_rank !== right.employment_rank) {
        return left.employment_rank - right.employment_rank
      }

      return left.full_name.localeCompare(right.full_name)
    })
    .slice(0, 5)
    .map(({ id, full_name, staff_type, employment_type }) => ({
      id,
      full_name,
      staff_type,
      employment_type
    }))
}

const buildRiskDay = ({ row, staff, shifts }) => {
  const rnGapMinutes = Math.max(row.required_rn_minutes - row.actual_rn_minutes, 0)
  const totalGapMinutes = Math.max(row.required_total_minutes - row.actual_total_minutes, 0)
  const preferredTypes = rnGapMinutes > 0 ? ['rn', 'en', 'pcw'] : ['en', 'pcw', 'rn']

  return {
    date: row.compliance_date,
    total_gap_minutes: totalGapMinutes,
    rn_gap_minutes: rnGapMinutes,
    staff_types_needed: preferredTypes.filter((staffType, index) =>
      index === 0 || (totalGapMinutes > rnGapMinutes && staffType !== 'rn')
    ),
    estimated_shift_minutes: {
      rn: getEstimatedShiftMinutes(shifts, 'rn'),
      en: getEstimatedShiftMinutes(shifts, 'en'),
      pcw: getEstimatedShiftMinutes(shifts, 'pcw')
    },
    suggested_staff: buildSuggestedStaff({
      staff,
      shifts,
      date: row.compliance_date,
      preferredTypes
    })
  }
}

const buildAlertAnalysis = ({ facility, date, history, staff, shifts }) => {
  const weekBounds = getWeekBounds(date)
  const upcomingRows = history.filter((row) => row.compliance_date >= date)
  const riskDays = upcomingRows
    .filter((row) => !row.is_total_target_met || !row.is_rn_target_met)
    .map((row) => buildRiskDay({ row, staff, shifts }))

  return {
    facility: {
      id: facility.id,
      name: facility.name,
      resident_count: facility.resident_count,
      timezone: facility.timezone
    },
    analysis_date: date,
    week_start_date: weekBounds.start,
    week_end_date: weekBounds.end,
    on_track: riskDays.length === 0,
    risk_days: riskDays
  }
}

const buildPrompt = (analysis) => ({
  model: 'claude-sonnet-4-6',
  max_tokens: 500,
  system: [
    'You are writing a concise operational alert for an Australian aged care facility.',
    'State either "You are on track this week" or "Action needed to stay compliant".',
    'If action is needed, mention specific dates, staff types, estimated minutes per extra shift, and suggested staff to contact in priority order.',
    'Use plain English for non-technical operations managers and avoid markdown bullet nesting.'
  ].join(' '),
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `Create the alert from this JSON context:\n${JSON.stringify(analysis, null, 2)}`
        }
      ]
    }
  ]
})

const createUnavailableAlert = (facilityId, date) => ({
  facility_id: facilityId,
  alert_date: date,
  delivery_channel: 'in_app',
  status: 'failed',
  title: 'AI alert unavailable',
  message: 'AI alert unavailable until credentials are configured',
  recommended_action: 'Configure ANTHROPIC_API_KEY and RESEND_API_KEY to enable automated daily alerts.',
  alert_type: 'warning',
  suggested_staff_ids: []
})

const buildFallbackAlert = (facilityId, analysis) => {
  if (analysis.on_track) {
    return {
      facility_id: facilityId,
      alert_date: analysis.analysis_date,
      delivery_channel: 'in_app',
      status: 'sent',
      title: 'You are on track this week',
      message: 'You are on track this week',
      recommended_action: 'No urgent staffing action is required based on the current shift data.',
      alert_type: 'info',
      suggested_staff_ids: []
    }
  }

  const firstRiskDay = analysis.risk_days[0]
  const suggestedStaff = firstRiskDay.suggested_staff
  const staffLine = suggestedStaff.length
    ? ` Suggested staff to contact first: ${suggestedStaff.map((member) => member.full_name).join(', ')}.`
    : ''

  return {
    facility_id: facilityId,
    alert_date: analysis.analysis_date,
    delivery_channel: 'in_app',
    status: 'sent',
    title: 'Action needed to stay compliant',
    message: `Action needed to stay compliant. Focus on ${analysis.risk_days.map((day) => day.date).join(', ')}. Recover ${firstRiskDay.total_gap_minutes} total minutes and ${firstRiskDay.rn_gap_minutes} RN minutes on the next risk day. Add ${firstRiskDay.staff_types_needed.map((staffType) => STAFF_TYPE_LABELS[staffType]).join(', ')} coverage. Estimated extra minutes per shift: RN ${firstRiskDay.estimated_shift_minutes.rn}, EN ${firstRiskDay.estimated_shift_minutes.en}, PCW ${firstRiskDay.estimated_shift_minutes.pcw}.${staffLine}`,
    recommended_action: 'Review the risk days and contact the suggested staff in priority order.',
    alert_type: 'warning',
    suggested_staff_ids: suggestedStaff.map((member) => member.id)
  }
}

const callClaudeForAlert = async (analysis) => {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(buildPrompt(analysis))
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Anthropic request failed: ${response.status} ${errorBody}`)
  }

  const payload = await response.json()
  return payload.content?.find((item) => item.type === 'text')?.text?.trim()
}

const sendAlertEmail = async ({ facility, alert }) => {
  if (!process.env.RESEND_API_KEY || !facility.email) {
    return {
      sent: false,
      reason: 'Email delivery not configured'
    }
  }

  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.RESEND_API_KEY}`
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL ?? 'Care Minutes AI <alerts@example.com>',
      to: [facility.email],
      subject: `Care Minutes AI: ${alert.title}`,
      text: `${alert.message}\n\n${alert.recommended_action ?? ''}`.trim()
    })
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Resend request failed: ${response.status} ${errorBody}`)
  }

  return {
    sent: true
  }
}

const persistAlert = async (payload) =>
  getRepository().upsertAlert({
    facility_id: payload.facility_id,
    alert_date: payload.alert_date,
    alert_type: payload.alert_type,
    status: payload.status,
    title: payload.title,
    message: payload.message,
    recommended_action: payload.recommended_action,
    suggested_staff_ids: payload.suggested_staff_ids ?? [],
    delivery_channel: payload.delivery_channel,
    is_read: false
  }, {
    uniqueByDateAndChannel: true
  })

export const getLatestAiAlert = async (facilityId, date = null) => {
  const facility = await getFacilityById(facilityId)
  const effectiveDate = date ?? getTodayInTimeZone(facility.timezone || 'Australia/Sydney')
  const [latestInAppAlert] = await getRepository().listAlerts(facilityId, {
    deliveryChannel: 'in_app',
    alertDate: effectiveDate,
    limit: 1
  })

  if (latestInAppAlert) {
    return {
      ...latestInAppAlert,
      suggested_staff_ids: parseStaffIds(latestInAppAlert.suggested_staff_ids)
    }
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return createUnavailableAlert(facilityId, effectiveDate)
  }

  return null
}

export const generateDailyAiAlert = async (facilityId, date = null) => {
  const facility = await getFacilityById(facilityId)
  const effectiveDate = date ?? getTodayInTimeZone(facility.timezone || 'Australia/Sydney')

  if (!process.env.ANTHROPIC_API_KEY) {
    return createUnavailableAlert(facilityId, effectiveDate)
  }

  const weekBounds = getWeekBounds(effectiveDate)
  const [history, staff, shifts] = await Promise.all([
    getComplianceHistory(facilityId, weekBounds.start, weekBounds.end),
    listStaff(facilityId),
    listShifts(facilityId, {
      startDate: weekBounds.start,
      endDate: weekBounds.end
    })
  ])

  const analysis = buildAlertAnalysis({
    facility,
    date: effectiveDate,
    history,
    staff,
    shifts
  })

  let alert = buildFallbackAlert(facilityId, analysis)

  try {
    const message = await callClaudeForAlert(analysis)
    if (message) {
      alert = {
        ...alert,
        message
      }
    }
  } catch (error) {
    alert = {
      ...alert,
      status: 'failed',
      message: `${alert.message} AI generation failed and a deterministic fallback was used.`,
      recommended_action: `${alert.recommended_action ?? ''} ${error.message}`.trim(),
      alert_type: 'warning'
    }
  }

  const inAppAlert = await persistAlert({
    ...alert,
    delivery_channel: 'in_app'
  })

  try {
    const emailResult = await sendAlertEmail({ facility, alert })
    await persistAlert({
      ...alert,
      delivery_channel: 'email',
      status: emailResult.sent ? 'sent' : 'failed',
      recommended_action: emailResult.sent
        ? alert.recommended_action
        : `${alert.recommended_action ?? ''} ${emailResult.reason}`.trim()
    })
  } catch (error) {
    await persistAlert({
      ...alert,
      delivery_channel: 'email',
      status: 'failed',
      recommended_action: `${alert.recommended_action ?? ''} ${error.message}`.trim()
    })
  }

  return {
    ...inAppAlert,
    suggested_staff_ids: parseStaffIds(inAppAlert.suggested_staff_ids)
  }
}

export const generateDailyAiAlertsForAllFacilities = async (date = null) => {
  const facilities = await listFacilities()
  const results = []

  for (const facility of facilities) {
    const effectiveDate = date ?? getTodayInTimeZone(facility.timezone || 'Australia/Sydney')
    results.push(await generateDailyAiAlert(facility.id, effectiveDate))
  }

  return results
}
