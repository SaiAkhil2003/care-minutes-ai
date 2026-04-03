import dns from 'node:dns'
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import alertroutes from './routes/alertroutes.js'
import complianceroutes from './routes/complianceroutes.js'
import dashboardroutes from './routes/dashboardroutes.js'
import facilityroutes from './routes/facilityroutes.js'
import forecastroutes from './routes/forecastroutes.js'
import reportroutes from './routes/reportroutes.js'
import shiftroutes from './routes/shiftroutes.js'
import staffroutes from './routes/staffroutes.js'
import { errorHandler, notFoundHandler } from './utils/http.js'
import { getRepositoryMode } from './data/repository.js'
import { startAlertScheduler } from './services/alertscheduler.js'

dns.setDefaultResultOrder('ipv4first')
dotenv.config()

export const app = express()
const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:5173'

app.use(cors({
  origin: corsOrigin,
  credentials: true
}))
app.use(express.json())

app.get('/', (req, res) => {
  res.json({
    data: {
      status: 'ok',
      service: 'care-minutes-ai-backend',
      data_mode: getRepositoryMode()
    }
  })
})

app.use('/facilities', facilityroutes)
app.use('/dashboard', dashboardroutes)
app.use('/forecast', forecastroutes)
app.use('/staff', staffroutes)
app.use('/shifts', shiftroutes)
app.use('/compliance', complianceroutes)
app.use('/reports', reportroutes)
app.use('/ai-alerts', alertroutes)

app.use(notFoundHandler)
app.use(errorHandler)

export const startServer = (port = Number(process.env.PORT ?? 3000)) =>
  new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      if (process.env.NODE_ENV !== 'test') {
        startAlertScheduler()
      }
      console.log(`server running on port ${port}`)
      resolve(server)
    })

    server.on('error', reject)
  })

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isDirectRun) {
  startServer().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
