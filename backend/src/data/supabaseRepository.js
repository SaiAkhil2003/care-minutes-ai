import { AppError } from '../utils/errors.js'
import { createSupabaseClient } from '../config/supabase.js'

const STAFF_COLUMNS = `
  id,
  facility_id,
  full_name,
  email,
  phone,
  staff_type,
  employment_type,
  is_active,
  created_at,
  updated_at
`

const SHIFT_COLUMNS = `
  id,
  facility_id,
  staff_id,
  shift_date,
  start_time,
  end_time,
  duration_minutes,
  staff_type_snapshot,
  employment_type_snapshot,
  notes,
  created_at,
  updated_at
`

const DAILY_COMPLIANCE_COLUMNS = `
  id,
  facility_id,
  compliance_date,
  resident_count,
  required_total_minutes,
  required_rn_minutes,
  actual_total_minutes,
  actual_rn_minutes,
  actual_en_minutes,
  actual_pcw_minutes,
  actual_agency_minutes,
  actual_permanent_minutes,
  compliance_percent,
  rn_compliance_percent,
  status,
  is_total_target_met,
  is_rn_target_met,
  penalty_amount,
  created_at,
  updated_at
`

const DAILY_COMPLIANCE_COLUMNS_LEGACY = `
  id,
  facility_id,
  compliance_date,
  resident_count,
  required_total_minutes,
  required_rn_minutes,
  actual_total_minutes,
  actual_rn_minutes,
  actual_en_minutes,
  actual_pcw_minutes,
  actual_agency_minutes,
  compliance_percent,
  rn_compliance_percent,
  status,
  is_total_target_met,
  is_rn_target_met,
  penalty_amount,
  created_at,
  updated_at
`

const ALERT_COLUMNS = `
  id,
  facility_id,
  alert_date,
  alert_type,
  status,
  title,
  message,
  recommended_action,
  suggested_staff_ids,
  delivery_channel,
  is_read,
  created_at
`

const REPORT_COLUMNS = `
  id,
  facility_id,
  report_type,
  start_date,
  end_date,
  file_name,
  file_url,
  generated_by,
  generated_at
`

const isMissingActualPermanentMinutesColumn = (error) =>
  error?.message?.includes(`actual_permanent_minutes`)

const isMissingRelation = (error, relationName) =>
  error?.code === '42P01'
  || error?.message?.includes(`relation "${relationName}" does not exist`)
  || error?.message?.includes(`Could not find the table '${relationName}'`)

const COMPLIANCE_TARGET_COLUMNS = `
  id,
  facility_id,
  effective_date,
  daily_total_target,
  rn_daily_minimum,
  created_at,
  updated_at
`

const RESIDENT_COUNT_COLUMNS = `
  id,
  facility_id,
  effective_date,
  resident_count,
  created_at,
  updated_at
`

const getSupabaseRestConfig = () => {
  const supabaseUrl = process.env.SUPABASE_URL?.trim().replace(/\/+$/, '')
  const supabaseKey = process.env.SUPABASE_KEY?.trim()

  if (!supabaseUrl) {
    throw new AppError(500, 'Supabase configuration error', 'Missing SUPABASE_URL')
  }

  if (!supabaseKey) {
    throw new AppError(500, 'Supabase configuration error', 'Missing SUPABASE_KEY')
  }

  return { supabaseUrl, supabaseKey }
}

const buildSupabaseRestUrl = (tableName, searchParams = {}) => {
  const { supabaseUrl } = getSupabaseRestConfig()
  const url = new URL(`/rest/v1/${tableName}`, `${supabaseUrl}/`)

  for (const [key, value] of Object.entries(searchParams)) {
    if (value !== null && value !== undefined && value !== '') {
      url.searchParams.set(key, String(value))
    }
  }

  return url.toString()
}

const buildSupabaseRestHeaders = (extraHeaders = {}) => {
  const { supabaseKey } = getSupabaseRestConfig()

  return {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    Accept: 'application/json',
    ...extraHeaders
  }
}

const parseSupabaseResponse = async (response) => {
  const rawBody = await response.text()

  if (!rawBody) {
    return null
  }

  try {
    return JSON.parse(rawBody)
  } catch {
    return rawBody
  }
}

const getSupabaseErrorDetails = (payload, status) => {
  if (payload && typeof payload === 'object') {
    return payload.message
      ?? payload.error
      ?? payload.error_description
      ?? payload.details
      ?? JSON.stringify(payload)
  }

  if (typeof payload === 'string' && payload.trim()) {
    return payload
  }

  return `Supabase REST request failed with status ${status}`
}

