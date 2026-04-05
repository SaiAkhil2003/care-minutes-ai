import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DEFAULT_FACILITY_ID, FacilityContext } from './facilityContext'

export const FacilityProvider = ({ children }) => {
  const [searchParams, setSearchParams] = useSearchParams()
  const facilityId = searchParams.get('facilityId')?.trim() || DEFAULT_FACILITY_ID

  const setFacilityId = useCallback((value, options = {}) => {
    setSearchParams((currentValue) => {
      const nextSearchParams = new URLSearchParams(currentValue)
      const nextFacilityId = String(value ?? '').trim()

      if (nextFacilityId) {
        nextSearchParams.set('facilityId', nextFacilityId)
      } else {
        nextSearchParams.delete('facilityId')
      }

      return nextSearchParams
    }, {
      replace: options.replace ?? false
    })
  }, [setSearchParams])

  const contextValue = useMemo(() => ({
    facilityId,
    setFacilityId
  }), [facilityId, setFacilityId])

  return (
    <FacilityContext.Provider value={contextValue}>
      {children}
    </FacilityContext.Provider>
  )
}
