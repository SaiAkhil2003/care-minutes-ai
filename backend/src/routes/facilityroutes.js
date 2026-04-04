import express from 'express'
import {
  getFacilities,
  getFacility,
  getFacilitySettingsController,
  updateFacilitySettingsController
} from '../controllers/facilitycontroller.js'

const router = express.Router()

router.get('/', getFacilities)
router.get('/:id/settings', getFacilitySettingsController)
router.put('/:id/settings', updateFacilitySettingsController)
router.get('/:id', getFacility)

export default router
