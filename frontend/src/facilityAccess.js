export const PROFILE_NOT_SET_UP_MESSAGE = 'Profile not set up'
export const FACILITY_NOT_FOUND_MESSAGE = 'Facility not found'
export const LOGIN_REDIRECT_PATH = '/login'
const DEFAULT_TIMEZONE = 'Australia/Sydney'

export const isMissingProfileError = (error) => {
  if (!error || typeof error !== 'object') {
    return false
  }

  return error.code === 'PGRST116'
    || error.status === 406
    || String(error.details ?? '').includes('0 rows')
}

export const resolveFacilityAccessError = (error) => {
  if (!error) {
    return ''
  }

  if (isMissingProfileError(error)) {
    return PROFILE_NOT_SET_UP_MESSAGE
  }

  return error.message ?? 'Unable to load facility access.'
}

export const buildFacilitySummaryFromSettings = (settings, facilityId) => {
  if (!settings) {
    return null
  }

  return {
    id: facilityId,
    name: settings?.facility_details?.name ?? '',
    resident_count: settings?.facility_details?.resident_count ?? '',
    care_minutes_target: settings?.anacc_settings?.care_minutes_target ?? '',
    rn_minutes_target: settings?.anacc_settings?.rn_minutes_target ?? '',
    timezone: settings?.regional_settings?.timezone ?? DEFAULT_TIMEZONE
  }
}

export const getSettingsEmptyState = (error) => {
  const message = String(error ?? '').trim()

  if (message === PROFILE_NOT_SET_UP_MESSAGE) {
    return {
      title: PROFILE_NOT_SET_UP_MESSAGE,
      description: 'Your account is signed in, but no profile record with a facility assignment is available yet.'
    }
  }

  if (message === FACILITY_NOT_FOUND_MESSAGE) {
    return {
      title: FACILITY_NOT_FOUND_MESSAGE,
      description: 'Your profile is linked to a facility that could not be loaded.'
    }
  }

  return {
    title: 'Settings are unavailable',
    description: message || 'The current facility settings could not be loaded.'
  }
}
