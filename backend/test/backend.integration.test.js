import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { getRepository, resetRepository } from '../src/data/repository.js'
import { calculateDailyCompliance } from '../src/services/complianceservice.js'
import { createShift, updateShift, deleteShift } from '../src/services/shiftservice.js'
import { generateDailyAiAlert } from '../src/services/alertservice.js'
import { getDelayUntilNextAestRun } from '../src/services/alertscheduler.js'
import { getDashboardSummary } from '../src/controllers/dashboardcontroller.js'
import { getDailyCompliance } from '../src/controllers/compliancecontroller.js'
import { getLatestAlertController } from '../src/controllers/alertcontroller.js'
import { getQuarterlyForecastController } from '../src/controllers/forecastcontroller.js'
import { downloadAuditPdf, getReport } from '../src/controllers/reportcontroller.js'
import {
  buildHealthPayload,
  buildReadinessPayload,
  startServer
} from '../src/app.js'
import { errorHandler } from '../src/utils/http.js'

const facilityId = '11111111-1111-4111-8111-111111111111'
const rnStaffId = '22222222-2222-4222-8222-222222222221'
const enStaffId = '22222222-2222-4222-8222-222222222223'

const configureFileStore = async () => {
  const filePath = path.join(os.tmpdir(), `care-minutes-ai-test-${randomUUID()}.json`)
  process.env.DATA_PROVIDER = 'file'
  process.env.LOCAL_DATA_FILE = filePath
  process.env.ENABLE_ALERT_SCHEDULER = 'false'
  process.env.NODE_ENV = 'test'
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.RESEND_API_KEY
  resetRepository()
  return filePath
}

const createMockResponse = () => {
  const headers = new Map()

  return {
    statusCode: 200,
    headersSent: false,
    payload: null,
    body: null,
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), value)
    },
    getHeader(name) {
      return headers.get(String(name).toLowerCase())
    },
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.payload = payload
      this.headersSent = true
      return this
    },
    send(body) {
      this.body = body
      this.headersSent = true
      return this
    }
  }
}

const runHandler = async (handler, req) => {
  const res = createMockResponse()
  let nextError = null
  await handler(req, res, (error) => {
    nextError = error
  })

  if (nextError) {
    throw nextError
  }

  return res
}

test('duplicate shifts are blocked for the same staff and time window', async (t) => {
  const filePath = await configureFileStore()
  t.after(async () => {
    await fs.rm(filePath, { force: true })
  })

  await createShift({
    facility_id: facilityId,
    staff_id: rnStaffId,
    shift_date: '2030-01-15',
    start_time: '08:00',
    end_time: '16:00',
    notes: 'Primary coverage'
  })

  await assert.rejects(
    () => createShift({
      facility_id: facilityId,
      staff_id: rnStaffId,
      shift_date: '2030-01-15',
      start_time: '08:00',
      end_time: '16:00',
      notes: 'Duplicate coverage'
    }),
    /Duplicate shift already exists/
  )
})

test('overlapping shifts are blocked for the same staff member', async (t) => {
  const filePath = await configureFileStore()
  t.after(async () => {
    await fs.rm(filePath, { force: true })
  })

  await createShift({
    facility_id: facilityId,
    staff_id: enStaffId,
    shift_date: '2030-01-16',
    start_time: '08:00',
    end_time: '14:00',
    notes: 'Morning EN shift'
  })

  await assert.rejects(
    () => createShift({
      facility_id: facilityId,
      staff_id: enStaffId,
      shift_date: '2030-01-16',
      start_time: '13:00',
      end_time: '17:00',
      notes: 'Overlap EN shift'
    }),
    /Shift overlaps with existing shift/
  )
})

