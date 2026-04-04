import { useEffect, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import api, { buildApiUrl, getApiErrorMessage, unwrap } from './api'
import {
  getQuarterBounds,
  getStatusMeta,
  roundToTwo
} from '@shared/careCalculations'
import {
  buildPdfFilename,
  clampScenarioValue,
  getDailyStatusPercent,
  getTodayStaffTypeBreakdown,
  hasBreakdownMinutes
} from './dashboardView'
import './App.css'

const staffTypeLabels = {
  rn: 'RN',
  en: 'EN',
  pcw: 'PCW'
}

const employmentTypeLabels = {
  permanent: 'Permanent',
  part_time: 'Part time',
  casual: 'Casual',
  agency: 'Agency'
}

const metricFormatter = new Intl.NumberFormat('en-AU')
const currencyFormatter = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  maximumFractionDigits: 0
})

const chartGridStroke = 'rgba(255, 255, 255, 0.1)'
const chartAxisStyle = { fill: '#8f98a8', fontSize: 12 }
const chartTooltipStyle = {
  backgroundColor: '#111318',
  border: '1px solid rgba(255, 255, 255, 0.12)',
  borderRadius: '16px',
  boxShadow: '0 20px 45px rgba(0, 0, 0, 0.35)',
  color: '#f5f7fa'
}

const formatNumber = (value) => metricFormatter.format(Number.isFinite(Number(value)) ? Number(value) : 0)
const formatPercent = (value) => `${roundToTwo(value)}%`
const formatCurrency = (value) => currencyFormatter.format(Number.isFinite(Number(value)) ? Number(value) : 0)
const formatDateLabel = (value) => value?.slice(5) ?? value ?? ''
const getProgressWidth = (value) => `${Math.max(0, Math.min(Number(value) || 0, 100))}%`
const formatDateTimeLabel = (value) => {
  if (typeof value !== 'string') {
    return 'N/A'
  }

  const [date = '', time = ''] = value.split('T')
  return `${date} ${time.slice(0, 5)}`
}

const renderLegendText = (value) => <span className="chart-legend-text">{value}</span>
const formatAlertTag = (alert) => {
  if (!alert) {
    return {
      className: 'tag tag-neutral',
      label: 'pending'
    }
  }

  if (alert.status === 'failed' || alert.alert_type === 'warning') {
    return {
      className: 'tag tag-warning',
      label: alert.alert_type ?? alert.status
    }
  }

  return {
    className: 'tag tag-neutral',
    label: alert.status ?? 'ready'
  }
}

const normalizeFacilitiesPayload = (payload) => {
  if (Array.isArray(payload)) {
    return payload
  }

  if (Array.isArray(payload?.data)) {
    return payload.data
  }

  return []
}

const getFacilityIdValue = (facility) => String(facility?.id ?? '')

const resolveSelectedFacilityId = (facilityList, requestedFacilityId) => {
  if (!facilityList.length) {
    return ''
  }

  const matchedFacility = requestedFacilityId
    ? facilityList.find((facility) => getFacilityIdValue(facility) === String(requestedFacilityId))
    : null

  return getFacilityIdValue(matchedFacility ?? facilityList[0])
}

const fetchFacilities = async () => {
  const response = await api.get('/facilities')
  return normalizeFacilitiesPayload(response?.data ?? response)
}

const fetchDashboardBundle = async ({
  facilityId,
  scenarioShiftMinutes,
  scenarioShiftsPerWeek
}) => {
  const summary = await unwrap(api.get('/dashboard/summary', {
    params: {
      facility_id: facilityId
    }
  }))

  const scenarioForecast = await unwrap(api.get('/forecast/quarterly', {
    params: {
      facility_id: facilityId,
      today_date: summary.date,
      scenario_shift_minutes: scenarioShiftMinutes,
      scenario_shifts_per_week: scenarioShiftsPerWeek
    }
  }))

  const reportData = await unwrap(api.get('/reports', {
    params: {
      facility_id: facilityId,
      start_date: scenarioForecast.quarter_start_date,
      end_date: summary.date
    }
  }))

  return {
    summary,
    scenarioForecast,
    reportData
  }
}

const buildEmptyStaffForm = () => ({
  full_name: '',
  email: '',
  phone: '',
  staff_type: 'rn',
  employment_type: 'permanent'
})

const buildEmptyShiftForm = () => ({
  staff_id: '',
  shift_date: '',
  start_time: '',
  end_time: '',
  notes: ''
})

const buildStaffFormFromMember = (member) => ({
  full_name: member?.full_name ?? '',
  email: member?.email ?? '',
  phone: member?.phone ?? '',
  staff_type: member?.staff_type ?? 'rn',
  employment_type: member?.employment_type ?? 'permanent'
})

const buildShiftFormFromShift = (shift) => ({
  staff_id: shift?.staff_id ?? '',
  shift_date: shift?.shift_date ?? shift?.start_time?.slice(0, 10) ?? '',
  start_time: shift?.start_time?.split('T')[1]?.slice(0, 5) ?? '',
  end_time: shift?.end_time?.split('T')[1]?.slice(0, 5) ?? '',
  notes: shift?.notes ?? ''
})

