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
import { AppError } from './utils/errors.js'
import {
  asyncHandler,
  errorHandler,
  notFoundHandler,
  sendData
} from './utils/http.js'
import { validateRepositoryConfiguration } from './data/repository.js'
import { startAlertScheduler } from './services/alertscheduler.js'

dns.setDefaultResultOrder('ipv4first')
dotenv.config()

export const app = express()

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1'])
const APP_NAME = 'care-minutes-ai-backend'
const configuredOrigins = new Set(
  (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
)
const allowAllCorsOrigins = String(process.env.CORS_ALLOW_ALL ?? '').trim().toLowerCase() === 'true'

app.disable('x-powered-by')

const isLocalOrigin = (origin) => {
  try {
    const url = new URL(origin)
    return LOCAL_HOSTNAMES.has(url.hostname)
  } catch {
    return false
  }
}

const isAllowedOrigin = (origin) => {
  if (!origin || allowAllCorsOrigins || configuredOrigins.has(origin)) {
    return true
  }

  return process.env.NODE_ENV !== 'production' && isLocalOrigin(origin)
}

app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true)
    } else {
      callback(new AppError(403, 'Origin not allowed by CORS', origin))
    }
  },
  credentials: true,
  optionsSuccessStatus: 204
}))

app.use(express.json({ limit: '1mb' }))

const getOptionalServiceFlags = () => ({
  ai_alerts_configured: Boolean(process.env.ANTHROPIC_API_KEY),
  email_delivery_configured: Boolean(process.env.RESEND_API_KEY),
  alert_scheduler_enabled: String(process.env.ENABLE_ALERT_SCHEDULER ?? '').trim().toLowerCase() === 'true'
})

export const buildHealthPayload = () => ({
  status: 'ok',
  service: APP_NAME,
  timestamp: new Date().toISOString()
})

export const buildReadinessPayload = async () => {
  try {
    const repository = await validateRepositoryConfiguration()

    return {
      status: 'ready',
      service: APP_NAME,
      timestamp: new Date().toISOString(),
      data_mode: repository.mode,
      repository,
      optional_services: getOptionalServiceFlags()
    }
  } catch (error) {
    return {
      status: 'not_ready',
      service: APP_NAME,
      timestamp: new Date().toISOString(),
      data_mode: null,
      repository: {
        mode: null,
        warnings: [],
        error: error instanceof Error ? error.message : String(error)
      },
      optional_services: getOptionalServiceFlags()
    }
  }
}

app.get('/', (req, res) => {
  res.json({
    data: buildHealthPayload()
  })
})

app.get('/health', (req, res) => {
  res.json({
    data: buildHealthPayload()
  })
})

app.get('/status', asyncHandler(async (req, res) => {
  sendData(res, await buildReadinessPayload())
}))

app.get('/ready', asyncHandler(async (req, res) => {
  const payload = await buildReadinessPayload()
  res.status(payload.status === 'ready' ? 200 : 503).json({ data: payload })
}))

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

const resolvePort = (value = process.env.PORT ?? '3000') => {
  const parsedPort = Number(value)

  if (!Number.isInteger(parsedPort) || parsedPort < 0 || parsedPort > 65535) {
    throw new Error(`PORT must be an integer between 0 and 65535. Received: ${value}`)
  }

  return parsedPort
}

const logStartupWarnings = (repositoryConfig) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[startup] ANTHROPIC_API_KEY is not set. AI alerts will use fallback content.')
  }

  if (!process.env.RESEND_API_KEY) {
    console.warn('[startup] RESEND_API_KEY is not set. Email alerts are disabled.')
  }

  for (const warning of repositoryConfig.warnings ?? []) {
    console.warn(`[startup] ${warning}`)
  }
}

export const startServer = async (port = process.env.PORT ?? '3000') => {
  const resolvedPort = resolvePort(port)
  const repositoryConfig = await validateRepositoryConfiguration()

  return new Promise((resolve, reject) => {
    const server = app.listen(resolvedPort, () => {
      if (process.env.NODE_ENV !== 'test') {
        logStartupWarnings(repositoryConfig)
        startAlertScheduler()
      }
      console.log(`server running on port ${resolvedPort}`)
      resolve(server)
    })

    server.on('error', reject)
  })
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isDirectRun) {
  startServer().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
