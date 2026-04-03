import express from 'express'
import { getFacilities, getFacility } from '../controllers/facilitycontroller.js'

const router = express.Router()

router.get('/', getFacilities)
router.get('/:id', getFacility)

export default router
