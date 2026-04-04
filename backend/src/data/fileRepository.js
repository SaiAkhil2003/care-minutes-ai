import { constants as fsConstants } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { AppError } from '../utils/errors.js'
import { createSeedData } from './devSeed.js'

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_STORE_PATH = path.resolve(moduleDirectory, '../../../database/dev-store.json')

const clone = (value) => JSON.parse(JSON.stringify(value))

const sortByDateDesc = (left, right, fieldName) => {
  if (left[fieldName] === right[fieldName]) {
    return String(right.created_at ?? '').localeCompare(String(left.created_at ?? ''))
  }

  return String(right[fieldName] ?? '').localeCompare(String(left[fieldName] ?? ''))
}

const ensureStoreShape = (value) => ({
  facilities: value.facilities ?? [],
  facility_settings: value.facility_settings ?? [],
  staff: value.staff ?? [],
  shifts: value.shifts ?? [],
  compliance_targets: value.compliance_targets ?? [],
  resident_counts: value.resident_counts ?? [],
  daily_compliance: value.daily_compliance ?? [],
  alerts: value.alerts ?? [],
  reports: value.reports ?? []
})

export const getFileStorePath = () =>
  path.resolve(process.env.LOCAL_DATA_FILE?.trim() || DEFAULT_STORE_PATH)

export const usesDefaultFileStorePath = () => !process.env.LOCAL_DATA_FILE?.trim()

export const validateFileStoreAccess = async () => {
  const filePath = getFileStorePath()
  const directoryPath = path.dirname(filePath)

  try {
    await fs.mkdir(directoryPath, { recursive: true })
    await fs.access(directoryPath, fsConstants.R_OK | fsConstants.W_OK)
  } catch (error) {
    throw new AppError(500, 'Local data store directory is not writable', directoryPath)
  }

  try {
    await fs.access(filePath, fsConstants.R_OK | fsConstants.W_OK)
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new AppError(500, 'Local data store file is not readable and writable', filePath)
    }
  }

  return {
    file_path: filePath,
    uses_default_path: usesDefaultFileStorePath()
  }
}

