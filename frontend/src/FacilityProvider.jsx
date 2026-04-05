import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  LOGIN_REDIRECT_PATH,
  PROFILE_NOT_SET_UP_MESSAGE,
  resolveFacilityAccessError
} from './facilityAccess'
import { FacilityContext } from './facilityContext'
import { getSupabaseClient } from './supabaseClient'

const initialFacilityState = {
  error: '',
  facilityId: '',
  loading: true,
  needsLogin: false,
  profile: null,
  user: null
}

export const FacilityProvider = ({ children }) => {
  const location = useLocation()
  const isMountedRef = useRef(true)
  const [state, setState] = useState(initialFacilityState)

  const refresh = useCallback(async () => {
    if (!isMountedRef.current) {
      return
    }

    setState((currentValue) => ({
      ...currentValue,
      error: '',
      loading: true,
      needsLogin: false
    }))

    try {
      const supabase = getSupabaseClient()
      const { data: userData, error: userError } = await supabase.auth.getUser()

      if (userError) {
        throw userError
      }

      const user = userData?.user ?? null

      if (!user) {
        if (!isMountedRef.current) {
          return
        }

        setState({
          ...initialFacilityState,
          loading: false,
          needsLogin: true
        })
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('facility_id')
        .eq('id', user.id)
        .single()

      if (profileError) {
        if (!isMountedRef.current) {
          return
        }

        setState({
          error: resolveFacilityAccessError(profileError),
          facilityId: '',
          loading: false,
          needsLogin: false,
          profile: null,
          user
        })
        return
      }

      const facilityId = String(profile?.facility_id ?? '').trim()

      if (!facilityId) {
        if (!isMountedRef.current) {
          return
        }

        setState({
          error: PROFILE_NOT_SET_UP_MESSAGE,
          facilityId: '',
          loading: false,
          needsLogin: false,
          profile,
          user
        })
        return
      }

      if (!isMountedRef.current) {
        return
      }

      setState({
        error: '',
        facilityId,
        loading: false,
        needsLogin: false,
        profile,
        user
      })
    } catch (error) {
      if (!isMountedRef.current) {
        return
      }

      setState({
        ...initialFacilityState,
        error: resolveFacilityAccessError(error),
        loading: false
      })
    }
  }, [])

  useEffect(() => {
    isMountedRef.current = true
    void refresh()

    return () => {
      isMountedRef.current = false
    }
  }, [refresh])

  useEffect(() => {
    if (
      !state.needsLogin
      || typeof window === 'undefined'
      || location.pathname === LOGIN_REDIRECT_PATH
    ) {
      return
    }

    window.location.assign(LOGIN_REDIRECT_PATH)
  }, [location.pathname, state.needsLogin])

  const contextValue = useMemo(() => ({
    ...state,
    refresh
  }), [refresh, state])

  return (
    <FacilityContext.Provider value={contextValue}>
      {children}
    </FacilityContext.Provider>
  )
}
