import { useState } from 'react'
import { DEFAULT_FACILITY_ID, FacilityContext } from './facilityContext'

export const FacilityProvider = ({ children }) => {
  const [facilityId, setFacilityId] = useState(DEFAULT_FACILITY_ID)

  return (
    <FacilityContext.Provider value={{ facilityId, setFacilityId }}>
      {children}
    </FacilityContext.Provider>
  )
}
