import { createContext, useContext } from 'react'

export const FacilityContext = createContext(null)

export const useFacility = () => {
  const context = useContext(FacilityContext)

  if (!context) {
    throw new Error('useFacility must be used within a FacilityProvider')
  }

  return context
}