const createFileStore = (filePath = getFileStorePath()) => {
  const readStore = async () => {
    try {
      const rawValue = await fs.readFile(filePath, 'utf8')
      return ensureStoreShape(JSON.parse(rawValue))
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw new AppError(500, 'Unable to load local data store', error.message)
      }

      const seedData = createSeedData()
      await fs.mkdir(path.dirname(filePath), { recursive: true })
      await fs.writeFile(filePath, `${JSON.stringify(seedData, null, 2)}\n`, 'utf8')
      return ensureStoreShape(seedData)
    }
  }

  const writeStore = async (store) => {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, `${JSON.stringify(store, null, 2)}\n`, 'utf8')
  }

  return {
    async listFacilities() {
      const store = await readStore()
      return clone(store.facilities).sort((left, right) => left.name.localeCompare(right.name))
    },

    async getFacilityById(facilityId) {
      const store = await readStore()
      const facility = store.facilities.find((entry) => entry.id === facilityId)

      if (!facility) {
        throw new AppError(404, 'Facility not found')
      }

      return clone(facility)
    },

    async updateFacility(facilityId, payload) {
      const store = await readStore()
      const facility = store.facilities.find((entry) => entry.id === facilityId)

      if (!facility) {
        throw new AppError(404, 'Facility not found')
      }

      Object.assign(facility, payload, {
        updated_at: new Date().toISOString()
      })
      await writeStore(store)

      return clone(facility)
    },

    async getFacilitySettings(facilityId) {
      const store = await readStore()
      const settings = store.facility_settings.find((entry) => entry.facility_id === facilityId)

      return settings ? clone(settings) : null
    },

    async upsertFacilitySettings(payload) {
      const store = await readStore()
      const index = store.facility_settings.findIndex(
        (entry) => entry.facility_id === payload.facility_id
      )
      const now = new Date().toISOString()
      const record = {
        created_at: index >= 0 ? store.facility_settings[index].created_at : now,
        facility_id: payload.facility_id,
        ...payload,
        updated_at: now
      }

      if (index >= 0) {
        store.facility_settings[index] = record
      } else {
        store.facility_settings.push(record)
      }

      await writeStore(store)
      return clone(record)
    },

    async listStaff(facilityId) {
      const store = await readStore()
      return clone(
        store.staff
          .filter((entry) => entry.facility_id === facilityId)
          .sort((left, right) => left.full_name.localeCompare(right.full_name))
      )
    },

    async getStaffById(facilityId, staffId) {
      const store = await readStore()
      const staffMember = store.staff.find(
        (entry) => entry.facility_id === facilityId && entry.id === staffId
      )

      if (!staffMember) {
        throw new AppError(404, 'Staff member not found')
      }

      return clone(staffMember)
    },

    async createStaff(payload) {
      const store = await readStore()
      const now = new Date().toISOString()
      const staffMember = {
        id: randomUUID(),
        created_at: now,
        updated_at: now,
        is_active: true,
        ...payload
      }

      store.staff.push(staffMember)
      await writeStore(store)

      return clone(staffMember)
    },

    async updateStaff(facilityId, staffId, payload) {
      const store = await readStore()
      const staffMember = store.staff.find(
        (entry) => entry.facility_id === facilityId && entry.id === staffId
      )

      if (!staffMember) {
        throw new AppError(404, 'Staff member not found')
      }

      Object.assign(staffMember, payload, {
        updated_at: new Date().toISOString()
      })
      await writeStore(store)

      return clone(staffMember)
    },

    async deleteStaff(facilityId, staffId) {
      const store = await readStore()
      const existingStaffCount = store.staff.length
      store.staff = store.staff.filter(
        (entry) => !(entry.facility_id === facilityId && entry.id === staffId)
      )

      if (store.staff.length === existingStaffCount) {
        throw new AppError(404, 'Staff member not found')
      }

      store.shifts = store.shifts.filter(
        (entry) => !(entry.facility_id === facilityId && entry.staff_id === staffId)
      )
      await writeStore(store)
    },

    async listShifts(facilityId, { startDate = null, endDate = null } = {}) {
      const store = await readStore()
      let shifts = store.shifts.filter((entry) => entry.facility_id === facilityId)

      if (startDate) {
        shifts = shifts.filter((entry) => entry.shift_date >= startDate)
      }

      if (endDate) {
        shifts = shifts.filter((entry) => entry.shift_date <= endDate)
      }

      return clone(shifts.sort((left, right) => sortByDateDesc(left, right, 'shift_date')))
    },

    async listShiftsByStaff(facilityId, staffId) {
      const store = await readStore()
      return clone(
        store.shifts
          .filter((entry) => entry.facility_id === facilityId && entry.staff_id === staffId)
          .sort((left, right) => sortByDateDesc(left, right, 'shift_date'))
      )
    },

    async getShiftById(facilityId, shiftId) {
      const store = await readStore()
      const shift = store.shifts.find(
        (entry) => entry.facility_id === facilityId && entry.id === shiftId
      )

      if (!shift) {
        throw new AppError(404, 'Shift not found')
      }

      return clone(shift)
    },

    async createShift(payload) {
      const store = await readStore()
      const now = new Date().toISOString()
      const shift = {
        id: randomUUID(),
        created_at: now,
        updated_at: now,
        ...payload
      }

      store.shifts.push(shift)
      await writeStore(store)

      return clone(shift)
    },

    async updateShift(facilityId, shiftId, payload) {
      const store = await readStore()
      const shift = store.shifts.find(
        (entry) => entry.facility_id === facilityId && entry.id === shiftId
      )

      if (!shift) {
        throw new AppError(404, 'Shift not found')
      }

      Object.assign(shift, payload, {
        updated_at: new Date().toISOString()
      })
      await writeStore(store)

      return clone(shift)
    },

    async deleteShift(facilityId, shiftId) {
      const store = await readStore()
      const existingShiftCount = store.shifts.length
      store.shifts = store.shifts.filter(
        (entry) => !(entry.facility_id === facilityId && entry.id === shiftId)
      )

      if (store.shifts.length === existingShiftCount) {
        throw new AppError(404, 'Shift not found')
      }

      await writeStore(store)
    },

    async listComplianceTargets(facilityId, { endDate = null } = {}) {
      const store = await readStore()
      let rows = store.compliance_targets.filter((entry) => entry.facility_id === facilityId)

      if (endDate) {
        rows = rows.filter((entry) => entry.effective_date <= endDate)
      }

      return clone(rows.sort((left, right) => sortByDateDesc(left, right, 'effective_date')))
    },

    async upsertComplianceTarget(payload) {
      const store = await readStore()
      const index = store.compliance_targets.findIndex(
        (entry) =>
          entry.facility_id === payload.facility_id
          && entry.effective_date === payload.effective_date
      )
      const now = new Date().toISOString()
      const record = {
        id: index >= 0 ? store.compliance_targets[index].id : randomUUID(),
        created_at: index >= 0 ? store.compliance_targets[index].created_at : now,
        ...payload,
        updated_at: now
      }

      if (index >= 0) {
        store.compliance_targets[index] = record
      } else {
        store.compliance_targets.push(record)
      }

      await writeStore(store)
      return clone(record)
    },

    async listResidentCounts(facilityId, { endDate = null } = {}) {
      const store = await readStore()
      let rows = store.resident_counts.filter((entry) => entry.facility_id === facilityId)

      if (endDate) {
        rows = rows.filter((entry) => entry.effective_date <= endDate)
      }

      return clone(rows.sort((left, right) => sortByDateDesc(left, right, 'effective_date')))
    },

    async upsertResidentCount(payload) {
      const store = await readStore()
      const index = store.resident_counts.findIndex(
        (entry) =>
          entry.facility_id === payload.facility_id
          && entry.effective_date === payload.effective_date
      )
      const now = new Date().toISOString()
      const record = {
        id: index >= 0 ? store.resident_counts[index].id : randomUUID(),
        created_at: index >= 0 ? store.resident_counts[index].created_at : now,
        ...payload,
        updated_at: now
      }

      if (index >= 0) {
        store.resident_counts[index] = record
      } else {
        store.resident_counts.push(record)
      }

      await writeStore(store)
      return clone(record)
    },

    async upsertDailyCompliance(payload) {
      const store = await readStore()
      const index = store.daily_compliance.findIndex(
        (entry) =>
          entry.facility_id === payload.facility_id
          && entry.compliance_date === payload.compliance_date
      )
      const now = new Date().toISOString()
      const record = {
        id: store.daily_compliance[index]?.id ?? randomUUID(),
        created_at: store.daily_compliance[index]?.created_at ?? now,
        updated_at: now,
        ...payload
      }

      if (index >= 0) {
        store.daily_compliance[index] = record
      } else {
        store.daily_compliance.push(record)
      }

      await writeStore(store)
      return clone(record)
    },

    async listAlerts(facilityId, { deliveryChannel = null, alertDate = null, limit = null } = {}) {
      const store = await readStore()
      let alerts = store.alerts.filter((entry) => entry.facility_id === facilityId)

      if (deliveryChannel) {
        alerts = alerts.filter((entry) => entry.delivery_channel === deliveryChannel)
      }

      if (alertDate) {
        alerts = alerts.filter((entry) => entry.alert_date === alertDate)
      }

      alerts = alerts.sort((left, right) => sortByDateDesc(left, right, 'alert_date'))

      if (limit) {
        alerts = alerts.slice(0, limit)
      }

      return clone(alerts)
    },

    async upsertAlert(payload, { uniqueByDateAndChannel = false } = {}) {
      const store = await readStore()
      let index = -1

      if (uniqueByDateAndChannel) {
        index = store.alerts.findIndex(
          (entry) =>
            entry.facility_id === payload.facility_id
            && entry.alert_date === payload.alert_date
            && entry.delivery_channel === payload.delivery_channel
        )
      }

      const now = new Date().toISOString()
      const record = {
        id: index >= 0 ? store.alerts[index].id : randomUUID(),
        created_at: index >= 0 ? store.alerts[index].created_at : now,
        ...payload,
        updated_at: now
      }

      if (index >= 0) {
        store.alerts[index] = record
      } else {
        store.alerts.push(record)
      }

      await writeStore(store)
      return clone(record)
    },

    async createReport(payload) {
      const store = await readStore()
      const now = new Date().toISOString()
      const report = {
        id: randomUUID(),
        generated_at: now,
        created_at: now,
        ...payload
      }

      store.reports.push(report)
      await writeStore(store)

      return clone(report)
    }
  }
}

export const createFileRepository = createFileStore
