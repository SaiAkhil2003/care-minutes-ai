import express from 'express'
import {
  getComplianceHistoryController,
  getDailyCompliance,
  postDailyCompliance
} from '../controllers/compliancecontroller.js'

const router = express.Router()

router.get('/daily', getDailyCompliance)
router.post('/daily', postDailyCompliance)
router.get('/history', getComplianceHistoryController)

export default router
