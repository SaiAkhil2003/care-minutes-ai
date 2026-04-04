import { createContext, useContext } from 'react'

export const DEFAULT_FACILITY_ID = '11111111-1111-4111-8111-111111111111'

export const FacilityContext = createContext(null)

export const useFacility = () => {
  const context = useContext(FacilityContext)

  if (!context) {
    throw new Error('useFacility must be used within a FacilityProvider')
  }

  return context
}