test('create, update, and delete recalculate compliance for impacted dates', async (t) => {
  const filePath = await configureFileStore()
  t.after(async () => {
    await fs.rm(filePath, { force: true })
  })

  const date = '2030-01-17'
  let compliance = await calculateDailyCompliance(facilityId, date)
  assert.equal(compliance.actual_total_minutes, 0)

  const shift = await createShift({
    facility_id: facilityId,
    staff_id: rnStaffId,
    shift_date: date,
    start_time: '08:00',
    end_time: '12:00',
    notes: 'Half day RN'
  })

  compliance = await calculateDailyCompliance(facilityId, date)
  assert.equal(compliance.actual_total_minutes, 240)
  assert.equal(compliance.actual_rn_minutes, 240)

  await updateShift(facilityId, shift.id, {
    start_time: '08:00',
    end_time: '16:00'
  })

  compliance = await calculateDailyCompliance(facilityId, date)
  assert.equal(compliance.actual_total_minutes, 480)
  assert.equal(compliance.actual_rn_minutes, 480)

  await deleteShift(facilityId, shift.id)

  compliance = await calculateDailyCompliance(facilityId, date)
  assert.equal(compliance.actual_total_minutes, 0)
  assert.equal(compliance.actual_rn_minutes, 0)
})

test('effective-dated targets and resident counts override facility defaults for compliance math', async (t) => {
  const filePath = await configureFileStore()
  t.after(async () => {
    await fs.rm(filePath, { force: true })
  })

  await calculateDailyCompliance(facilityId, '2030-01-16')

  const store = JSON.parse(await fs.readFile(filePath, 'utf8'))
  store.compliance_targets.push({
    id: randomUUID(),
    facility_id: facilityId,
    effective_date: '2030-01-17',
    daily_total_target: 200,
    rn_daily_minimum: 40,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  })
  store.resident_counts.push({
    id: randomUUID(),
    facility_id: facilityId,
    effective_date: '2030-01-17',
    resident_count: 40,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  })
  await fs.writeFile(filePath, `${JSON.stringify(store, null, 2)}\n`, 'utf8')

  const beforeChange = await calculateDailyCompliance(facilityId, '2030-01-16')
  const afterChange = await calculateDailyCompliance(facilityId, '2030-01-17')

  assert.equal(beforeChange.required_total_minutes, 6880)
  assert.equal(beforeChange.required_rn_minutes, 1408)
  assert.equal(afterChange.required_total_minutes, 8000)
  assert.equal(afterChange.required_rn_minutes, 1600)
  assert.equal(afterChange.resident_count, 40)
})