const fetchSupabaseRest = async ({
  method = 'GET',
  tableName,
  searchParams,
  body = null,
  headers = {},
  requestErrorMessage
}) => {
  const url = buildSupabaseRestUrl(tableName, searchParams)
  const requestHeaders = buildSupabaseRestHeaders(headers)

  try {
    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: body === null ? undefined : JSON.stringify(body)
    })

    const payload = await parseSupabaseResponse(response)

    if (!response.ok) {
      const details = getSupabaseErrorDetails(payload, response.status)

      console.error('[supabase] REST request failed', {
        method,
        url,
        status: response.status,
        details
      })

      throw new AppError(500, requestErrorMessage, details)
    }

    return payload
  } catch (error) {
    if (error instanceof AppError) {
      throw error
    }

    const details = error instanceof Error
      ? `${error.name}: ${error.message}`
      : String(error)

    console.error('[supabase] REST request threw', {
      method,
      url,
      details
    })

    throw new AppError(500, requestErrorMessage, details)
  }
}

export const createSupabaseRepository = () => {
  const supabase = createSupabaseClient()

  return {
    async listFacilities() {
      const data = await fetchSupabaseRest({
        tableName: 'facilities',
        searchParams: {
          select: '*',
          order: 'name.asc'
        },
        requestErrorMessage: 'Unable to fetch facilities'
      })

      return Array.isArray(data) ? data : []
    },

    async getFacilityById(facilityId) {
      const data = await fetchSupabaseRest({
        tableName: 'facilities',
        searchParams: {
          select: '*',
          id: `eq.${facilityId}`,
          limit: 1
        },
        requestErrorMessage: 'Unable to fetch facility'
      })

      if (!Array.isArray(data) || data.length === 0) {
        throw new AppError(404, 'Facility not found')
      }

      return data[0]
    },

    async listStaff(facilityId) {
      const { data, error } = await supabase
        .from('staff')
        .select(STAFF_COLUMNS)
        .eq('facility_id', facilityId)
        .order('full_name', { ascending: true })

      if (error) {
        throw new AppError(500, 'Unable to fetch staff', error.message)
      }

      return data ?? []
    },

    async getStaffById(facilityId, staffId) {
      const { data, error } = await supabase
        .from('staff')
        .select(STAFF_COLUMNS)
        .eq('facility_id', facilityId)
        .eq('id', staffId)
        .single()

      if (error?.code === 'PGRST116') {
        throw new AppError(404, 'Staff member not found')
      }

      if (error) {
        throw new AppError(500, 'Unable to fetch staff member', error.message)
      }

      return data
    },

    async createStaff(payload) {
      const { data, error } = await supabase
        .from('staff')
        .insert([payload])
        .select(STAFF_COLUMNS)
        .single()

      if (error) {
        throw new AppError(500, 'Unable to create staff member', error.message)
      }

      return data
    },

    async updateStaff(facilityId, staffId, payload) {
      const { data, error } = await supabase
        .from('staff')
        .update(payload)
        .eq('facility_id', facilityId)
        .eq('id', staffId)
        .select(STAFF_COLUMNS)
        .single()

      if (error?.code === 'PGRST116') {
        throw new AppError(404, 'Staff member not found')
      }

      if (error) {
        throw new AppError(500, 'Unable to update staff member', error.message)
      }

      return data
    },

    async deleteStaff(facilityId, staffId) {
      const { error } = await supabase
        .from('staff')
        .delete()
        .eq('facility_id', facilityId)
        .eq('id', staffId)

      if (error) {
        throw new AppError(500, 'Unable to delete staff member', error.message)
      }
    },

    async listShifts(facilityId, { startDate = null, endDate = null } = {}) {
      let query = supabase
        .from('shifts')
        .select(SHIFT_COLUMNS)
        .eq('facility_id', facilityId)
        .order('shift_date', { ascending: false })
        .order('start_time', { ascending: false })

      if (startDate) {
        query = query.gte('shift_date', startDate)
      }

      if (endDate) {
        query = query.lte('shift_date', endDate)
      }

      const { data, error } = await query

      if (error) {
        throw new AppError(500, 'Unable to fetch shifts', error.message)
      }

      return data ?? []
    },

    async listShiftsByStaff(facilityId, staffId) {
      const { data, error } = await supabase
        .from('shifts')
        .select(SHIFT_COLUMNS)
        .eq('facility_id', facilityId)
        .eq('staff_id', staffId)

      if (error) {
        throw new AppError(500, 'Unable to inspect staff shifts', error.message)
      }

      return data ?? []
    },

    async getShiftById(facilityId, shiftId) {
      const { data, error } = await supabase
        .from('shifts')
        .select(SHIFT_COLUMNS)
        .eq('facility_id', facilityId)
        .eq('id', shiftId)
        .single()

      if (error?.code === 'PGRST116') {
        throw new AppError(404, 'Shift not found')
      }

      if (error) {
        throw new AppError(500, 'Unable to fetch shift', error.message)
      }

      return data
    },

    async createShift(payload) {
      const { data, error } = await supabase
        .from('shifts')
        .insert([payload])
        .select(SHIFT_COLUMNS)
        .single()

      if (error) {
        throw new AppError(500, 'Unable to create shift', error.message)
      }

      return data
    },

    async updateShift(facilityId, shiftId, payload) {
      const { data, error } = await supabase
        .from('shifts')
        .update(payload)
        .eq('facility_id', facilityId)
        .eq('id', shiftId)
        .select(SHIFT_COLUMNS)
        .single()

      if (error?.code === 'PGRST116') {
        throw new AppError(404, 'Shift not found')
      }

      if (error) {
        throw new AppError(500, 'Unable to update shift', error.message)
      }

      return data
    },

    async deleteShift(facilityId, shiftId) {
      const { error } = await supabase
        .from('shifts')
        .delete()
        .eq('facility_id', facilityId)
        .eq('id', shiftId)

      if (error) {
        throw new AppError(500, 'Unable to delete shift', error.message)
      }
    },

    async listComplianceTargets(facilityId, { endDate = null } = {}) {
      let query = supabase
        .from('compliance_targets')
        .select(COMPLIANCE_TARGET_COLUMNS)
        .eq('facility_id', facilityId)
        .order('effective_date', { ascending: false })

      if (endDate) {
        query = query.lte('effective_date', endDate)
      }

      const { data, error } = await query

      if (isMissingRelation(error, 'compliance_targets')) {
        return []
      }

      if (error) {
        throw new AppError(500, 'Unable to fetch compliance targets', error.message)
      }

      return data ?? []
    },

    async listResidentCounts(facilityId, { endDate = null } = {}) {
      let query = supabase
        .from('facility_resident_counts')
        .select(RESIDENT_COUNT_COLUMNS)
        .eq('facility_id', facilityId)
        .order('effective_date', { ascending: false })

      if (endDate) {
        query = query.lte('effective_date', endDate)
      }

      const { data, error } = await query

      if (isMissingRelation(error, 'facility_resident_counts')) {
        return []
      }

      if (error) {
        throw new AppError(500, 'Unable to fetch resident counts', error.message)
      }

      return data ?? []
    },

    async upsertDailyCompliance(payload) {
      const { data, error } = await supabase
        .from('daily_compliance')
        .upsert([payload], { onConflict: 'facility_id,compliance_date' })
        .select(DAILY_COMPLIANCE_COLUMNS)
        .single()

      if (isMissingActualPermanentMinutesColumn(error)) {
        const legacyPayload = { ...payload }
        delete legacyPayload.actual_permanent_minutes

        const { data: legacyData, error: legacyError } = await supabase
          .from('daily_compliance')
          .upsert([legacyPayload], { onConflict: 'facility_id,compliance_date' })
          .select(DAILY_COMPLIANCE_COLUMNS_LEGACY)
          .single()

        if (legacyError) {
          throw new AppError(500, 'Unable to save daily compliance', legacyError.message)
        }

        return {
          ...legacyData,
          actual_permanent_minutes: payload.actual_permanent_minutes ?? 0
        }
      }

      if (error) {
        throw new AppError(500, 'Unable to save daily compliance', error.message)
      }

      return data
    },

    async listAlerts(facilityId, { deliveryChannel = null, alertDate = null, limit = null } = {}) {
      let query = supabase
        .from('alerts')
        .select(ALERT_COLUMNS)
        .eq('facility_id', facilityId)
        .order('alert_date', { ascending: false })
        .order('created_at', { ascending: false })

      if (deliveryChannel) {
        query = query.eq('delivery_channel', deliveryChannel)
      }

      if (alertDate) {
        query = query.eq('alert_date', alertDate)
      }

      if (limit) {
        query = query.limit(limit)
      }

      const { data, error } = await query

      if (error) {
        throw new AppError(500, 'Unable to fetch alerts', error.message)
      }

      return data ?? []
    },

    async upsertAlert(payload, { uniqueByDateAndChannel = false } = {}) {
      if (uniqueByDateAndChannel) {
        const { data: existingAlert, error: lookupError } = await supabase
          .from('alerts')
          .select('id')
          .eq('facility_id', payload.facility_id)
          .eq('alert_date', payload.alert_date)
          .eq('delivery_channel', payload.delivery_channel)
          .limit(1)
          .maybeSingle()

        if (lookupError) {
          throw new AppError(500, 'Unable to inspect existing alert', lookupError.message)
        }

        if (existingAlert?.id) {
          const { data, error } = await supabase
            .from('alerts')
            .update(payload)
            .eq('id', existingAlert.id)
            .select(ALERT_COLUMNS)
            .single()

          if (error) {
            throw new AppError(500, 'Unable to save alert', error.message)
          }

          return data
        }
      }

      const { data, error } = await supabase
        .from('alerts')
        .insert([payload])
        .select(ALERT_COLUMNS)
        .single()

      if (error) {
        throw new AppError(500, 'Unable to save alert', error.message)
      }

      return data
    },

    async createReport(payload) {
      const { data, error } = await supabase
        .from('reports')
        .insert([payload])
        .select(REPORT_COLUMNS)
        .single()

      if (error) {
        throw new AppError(500, 'Unable to save report metadata', error.message)
      }

      return data
    }
  }
}