function App() {
  const [facilities, setFacilities] = useState([])
  const [selectedFacilityId, setSelectedFacilityId] = useState('')
  const [dashboard, setDashboard] = useState(null)
  const [forecast, setForecast] = useState(null)
  const [report, setReport] = useState(null)

  const [loadingFacilities, setLoadingFacilities] = useState(true)
  const [loadingDashboard, setLoadingDashboard] = useState(false)
  const [savingStaff, setSavingStaff] = useState(false)
  const [savingShift, setSavingShift] = useState(false)
  const [runningAlert, setRunningAlert] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [deletingId, setDeletingId] = useState('')

  const [pageError, setPageError] = useState('')
  const [staffError, setStaffError] = useState('')
  const [shiftError, setShiftError] = useState('')
  const [notice, setNotice] = useState('')

  const [scenarioShiftMinutes, setScenarioShiftMinutes] = useState(480)
  const [scenarioShiftsPerWeek, setScenarioShiftsPerWeek] = useState(2)
  const [staffForm, setStaffForm] = useState(buildEmptyStaffForm)
  const [shiftForm, setShiftForm] = useState(buildEmptyShiftForm)
  const [editingStaffId, setEditingStaffId] = useState('')
  const [editingShiftId, setEditingShiftId] = useState('')

  const clearMessages = () => {
    setPageError('')
    setStaffError('')
    setShiftError('')
    setNotice('')
  }

  const loadDashboard = async (facilityId) => {
    if (!facilityId) {
      return
    }

    setLoadingDashboard(true)
    setPageError('')

    try {
      const { summary, scenarioForecast, reportData } = await fetchDashboardBundle({
        facilityId,
        scenarioShiftMinutes,
        scenarioShiftsPerWeek
      })

      setDashboard(summary)
      setForecast(scenarioForecast)
      setReport(reportData)
      setShiftForm((currentValue) => ({
        ...currentValue,
        shift_date: currentValue.shift_date || summary.date
      }))

      const url = new URL(window.location.href)
      url.searchParams.set('facilityId', facilityId)
      window.history.replaceState({}, '', url)
    } catch (error) {
      setPageError(getApiErrorMessage(error))
    } finally {
      setLoadingDashboard(false)
    }
  }

  useEffect(() => {
    let isMounted = true

    const run = async () => {
      setLoadingFacilities(true)
      setPageError('')

      try {
        const facilityList = await fetchFacilities()

        if (!isMounted) {
          return
        }

        setFacilities(facilityList)

        if (!facilityList.length) {
          setSelectedFacilityId('')
          setDashboard(null)
          setForecast(null)
          setReport(null)
          return
        }

        const requestedFacilityId = new URLSearchParams(window.location.search).get('facilityId')
        const initialFacilityId = resolveSelectedFacilityId(facilityList, requestedFacilityId)

        setSelectedFacilityId(initialFacilityId)
      } catch (error) {
        if (isMounted) {
          setPageError(getApiErrorMessage(error))
        }
      } finally {
        if (isMounted) {
          setLoadingFacilities(false)
        }
      }
    }

    void run()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (!selectedFacilityId) {
      return
    }

    setEditingStaffId('')
    setEditingShiftId('')
    setStaffError('')
    setShiftError('')
    setStaffForm(buildEmptyStaffForm())
    setShiftForm(buildEmptyShiftForm())
  }, [selectedFacilityId])

  useEffect(() => {
    if (!selectedFacilityId) {
      return
    }

    let isCancelled = false

    const run = async () => {
      setLoadingDashboard(true)
      setPageError('')

      try {
        const { summary, scenarioForecast, reportData } = await fetchDashboardBundle({
          facilityId: selectedFacilityId,
          scenarioShiftMinutes,
          scenarioShiftsPerWeek
        })

        if (isCancelled) {
          return
        }

        setDashboard(summary)
        setForecast(scenarioForecast)
        setReport(reportData)
        setShiftForm((currentValue) => ({
          ...currentValue,
          shift_date: currentValue.shift_date || summary.date
        }))
        const url = new URL(window.location.href)
        url.searchParams.set('facilityId', selectedFacilityId)
        window.history.replaceState({}, '', url)
      } catch (error) {
        if (!isCancelled) {
          setPageError(getApiErrorMessage(error))
        }
      } finally {
        if (!isCancelled) {
          setLoadingDashboard(false)
        }
      }
    }

    void run()

    return () => {
      isCancelled = true
    }
  }, [selectedFacilityId, scenarioShiftMinutes, scenarioShiftsPerWeek])

  const submitStaff = async (event) => {
    event.preventDefault()

    if (!selectedFacilityId) {
      return
    }

    if (!staffForm.full_name.trim()) {
      setStaffError('Full name is required.')
      return
    }

    setSavingStaff(true)
    setStaffError('')
    setNotice('')
    setPageError('')

    try {
      const request = editingStaffId
        ? api.put(`/staff/${editingStaffId}`, {
          facility_id: selectedFacilityId,
          ...staffForm
        })
        : api.post('/staff', {
          facility_id: selectedFacilityId,
          ...staffForm
        })

      await unwrap(request)

      setStaffForm(buildEmptyStaffForm())
      setEditingStaffId('')
      setNotice(editingStaffId ? 'Staff member updated successfully.' : 'Staff member saved successfully.')
      await loadDashboard(selectedFacilityId)
    } catch (error) {
      setStaffError(getApiErrorMessage(error))
    } finally {
      setSavingStaff(false)
    }
  }

  const submitShift = async (event) => {
    event.preventDefault()

    if (!selectedFacilityId) {
      return
    }

    if (!staff.length) {
      setShiftError('Add a staff member before recording a shift.')
      return
    }

    if (!shiftForm.staff_id || !shiftForm.shift_date || !shiftForm.start_time || !shiftForm.end_time) {
      setShiftError('Staff, date, start time, and end time are required.')
      return
    }

    if (!staff.some((member) => member.id === shiftForm.staff_id)) {
      setShiftError('Select a valid staff member for the current facility.')
      return
    }

    setSavingShift(true)
    setShiftError('')
    setNotice('')
    setPageError('')

    try {
      const request = editingShiftId
        ? api.put(`/shifts/${editingShiftId}`, {
          facility_id: selectedFacilityId,
          ...shiftForm
        })
        : api.post('/shifts', {
          facility_id: selectedFacilityId,
          ...shiftForm
        })

      await unwrap(request)

      setShiftForm((currentValue) => ({
        ...buildEmptyShiftForm(),
        shift_date: currentValue.shift_date
      }))
      setEditingShiftId('')
      setNotice(editingShiftId ? 'Shift updated successfully.' : 'Shift saved successfully.')
      await loadDashboard(selectedFacilityId)
    } catch (error) {
      setShiftError(getApiErrorMessage(error))
    } finally {
      setSavingShift(false)
    }
  }

  const handleDeleteStaff = async (staffId) => {
    if (!selectedFacilityId) {
      return
    }

    if (!window.confirm('Delete this staff member? Their linked shifts for this facility will also be removed.')) {
      return
    }

    setDeletingId(staffId)
    setNotice('')
    setPageError('')
    setStaffError('')
    setShiftError('')

    try {
      await unwrap(api.delete(`/staff/${staffId}`, {
        params: {
          facility_id: selectedFacilityId
        }
      }))
      if (editingStaffId === staffId) {
        setEditingStaffId('')
        setStaffForm(buildEmptyStaffForm())
      }
      setNotice('Staff member deleted successfully.')
      await loadDashboard(selectedFacilityId)
    } catch (error) {
      setPageError(getApiErrorMessage(error))
    } finally {
      setDeletingId('')
    }
  }

  const handleDeleteShift = async (shiftId) => {
    if (!selectedFacilityId) {
      return
    }

    if (!window.confirm('Delete this shift?')) {
      return
    }

    setDeletingId(shiftId)
    setNotice('')
    setPageError('')
    setStaffError('')
    setShiftError('')

    try {
      await unwrap(api.delete(`/shifts/${shiftId}`, {
        params: {
          facility_id: selectedFacilityId
        }
      }))
      if (editingShiftId === shiftId) {
        setEditingShiftId('')
        setShiftForm((currentValue) => ({
          ...buildEmptyShiftForm(),
          shift_date: currentValue.shift_date || dashboard?.date || ''
        }))
      }
      setNotice('Shift deleted successfully.')
      await loadDashboard(selectedFacilityId)
    } catch (error) {
      setPageError(getApiErrorMessage(error))
    } finally {
      setDeletingId('')
    }
  }

  const handleRunAlert = async () => {
    if (!selectedFacilityId) {
      return
    }

    setRunningAlert(true)
    setNotice('')
    setPageError('')

    try {
      const alert = await unwrap(api.post('/ai-alerts/run', {
        facility_id: selectedFacilityId,
        date: dashboard?.date
      }))

      setDashboard((currentValue) => currentValue ? {
        ...currentValue,
        ai_alert: alert
      } : currentValue)
      setNotice('AI alert generated successfully.')
    } catch (error) {
      setPageError(getApiErrorMessage(error))
    } finally {
      setRunningAlert(false)
    }
  }

  const handleDownloadPdf = async () => {
    if (!selectedFacilityId || !forecast || !dashboard?.date) {
      return
    }

    setDownloadingPdf(true)
    setNotice('')
    setPageError('')

    try {
      const response = await fetch(buildApiUrl('/reports/audit.pdf', {
        facility_id: selectedFacilityId,
        start_date: forecast.quarter_start_date,
        end_date: dashboard.date
      }))

      if (!response.ok) {
        let errorMessage = 'Unable to download audit PDF.'

        try {
          const errorPayload = await response.json()
          errorMessage = errorPayload?.error?.message ?? errorPayload?.message ?? errorMessage
        } catch {
          const errorText = await response.text()
          if (errorText) {
            errorMessage = errorText
          }
        }

        throw new Error(errorMessage)
      }

      const pdfBlob = await response.blob()
      const downloadUrl = window.URL.createObjectURL(pdfBlob)
      const anchor = document.createElement('a')

      anchor.href = downloadUrl
      anchor.download = buildPdfFilename(facility?.name, forecast.quarter_start_date, dashboard.date)
      anchor.rel = 'noopener'
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => {
        window.URL.revokeObjectURL(downloadUrl)
      }, 0)
      setNotice('Audit PDF downloaded successfully.')
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Unable to download audit PDF.')
    } finally {
      setDownloadingPdf(false)
    }
  }

  const handleEditStaff = (member) => {
    clearMessages()
    setEditingStaffId(member.id)
    setStaffForm(buildStaffFormFromMember(member))
  }

  const handleEditShift = (shift) => {
    clearMessages()
    setEditingShiftId(shift.id)
    setShiftForm(buildShiftFormFromShift(shift))
  }

  const cancelStaffEdit = () => {
    setEditingStaffId('')
    setStaffForm(buildEmptyStaffForm())
    setStaffError('')
  }

  const cancelShiftEdit = () => {
    setEditingShiftId('')
    setShiftForm({
      ...buildEmptyShiftForm(),
      shift_date: dashboard?.date ?? shiftForm.shift_date ?? ''
    })
    setShiftError('')
  }

  const facility = dashboard?.facility
  const dailyCompliance = dashboard?.daily_compliance
  const history = dashboard?.history ?? []
  const staff = dashboard?.staff ?? []
  const shifts = dashboard?.shifts ?? []
  const aiAlert = dashboard?.ai_alert
  const todayDate = dashboard?.date
  const quarterBounds = todayDate ? getQuarterBounds(todayDate) : { start: null, end: null }
  const statusMeta = getStatusMeta(dailyCompliance?.status)
  const alertTag = formatAlertTag(aiAlert)
  const todayStatusPercent = getDailyStatusPercent(dailyCompliance)
  const todayBreakdown = getTodayStaffTypeBreakdown(dailyCompliance)
  const hasTodayBreakdown = hasBreakdownMinutes(todayBreakdown)
  const hasStaff = staff.length > 0
  const isBusy = loadingDashboard || savingStaff || savingShift || runningAlert || downloadingPdf || !!deletingId
  const shiftFormDisabled = isBusy || !hasStaff

  const historyChartData = history.map((row) => ({
    date: formatDateLabel(row.compliance_date),
    compliance: row.compliance_percent ?? 0,
    rnCompliance: row.rn_compliance_percent ?? 0
  }))

  const staffMix = Object.keys(staffTypeLabels).map((staffType, index) => ({
    name: staffTypeLabels[staffType],
    value: staff.filter((member) => member.staff_type === staffType).length,
    color: ['#e50914', '#ef4444', '#f59e0b'][index]
  }))

  const suggestedStaffNames = (aiAlert?.suggested_staff_ids ?? [])
    .map((staffId) => staff.find((member) => member.id === staffId)?.full_name)
    .filter(Boolean)

  const shiftsWithNames = shifts.map((shift) => ({
    ...shift,
    staff_name: staff.find((member) => member.id === shift.staff_id)?.full_name ?? 'Unknown staff'
  }))

  if (loadingFacilities) {
    return (
      <main className="page-shell">
        <div className="page-backdrop" aria-hidden="true" />
        <section className="status-panel status-panel-centered">
          <p className="eyebrow">Care Minutes AI</p>
          <h1>Loading dashboard</h1>
          <p>Fetching facilities and compliance data...</p>
        </section>
      </main>
    )
  }

  if (!facilities.length) {
    return (
      <main className="page-shell">
        <div className="page-backdrop" aria-hidden="true" />
        <section className="status-panel status-panel-centered">
          <p className="eyebrow">Care Minutes AI</p>
          <h1>{pageError ? 'Unable to load facilities' : 'No facilities configured'}</h1>
          <p>
            {pageError
              ? pageError
              : 'Add a facility to begin tracking care minutes and compliance performance.'}
          </p>
        </section>
      </main>
    )
  }

  return (
    <main className="page-shell">
      <div className="page-backdrop" aria-hidden="true" />
      <div className="page-frame">
        <section className="hero-panel">
          <div className="hero-content">
            <div className="hero-copy-block">
              <p className="eyebrow">Care Minutes AI</p>
              <h1>Premium care minutes oversight for compliance-critical operations.</h1>
              <p className="hero-copy">
                Track daily compliance, monitor RN coverage, forecast quarter-end risk, run AI staffing guidance,
                and export audit-ready reporting from one facility-scoped control room.
              </p>
            </div>

            <div className="hero-highlight-grid">
              <div className="hero-highlight">
                <span>Facility</span>
                <strong>{facility?.name ?? 'Facility dashboard'}</strong>
                <p>{formatNumber(facility?.resident_count)} residents</p>
              </div>
              <div className="hero-highlight">
                <span>Today&apos;s status</span>
                <strong>{formatPercent(todayStatusPercent)}</strong>
                <p>{statusMeta.label} based on total and RN coverage</p>
              </div>
              <div className="hero-highlight">
                <span>Quarter risk</span>
                <strong>{formatCurrency(forecast?.dollar_value_at_risk)}</strong>
                <p>{formatNumber(forecast?.minutes_needed_per_day_to_recover)} minutes/day to recover</p>
              </div>
            </div>

            <div className="hero-actions">
              <button className="ghost-button" disabled={loadingDashboard} type="button" onClick={() => loadDashboard(selectedFacilityId)}>
                {loadingDashboard ? 'Refreshing...' : 'Refresh dashboard'}
              </button>
              <button className="primary-button" disabled={runningAlert || !selectedFacilityId} type="button" onClick={handleRunAlert}>
                {runningAlert ? 'Generating alert...' : 'Generate AI alert'}
              </button>
              <button className="ghost-button" disabled={downloadingPdf || !forecast || !todayDate} type="button" onClick={() => void handleDownloadPdf()}>
                {downloadingPdf ? 'Downloading PDF...' : 'Download audit PDF'}
              </button>
            </div>
          </div>

          <aside className="hero-sidebar">
            <div className="control-card">
              <div className="panel-header panel-header-tight">
                <div>
                  <p className="eyebrow">Controls</p>
                  <h3>Facility and recovery scenario</h3>
                </div>
              </div>

              <label className="field">
                <span>Facility</span>
                <select
                  disabled={loadingDashboard}
                  value={selectedFacilityId}
                  onChange={(event) => {
                    clearMessages()
                    setSelectedFacilityId(event.target.value)
                  }}
                >
                  {facilities.map((facilityOption) => (
                    <option key={facilityOption.id} value={getFacilityIdValue(facilityOption)}>
                      {facilityOption.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="compact-grid">
                <label className="field">
                  <span>Scenario shift minutes</span>
                  <input
                    min="0"
                    step="15"
                    type="number"
                    value={scenarioShiftMinutes}
                    onChange={(event) => setScenarioShiftMinutes(clampScenarioValue(event.target.value, {
                      maximum: 1440
                    }))}
                  />
                </label>

                <label className="field">
                  <span>Scenario shifts per week</span>
                  <input
                    min="0"
                    step="1"
                    type="number"
                    value={scenarioShiftsPerWeek}
                    onChange={(event) => setScenarioShiftsPerWeek(clampScenarioValue(event.target.value, {
                      maximum: 21
                    }))}
                  />
                </label>
              </div>

              <p className="helper-text">
                Scenario adds {formatNumber(scenarioShiftMinutes * scenarioShiftsPerWeek)} minutes per week.
                {forecast
                  ? ` Projected additional quarter minutes: ${formatNumber(forecast?.scenario?.additional_minutes_total)}.`
                  : ''}
              </p>
            </div>

            <div className="hero-meta">
              <div className="hero-meta-row">
                <span>Facility day</span>
                <strong>{todayDate ?? 'N/A'}</strong>
              </div>
              <div className="hero-meta-row">
                <span>Quarter window</span>
                <strong>{quarterBounds.start ?? 'N/A'} to {forecast?.quarter_end_date ?? quarterBounds.end ?? 'N/A'}</strong>
              </div>
              <div className="hero-meta-row">
                <span>Timezone</span>
                <strong>{facility?.timezone ?? 'Australia/Sydney'}</strong>
              </div>
              <div className="hero-meta-row">
                <span>RN target</span>
                <strong>{dailyCompliance?.is_rn_target_met ? 'Met today' : 'Below target'}</strong>
              </div>
            </div>
          </aside>
        </section>

        {pageError ? (
          <section className="message-banner error-banner">
            <strong>Dashboard error:</strong> {pageError}
          </section>
        ) : null}

        {notice ? (
          <section className="message-banner success-banner">
            {notice}
          </section>
        ) : null}

        {loadingDashboard ? (
          <section className="message-banner info-banner">Refreshing latest compliance and forecast data...</section>
        ) : null}

        <section className="metrics-grid">
          <article className="metric-card metric-card-featured">
            <p className="card-label">Today&apos;s total care minutes</p>
            <div className="metric-row">
              <h2>{formatNumber(dailyCompliance?.actual_total_minutes)}</h2>
              <span className="metric-secondary">
                / {formatNumber(dailyCompliance?.required_total_minutes)} target
              </span>
            </div>
            <div className="progress-track" aria-hidden="true">
              <div
                className={`progress-fill progress-${dailyCompliance?.status ?? 'red'}`}
                style={{ width: getProgressWidth(dailyCompliance?.compliance_percent) }}
              />
            </div>
            <p className="metric-caption">Compliance {formatPercent(dailyCompliance?.compliance_percent)}</p>
          </article>

          <article className="metric-card metric-card-featured">
            <p className="card-label">Today&apos;s RN minutes</p>
            <div className="metric-row">
              <h2>{formatNumber(dailyCompliance?.actual_rn_minutes)}</h2>
              <span className="metric-secondary">
                / {formatNumber(dailyCompliance?.required_rn_minutes)} target
              </span>
            </div>
            <div className="progress-track" aria-hidden="true">
              <div
                className={`progress-fill progress-${dailyCompliance?.is_rn_target_met ? 'green' : 'red'}`}
                style={{ width: getProgressWidth(dailyCompliance?.rn_compliance_percent) }}
              />
            </div>
            <p className="metric-caption">RN compliance {formatPercent(dailyCompliance?.rn_compliance_percent)}</p>
          </article>

          <article className="metric-card metric-card-compact">
            <p className="card-label">Daily RAG status</p>
            <div className="metric-row">
              <h2>{formatPercent(todayStatusPercent)}</h2>
            </div>
            <div className="progress-track" aria-hidden="true">
              <div
                className={`progress-fill progress-${dailyCompliance?.status ?? 'red'}`}
                style={{ width: getProgressWidth(todayStatusPercent) }}
              />
            </div>
            <div className="status-pill" style={{ color: statusMeta.color, backgroundColor: statusMeta.background }}>
              {statusMeta.label}
            </div>
            <p className="metric-caption">Based on the lower of total and RN compliance. Red below 85%, amber 85% to 99%, green 100% or more.</p>
          </article>

          <article className="metric-card metric-card-compact">
            <p className="card-label">Current quarter compliance</p>
            <div className="metric-row">
              <h2>{formatPercent(forecast?.current_compliance_percent)}</h2>
              <span className="metric-secondary">
                projected {formatPercent(forecast?.projected_compliance_percent)}
              </span>
            </div>
            <p className="metric-caption">{formatNumber(forecast?.actual_minutes_so_far)} actual minutes logged so far</p>
          </article>
        </section>

        <section className="content-grid content-grid-triple">
          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">AI Shift Gap Alert</p>
                <h3>{aiAlert?.title ?? 'No alert generated yet'}</h3>
              </div>
              <span className={alertTag.className}>
                {alertTag.label}
              </span>
            </div>
            <p className="detail-line">{aiAlert?.message ?? 'Generate the current facility alert to review this week’s staffing risk.'}</p>
            <p className="helper-text">{aiAlert?.recommended_action ?? 'The alert will appear here and on the dashboard once generated.'}</p>
            {suggestedStaffNames.length ? (
              <div className="tag-row">
                {suggestedStaffNames.map((name) => (
                  <span key={name} className="tag">{name}</span>
                ))}
              </div>
            ) : null}
          </article>

          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Forecast</p>
                <h3>Recovery scenario</h3>
              </div>
            </div>
            <div className="summary-list">
              <div><span>Projected quarter-end result</span><strong>{formatPercent(forecast?.projected_compliance_percent)}</strong></div>
              <div><span>Dollar value at risk</span><strong>{formatCurrency(forecast?.dollar_value_at_risk)}</strong></div>
              <div><span>Equivalent non-compliant days</span><strong>{formatNumber(forecast?.funding_at_risk?.equivalent_non_compliant_days)}</strong></div>
              <div><span>Minutes per day to recover</span><strong>{formatNumber(forecast?.minutes_needed_per_day_to_recover)}</strong></div>
              <div><span>Scenario outcome</span><strong>{forecast?.scenario?.will_meet_target ? 'Target recovered' : 'Target still missed'}</strong></div>
              <div><span>Scenario projected compliance</span><strong>{formatPercent(forecast?.scenario?.projected_compliance_percent)}</strong></div>
              <div><span>Additional scenario minutes</span><strong>{formatNumber(forecast?.scenario?.additional_minutes_total)}</strong></div>
            </div>
            <p className="helper-text">
              Funding-at-risk estimate: {forecast?.penalty_assumption?.note ?? 'Based on projected non-compliant facility days and the per-resident daily penalty cap.'}
            </p>
          </article>

          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Audit report</p>
                <h3>Quarter-to-date summary</h3>
              </div>
            </div>
            <div className="summary-list">
              <div><span>Compliance result</span><strong>{report?.compliance_result?.toUpperCase() ?? 'N/A'}</strong></div>
              <div><span>Total minutes</span><strong>{formatNumber(report?.summary?.total_actual_minutes)}</strong></div>
              <div><span>Target minutes</span><strong>{formatNumber(report?.summary?.total_required_minutes)}</strong></div>
              <div><span>RN coverage days met</span><strong>{formatNumber(report?.summary?.total_rn_days_met)}</strong></div>
              <div><span>Agency split</span><strong>{formatPercent(report?.agency_permanent_split?.agency_percent)}</strong></div>
              <div><span>Permanent split</span><strong>{formatPercent(report?.agency_permanent_split?.permanent_percent)}</strong></div>
            </div>
          </article>
        </section>

        <section className="content-grid content-grid-triple">
          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Trend</p>
                <h3>14-day compliance</h3>
              </div>
            </div>
            <div className="chart-wrap">
              {historyChartData.length ? (
                <ResponsiveContainer>
                  <LineChart data={historyChartData}>
                    <CartesianGrid strokeDasharray="4 4" stroke={chartGridStroke} />
                    <XAxis dataKey="date" tick={chartAxisStyle} stroke="rgba(255, 255, 255, 0.08)" />
                    <YAxis tick={chartAxisStyle} stroke="rgba(255, 255, 255, 0.08)" />
                    <Tooltip contentStyle={chartTooltipStyle} cursor={{ stroke: 'rgba(229, 9, 20, 0.28)', strokeWidth: 1 }} />
                    <Legend formatter={renderLegendText} />
                    <Line type="monotone" dataKey="compliance" name="Total %" stroke="#e50914" strokeWidth={3} dot={false} />
                    <Line type="monotone" dataKey="rnCompliance" name="RN %" stroke="#f59e0b" strokeWidth={2.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : <p className="empty-copy">No compliance history is available yet.</p>}
            </div>
          </article>

          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Today</p>
                <h3>Minutes by staff type</h3>
              </div>
            </div>
            <div className="chart-wrap">
              {hasTodayBreakdown ? (
                <ResponsiveContainer>
                  <BarChart data={todayBreakdown}>
                    <CartesianGrid strokeDasharray="4 4" stroke={chartGridStroke} />
                    <XAxis dataKey="name" tick={chartAxisStyle} stroke="rgba(255, 255, 255, 0.08)" />
                    <YAxis tick={chartAxisStyle} stroke="rgba(255, 255, 255, 0.08)" />
                    <Tooltip contentStyle={chartTooltipStyle} cursor={{ fill: 'rgba(255, 255, 255, 0.03)' }} />
                    <Bar dataKey="minutes" radius={[12, 12, 0, 0]}>
                      {todayBreakdown.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="empty-copy">No delivered minutes are available for today yet.</p>}
            </div>
            <p className="helper-text">
              Agency coverage is tracked separately: {formatNumber(dailyCompliance?.actual_agency_minutes)} agency minutes and {formatNumber(dailyCompliance?.actual_permanent_minutes)} permanent minutes.
            </p>
          </article>

          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Workforce</p>
                <h3>Staff mix</h3>
              </div>
            </div>
            <div className="chart-wrap">
              {staff.some((member) => member.staff_type) ? (
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={staffMix}
                      dataKey="value"
                      nameKey="name"
                      outerRadius={102}
                      innerRadius={54}
                      paddingAngle={4}
                      labelLine={false}
                    >
                      {staffMix.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={chartTooltipStyle} />
                    <Legend formatter={renderLegendText} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <p className="empty-copy">No staff have been added for this facility yet.</p>}
            </div>
          </article>
        </section>

        <section className="content-grid content-grid-dual">
          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">{editingStaffId ? 'Edit' : 'Create'}</p>
                <h3>{editingStaffId ? 'Update staff' : 'Add staff'}</h3>
              </div>
            </div>
            <p className="panel-intro">Manage the staff roster used for compliance tracking, shift entry, and AI recommendations.</p>

            {staffError ? <div className="inline-message inline-error">{staffError}</div> : null}

            <form className="form-grid" onSubmit={submitStaff}>
              <label className="field">
                <span>Full name</span>
                <input
                  required
                  type="text"
                  value={staffForm.full_name}
                  onChange={(event) => setStaffForm((currentValue) => ({
                    ...currentValue,
                    full_name: event.target.value
                  }))}
                />
              </label>

              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  value={staffForm.email}
                  onChange={(event) => setStaffForm((currentValue) => ({
                    ...currentValue,
                    email: event.target.value
                  }))}
                />
              </label>

              <label className="field">
                <span>Phone</span>
                <input
                  type="text"
                  value={staffForm.phone}
                  onChange={(event) => setStaffForm((currentValue) => ({
                    ...currentValue,
                    phone: event.target.value
                  }))}
                />
              </label>

              <label className="field">
                <span>Staff type</span>
                <select
                  value={staffForm.staff_type}
                  onChange={(event) => setStaffForm((currentValue) => ({
                    ...currentValue,
                    staff_type: event.target.value
                  }))}
                >
                  {Object.entries(staffTypeLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Employment</span>
                <select
                  value={staffForm.employment_type}
                  onChange={(event) => setStaffForm((currentValue) => ({
                    ...currentValue,
                    employment_type: event.target.value
                  }))}
                >
                  {Object.entries(employmentTypeLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>

              <div className="form-actions field-span">
                <button className="primary-button" disabled={savingStaff || isBusy} type="submit">
                  {savingStaff ? 'Saving...' : editingStaffId ? 'Update staff' : 'Add staff'}
                </button>
                {editingStaffId ? (
                  <button className="ghost-button" disabled={savingStaff || isBusy} type="button" onClick={cancelStaffEdit}>
                    Cancel
                  </button>
                ) : null}
              </div>
            </form>
          </article>

          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">{editingShiftId ? 'Edit' : 'Create'}</p>
                <h3>{editingShiftId ? 'Update shift' : 'Add shift'}</h3>
              </div>
            </div>
            <p className="panel-intro">Capture daily staffing coverage without leaving the compliance dashboard.</p>

            {shiftError ? <div className="inline-message inline-error">{shiftError}</div> : null}
            {!hasStaff ? <div className="inline-message inline-info">Add a staff member before recording shifts for this facility.</div> : null}

            <form className="form-grid" onSubmit={submitShift}>
              <label className="field">
                <span>Staff member</span>
                <select
                  disabled={shiftFormDisabled}
                  required
                  value={shiftForm.staff_id}
                  onChange={(event) => setShiftForm((currentValue) => ({
                    ...currentValue,
                    staff_id: event.target.value
                  }))}
                >
                  <option value="">Select staff</option>
                  {staff.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.full_name} ({staffTypeLabels[member.staff_type] ?? String(member.staff_type ?? '').toUpperCase()})
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Shift date</span>
                <input
                  disabled={shiftFormDisabled}
                  required
                  type="date"
                  value={shiftForm.shift_date}
                  onChange={(event) => setShiftForm((currentValue) => ({
                    ...currentValue,
                    shift_date: event.target.value
                  }))}
                />
              </label>

              <label className="field">
                <span>Start time</span>
                <input
                  disabled={shiftFormDisabled}
                  required
                  type="time"
                  value={shiftForm.start_time}
                  onChange={(event) => setShiftForm((currentValue) => ({
                    ...currentValue,
                    start_time: event.target.value
                  }))}
                />
              </label>

              <label className="field">
                <span>End time</span>
                <input
                  disabled={shiftFormDisabled}
                  required
                  type="time"
                  value={shiftForm.end_time}
                  onChange={(event) => setShiftForm((currentValue) => ({
                    ...currentValue,
                    end_time: event.target.value
                  }))}
                />
              </label>

              <label className="field field-span">
                <span>Notes</span>
                <input
                  disabled={shiftFormDisabled}
                  type="text"
                  value={shiftForm.notes}
                  onChange={(event) => setShiftForm((currentValue) => ({
                    ...currentValue,
                    notes: event.target.value
                  }))}
                />
              </label>

              <p className="helper-text field-span">
                Overnight shifts are supported automatically. If the end time is earlier than the start time,
                the shift rolls into the next facility day.
              </p>

              <div className="form-actions field-span">
                <button className="primary-button secondary-button" disabled={savingShift || shiftFormDisabled} type="submit">
                  {savingShift ? 'Saving...' : editingShiftId ? 'Update shift' : 'Add shift'}
                </button>
                {editingShiftId ? (
                  <button className="ghost-button" disabled={savingShift || shiftFormDisabled} type="button" onClick={cancelShiftEdit}>
                    Cancel
                  </button>
                ) : null}
              </div>
            </form>
          </article>
        </section>

        <section className="content-grid content-grid-dual">
          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Roster</p>
                <h3>Staff</h3>
              </div>
            </div>
            <div className="list-stack">
              {staff.length ? staff.map((member) => (
                <div key={member.id} className="list-row">
                  <div className="list-copy">
                    <strong>{member.full_name}</strong>
                    <div className="tag-row">
                      <span className="tag tag-neutral">{staffTypeLabels[member.staff_type] ?? (String(member.staff_type ?? '').toUpperCase() || 'Unknown role')}</span>
                      <span className="tag tag-neutral">{employmentTypeLabels[member.employment_type] ?? 'Unknown employment'}</span>
                    </div>
                    <p>{member.email || member.phone || 'No contact details provided'}</p>
                  </div>
                  <div className="row-actions">
                    <button
                      className="ghost-button"
                      disabled={isBusy}
                      type="button"
                      onClick={() => handleEditStaff(member)}
                    >
                      Edit
                    </button>
                    <button
                      className="ghost-button"
                      disabled={isBusy}
                      type="button"
                      onClick={() => handleDeleteStaff(member.id)}
                    >
                      {deletingId === member.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              )) : <p className="empty-copy">No staff recorded for this facility.</p>}
            </div>
          </article>

          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Roster</p>
                <h3>Recent shifts</h3>
              </div>
            </div>
            <div className="list-stack">
              {shiftsWithNames.length ? shiftsWithNames.slice(0, 12).map((shift) => (
                <div key={shift.id} className="list-row">
                  <div className="list-copy">
                    <strong>{shift.staff_name} • {(shift.staff_type_snapshot ?? 'n/a').toUpperCase()} • {formatNumber(shift.duration_minutes)} min</strong>
                    <p>{formatDateTimeLabel(shift.start_time)} to {formatDateTimeLabel(shift.end_time)}</p>
                    <p>{shift.notes || 'No notes'}</p>
                  </div>
                  <div className="row-actions">
                    <button
                      className="ghost-button"
                      disabled={isBusy}
                      type="button"
                      onClick={() => handleEditShift(shift)}
                    >
                      Edit
                    </button>
                    <button
                      className="ghost-button"
                      disabled={isBusy}
                      type="button"
                      onClick={() => handleDeleteShift(shift.id)}
                    >
                      {deletingId === shift.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              )) : <p className="empty-copy">No shifts recorded yet.</p>}
            </div>
          </article>
        </section>
      </div>
    </main>
  )
}

export default App