test('dashboard, compliance, ai alert, and report endpoints return stable shapes', async (t) => {
  const filePath = await configureFileStore()
  t.after(async () => {
    await fs.rm(filePath, { force: true })
  })

  const dashboardResponse = await runHandler(getDashboardSummary, {
    query: { facility_id: facilityId },
    method: 'GET',
    originalUrl: '/dashboard/summary'
  })
  assert.equal(dashboardResponse.statusCode, 200)
  assert.equal(typeof dashboardResponse.payload.data.facility.name, 'string')
  assert.equal(Array.isArray(dashboardResponse.payload.data.history), true)
  assert.equal(dashboardResponse.payload.data.history.length, 14)
  assert.equal(typeof dashboardResponse.payload.data.daily_compliance.actual_total_minutes, 'number')
  assert.equal(typeof dashboardResponse.payload.data.forecast.current_compliance_percent, 'number')
  assert.equal(dashboardResponse.payload.data.ai_alert, null)

  const complianceResponse = await runHandler(getDailyCompliance, {
    query: { facility_id: facilityId, date: '2030-01-30' },
    method: 'GET',
    originalUrl: '/compliance/daily'
  })
  assert.equal(complianceResponse.statusCode, 200)
  assert.equal(complianceResponse.payload.data.actual_total_minutes, 0)
  assert.equal(complianceResponse.payload.data.actual_rn_minutes, 0)

  const alertResponse = await runHandler(getLatestAlertController, {
    query: { facility_id: facilityId },
    method: 'GET',
    originalUrl: '/ai-alerts/latest'
  })
  assert.equal(alertResponse.statusCode, 200)
  assert.equal(alertResponse.payload.data, null)

  const reportResponse = await runHandler(getReport, {
    query: { facility_id: facilityId, start_date: '2030-01-01', end_date: '2030-01-07' },
    method: 'GET',
    originalUrl: '/reports'
  })
  assert.equal(reportResponse.statusCode, 200)
  assert.equal(typeof reportResponse.payload.data.summary.total_actual_minutes, 'number')
  assert.equal(typeof reportResponse.payload.data.summary.overall_compliance_percent, 'number')
  assert.equal(typeof reportResponse.payload.data.agency_permanent_split.agency_percent, 'number')
  assert.equal(Array.isArray(reportResponse.payload.data.daily_breakdown), true)
  assert.deepEqual(
    reportResponse.payload.data.staff_type_breakdown.map((row) => row.name),
    ['RN', 'EN', 'PCW', 'Agency']
  )

  const pdfResponse = await runHandler(downloadAuditPdf, {
    query: { facility_id: facilityId, start_date: '2030-01-01', end_date: '2030-01-07' },
    method: 'GET',
    originalUrl: '/reports/audit.pdf'
  })
  assert.equal(pdfResponse.statusCode, 200)
  assert.equal(pdfResponse.getHeader('content-type'), 'application/pdf')
  assert.equal(Buffer.isBuffer(pdfResponse.body), true)
  assert.equal(pdfResponse.body.subarray(0, 8).toString(), '%PDF-1.4')
  assert.equal(pdfResponse.body.toString('latin1').includes('Harbour View Care'), true)
  assert.equal(pdfResponse.body.toString('latin1').includes('2030-01-01 to 2030-01-07'), true)
})

test('alert generation returns a deterministic fallback when credentials are missing', async (t) => {
  const filePath = await configureFileStore()
  t.after(async () => {
    await fs.rm(filePath, { force: true })
  })

  const alert = await generateDailyAiAlert(facilityId, '2030-01-30')
  const persistedAlerts = await getRepository().listAlerts(facilityId, {
    alertDate: '2030-01-30'
  })

  assert.equal(alert.status, 'sent')
  assert.equal(alert.delivery_channel, 'in_app')
  assert.equal(alert.title, 'Action needed to stay compliant')
  assert.equal(alert.message.includes('2030-01-30'), true)
  assert.equal(Array.isArray(alert.suggested_staff_ids), true)
  assert.equal(persistedAlerts.some((entry) => entry.delivery_channel === 'in_app' && entry.status === 'sent'), true)
})

