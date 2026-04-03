import { requireUuid } from '../utils/validation.js'
import { getRepository } from '../data/repository.js'

export const listFacilities = async () => {
  return getRepository().listFacilities()
}

export const getFacilityById = async (facilityId) => {
  requireUuid(facilityId, 'facility_id')
  return getRepository().getFacilityById(facilityId)
}
