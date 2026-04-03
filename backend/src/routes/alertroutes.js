import express from 'express'
import { generateAlertController, getLatestAlertController } from '../controllers/alertcontroller.js'

const router = express.Router()

router.get('/latest', getLatestAlertController)
router.post('/run', generateAlertController)

export default router