test('alert generation uses Claude and Resend paths and persists both delivery channels', async (t) => {
  const filePath = await configureFileStore()
  const originalFetch = global.fetch
  const originalAnthropicKey = process.env.ANTHROPIC_API_KEY
  const originalResendKey = process.env.RESEND_API_KEY
  const originalResendFrom = process.env.RESEND_FROM_EMAIL
  const fetchCalls = []

  process.env.ANTHROPIC_API_KEY = 'test-anthropic-key'
  process.env.RESEND_API_KEY = 'test-resend-key'
  process.env.RESEND_FROM_EMAIL = 'alerts@test.example'

  global.fetch = async (url, options = {}) => {
    fetchCalls.push({
      url,
      options
    })

    if (String(url).includes('anthropic.com')) {
      const payload = JSON.parse(options.body)

      assert.equal(payload.model, 'claude-sonnet-4-6')

      return {
        ok: true,
        async json() {
          return {
            content: [
              {
                type: 'text',
                text: 'Action needed to stay compliant. Focus on 2030-01-30. Add RN coverage. Estimated extra minutes per shift: RN 480. Suggested staff to contact: Sarah Nguyen.'
              }
            ]
          }
        }
      }
    }

    if (String(url).includes('resend.com')) {
      return {
        ok: true,
        async json() {
          return { id: 'email_123' }
        }
      }
    }

    throw new Error(`Unexpected fetch URL: ${url}`)
  }

  t.after(async () => {
    global.fetch = originalFetch
    if (originalAnthropicKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY
    } else {
      process.env.ANTHROPIC_API_KEY = originalAnthropicKey
    }
    if (originalResendKey === undefined) {
      delete process.env.RESEND_API_KEY
    } else {
      process.env.RESEND_API_KEY = originalResendKey
    }
    if (originalResendFrom === undefined) {
      delete process.env.RESEND_FROM_EMAIL
    } else {
      process.env.RESEND_FROM_EMAIL = originalResendFrom
    }
    await fs.rm(filePath, { force: true })
  })

  const alert = await generateDailyAiAlert(facilityId, '2030-01-30')
  const persistedAlerts = await getRepository().listAlerts(facilityId, {
    alertDate: '2030-01-30'
  })

  assert.equal(alert.status, 'sent')
  assert.equal(alert.delivery_channel, 'in_app')
  assert.equal(alert.message.includes('Action needed to stay compliant'), true)
  assert.equal(fetchCalls.length, 2)
  assert.equal(fetchCalls.some((entry) => String(entry.url).includes('anthropic.com')), true)
  assert.equal(fetchCalls.some((entry) => String(entry.url).includes('resend.com')), true)
  assert.equal(persistedAlerts.length, 2)
  assert.equal(persistedAlerts.some((entry) => entry.delivery_channel === 'in_app'), true)
  assert.equal(persistedAlerts.some((entry) => entry.delivery_channel === 'email' && entry.status === 'sent'), true)
})

test('forecast controller rejects negative scenario inputs with a clean validation error', async (t) => {
  const filePath = await configureFileStore()
  t.after(async () => {
    await fs.rm(filePath, { force: true })
  })

  await assert.rejects(
    () => runHandler(getQuarterlyForecastController, {
      query: {
        facility_id: facilityId,
        scenario_shift_minutes: '-15',
        scenario_shifts_per_week: '2'
      },
      method: 'GET',
      originalUrl: '/forecast/quarterly'
    }),
    /scenario_shift_minutes must be zero or greater/
  )
})

test('alert scheduler computes the next 7:00am Australia/Sydney run across DST', () => {
  assert.equal(
    getDelayUntilNextAestRun(new Date('2025-01-15T19:30:00.000Z')),
    30 * 60 * 1000
  )

  assert.equal(
    getDelayUntilNextAestRun(new Date('2025-01-15T21:30:00.000Z')),
    (22 * 60 + 30) * 60 * 1000
  )

  assert.equal(
    getDelayUntilNextAestRun(new Date('2025-07-15T20:30:00.000Z')),
    30 * 60 * 1000
  )
})

test('health, ready, and invalid JSON responses stay production-safe', async (t) => {
  const filePath = await configureFileStore()
  const port = 43000 + Math.floor(Math.random() * 1000)
  const server = await startServer(port)

  t.after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') {
          reject(error)
        } else {
          resolve()
        }
      })
    })
    await fs.rm(filePath, { force: true })
  })

  assert.equal(server.constructor.name, 'Server')

  const healthPayload = buildHealthPayload()
  assert.equal(healthPayload.status, 'ok')
  assert.equal(healthPayload.service, 'care-minutes-ai-backend')

  const readyPayload = await buildReadinessPayload()
  assert.equal(readyPayload.status, 'ready')
  assert.equal(readyPayload.data_mode, 'file')
  assert.equal(readyPayload.repository.file_store.file_path, filePath)

  const invalidJsonResponse = createMockResponse()
  errorHandler(Object.assign(new SyntaxError('Unexpected end of JSON input'), {
    status: 400,
    body: '{"facility_id"'
  }), {}, invalidJsonResponse, () => {
    throw new Error('errorHandler should not call next for invalid JSON')
  })
  assert.equal(invalidJsonResponse.statusCode, 400)
  assert.equal(invalidJsonResponse.payload.error.message, 'Invalid JSON request body')
})
