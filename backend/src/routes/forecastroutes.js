import express from 'express'
import { getQuarterlyForecastController } from '../controllers/forecastcontroller.js'

const router = express.Router()

router.get('/quarterly', getQuarterlyForecastController)

export default router
