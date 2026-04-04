import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
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
  getWeekBounds,
  roundToTwo
} from '@shared/careCalculations'
import {
  buildPdfFilename,
  clampScenarioValue,
  getDailyStatusPercent,
  getTodayStaffTypeBreakdown,
  hasBreakdownMinutes,
  isDashboardBundleReady
} from './dashboardView'
import { DEFAULT_FACILITY_ID, useFacility } from './facilityContext'
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

const navItems = [
  {
    id: 'dashboard',
    path: '/',
    label: 'Dashboard',
    subtitle: 'Today and quarter performance',
    icon: (
      <path d="M4 13h6V5H4v8Zm0 7h6v-5H4v5Zm10 0h6V11h-6v9Zm0-17v6h6V3h-6Z" />
    )
  },
  {
    id: 'shifts',
    path: '/shifts',
    label: 'Shifts',
    subtitle: 'Coverage logging and imports',
    icon: (
      <path d="M12 7v5l3 3m7-3a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z" />
    )
  },
  {
    id: 'staff',
    path: '/staff',
    label: 'Staff',
    subtitle: 'Roster and workforce mix',
    icon: (
      <path d="M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4ZM6 13a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm10 2c-2.67 0-8 1.34-8 4v1h16v-1c0-2.66-5.33-4-8-4Zm-10 0c-.52 0-1.08.04-1.66.11C2.8 15.38 1 16.28 1 18v2h6v-1c0-1.16.39-2.24 1.06-3.12A10.88 10.88 0 0 0 6 15Z" />
    )
  },
  {
    id: 'forecast',
    path: '/forecast',
    label: 'Forecast',
    subtitle: 'Risk, penalty, recovery',
    icon: (
      <path d="M4 19h16M6 16l4-5 3 3 5-7" />
    )
  },
  {
    id: 'alerts',
    path: '/alerts',
    label: 'Alerts',
    subtitle: 'Operational signal feed',
    icon: (
      <path d="M15 17h5l-1.4-1.4a2 2 0 0 1-.6-1.42V11a6 6 0 1 0-12 0v3.18c0 .53-.21 1.04-.59 1.41L4 17h5m6 0a3 3 0 1 1-6 0m6 0H9" />
    )
  },
  {
    id: 'reports',
    path: '/reports',
    label: 'Reports',
    subtitle: 'Audit generation and preview',
    icon: (
      <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm7 1v5h5" />
    )
  }
]

const metricFormatter = new Intl.NumberFormat('en-AU')
const currencyFormatter = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  maximumFractionDigits: 0
})

const chartGridStroke = '#e2e8f0'
const chartAxisStyle = { fill: '#64748b', fontSize: 12 }
const chartTooltipStyle = {
  backgroundColor: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  boxShadow: '0 18px 45px rgba(15, 23, 42, 0.12)',
  color: '#0f172a'
}
const chartContainerProps = {
  width: '100%',
  height: 320,
  debounce: 160
}
const staffMixColors = ['#3b82f6', '#f59e0b', '#22c55e']
const todayBreakdownColors = {
  RN: '#3b82f6',
  EN: '#94a3b8',
  PCW: '#22c55e',
  Agency: '#f59e0b'
}

const toFiniteNumber = (value, fallback = 0) => {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : fallback
}

const formatNumber = (value) => metricFormatter.format(Number.isFinite(Number(value)) ? Number(value) : 0)
const formatPercent = (value) => `${roundToTwo(value)}%`
const formatCurrency = (value) => currencyFormatter.format(Number.isFinite(Number(value)) ? Number(value) : 0)
const formatDateLabel = (value) => value?.slice(5) ?? value ?? ''
const formatDateTimeLabel = (value) => {
  if (typeof value !== 'string') {
    return 'N/A'
  }

  const [date = '', time = ''] = value.split('T')
  return `${date} ${time.slice(0, 5)}`
}

const getProgressWidth = (value) => `${Math.max(0, Math.min(Number(value) || 0, 100))}%`
const renderLegendText = (value) => <span className="chart-legend-text">{value}</span>

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

const resolveSelectedFacilityId = (facilityList, requestedFacilityId = DEFAULT_FACILITY_ID) => {
  if (!facilityList.length) {
    return requestedFacilityId
  }

  const matchedFacility = requestedFacilityId
    ? facilityList.find((facility) => getFacilityIdValue(facility) === String(requestedFacilityId))
    : null

  const defaultFacility = facilityList.find((facility) => getFacilityIdValue(facility) === DEFAULT_FACILITY_ID)

  return getFacilityIdValue(matchedFacility ?? defaultFacility ?? facilityList[0])
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

const getActivePage = (pathname) => {
  const normalizedPath = pathname !== '/' && pathname.endsWith('/')
    ? pathname.slice(0, -1)
    : pathname

  return navItems.find((item) => item.path === normalizedPath)?.id ?? 'dashboard'
}

const toneByStatus = (status) => {
  if (status === 'green' || status === 'success') {
    return 'success'
  }

  if (status === 'amber' || status === 'warning') {
    return 'warning'
  }

  if (status === 'failed' || status === 'error' || status === 'red') {
    return 'danger'
  }

  return 'info'
}

const getAlertTag = (alert) => {
  if (!alert) {
    return {
      tone: 'neutral',
      label: 'Pending'
    }
  }

  if (alert.status === 'failed' || alert.alert_type === 'warning') {
    return {
      tone: 'warning',
      label: alert.alert_type ?? alert.status ?? 'Warning'
    }
  }

  if (alert.alert_type === 'info' || alert.status === 'sent') {
    return {
      tone: 'success',
      label: alert.status ?? 'Sent'
    }
  }

  return {
    tone: 'neutral',
    label: alert.status ?? 'Ready'
  }
}

const getStaffTone = (staffType) => {
  if (staffType === 'rn') {
    return 'info'
  }

  if (staffType === 'en') {
    return 'warning'
  }

  if (staffType === 'pcw') {
    return 'success'
  }

  return 'neutral'
}

const getEmploymentTone = (employmentType) => {
  if (employmentType === 'agency') {
    return 'warning'
  }

  if (employmentType === 'casual') {
    return 'info'
  }

  return 'neutral'
}

const getQualityRating = (overallPercent) => {
  const value = toFiniteNumber(overallPercent)

  if (value >= 100) {
    return 5
  }

  if (value >= 98) {
    return 4
  }

  if (value >= 95) {
    return 3
  }

  if (value >= 90) {
    return 2
  }

  return 1
}

const getQualityImpactLabel = (rating) => {
  if (rating >= 5) {
    return 'Quality profile stable'
  }

  if (rating >= 4) {
    return 'Low operational drag'
  }

  if (rating >= 3) {
    return 'Watch staffing consistency'
  }

  if (rating >= 2) {
    return 'Heightened quality risk'
  }

  return 'Urgent recovery needed'
}

const getProtectedRevenueEstimate = ({
  currentPercent,
  scenarioPercent,
  valueAtRisk
}) => {
  const currentGap = Math.max(100 - toFiniteNumber(currentPercent), 0)
  const scenarioGap = Math.max(100 - toFiniteNumber(scenarioPercent), 0)

  if (currentGap <= 0) {
    return Math.max(toFiniteNumber(valueAtRisk), 0)
  }

  const recoveryRatio = Math.max(Math.min((currentGap - scenarioGap) / currentGap, 1), 0)
  return toFiniteNumber(valueAtRisk) * recoveryRatio
}

const buildDefaultReportRange = (date) => {
  const quarter = getQuarterBounds(date)

  return {
    start_date: quarter.start ?? '',
    end_date: date ?? ''
  }
}

const parseCsvRow = (line) => {
  const cells = []
  let current = ''
  let isQuoted = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    const nextCharacter = line[index + 1]

    if (character === '"' && isQuoted && nextCharacter === '"') {
      current += '"'
      index += 1
      continue
    }

    if (character === '"') {
      isQuoted = !isQuoted
      continue
    }

    if (character === ',' && !isQuoted) {
      cells.push(current.trim())
      current = ''
      continue
    }

    current += character
  }

  cells.push(current.trim())
  return cells
}

const buildCsv = (rows) => rows
  .map((row) => row.map((cell) => {
    const value = String(cell ?? '')
    return /[,"\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
  }).join(','))
  .join('\n')

const triggerDownload = ({ filename, content, mimeType }) => {
  const blob = new Blob([content], { type: mimeType })
  const url = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => window.URL.revokeObjectURL(url), 0)
}

const Badge = ({ tone = 'neutral', children }) => (
  <span className={`badge badge-${tone}`}>{children}</span>
)

const Icon = ({ children }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)

const SidebarItem = ({ item, active }) => (
  <Link
    className={`sidebar-nav-item ${active ? 'sidebar-nav-item-active' : ''}`}
    to={item.path}
  >
    <span className="sidebar-nav-icon">
      <Icon>{item.icon}</Icon>
    </span>
    <span className="sidebar-nav-copy">
      <strong>{item.label}</strong>
      <span>{item.subtitle}</span>
    </span>
  </Link>
)

const StatCard = ({ label, value, hint, tone = 'neutral', meta }) => (
  <article className={`stat-card stat-card-${tone}`}>
    <span className="stat-label">{label}</span>
    <strong className="stat-value">{value}</strong>
    <div className="stat-footer">
      <span>{hint}</span>
      {meta ? <span>{meta}</span> : null}
    </div>
  </article>
)

const SectionCard = ({ eyebrow, title, subtitle, actions, className = '', children }) => (
  <section className={`surface-card ${className}`}>
    <div className="section-head">
      <div>
        {eyebrow ? <p className="section-eyebrow">{eyebrow}</p> : null}
        <h2 className="section-title">{title}</h2>
        {subtitle ? <p className="section-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="section-actions">{actions}</div> : null}
    </div>
    {children}
  </section>
)

const ProgressMetric = ({ label, value, target, percent, tone = 'green' }) => (
  <div className="progress-metric">
    <div className="progress-metric-row">
      <span>{label}</span>
      <strong>{formatNumber(value)} / {formatNumber(target)}</strong>
    </div>
    <div className="progress-track">
      <div className={`progress-fill progress-fill-${tone}`} style={{ width: getProgressWidth(percent) }} />
    </div>
    <p>{formatPercent(percent)} delivered</p>
  </div>
)

const EmptyState = ({ title, description, action }) => (
  <div className="empty-state">
    <div className="empty-state-icon">
      <Icon>
        <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />
      </Icon>
    </div>
    <h3>{title}</h3>
    <p>{description}</p>
    {action ? <div className="empty-state-action">{action}</div> : null}
  </div>
)

const LoadingState = ({ title, description, compact = false }) => (
  <div className={`loading-state ${compact ? 'loading-state-compact' : ''}`} role="status" aria-live="polite">
    <div className="loading-state-icon" aria-hidden="true" />
    <div className="loading-state-copy">
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
    <div className="loading-state-skeleton" aria-hidden="true">
      <span className="loading-line loading-line-strong" />
      <span className="loading-line" />
      <span className="loading-line loading-line-short" />
    </div>
  </div>
)

function App() {
  const { facilityId: selectedFacilityId, setFacilityId: setSelectedFacilityId } = useFacility()
  const location = useLocation()
  const navigate = useNavigate()
  const activePage = getActivePage(location.pathname)
  const [facilities, setFacilities] = useState([])
  const [dashboard, setDashboard] = useState(null)
  const [forecast, setForecast] = useState(null)
  const [report, setReport] = useState(null)

  const [loadingFacilities, setLoadingFacilities] = useState(true)
  const [loadingDashboard, setLoadingDashboard] = useState(false)
  const [dashboardStatus, setDashboardStatus] = useState('idle')
  const [savingStaff, setSavingStaff] = useState(false)
  const [savingShift, setSavingShift] = useState(false)
  const [runningAlert, setRunningAlert] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [deletingId, setDeletingId] = useState('')
  const [importingShifts, setImportingShifts] = useState(false)
  const [generatingReport, setGeneratingReport] = useState(false)

  const [pageError, setPageError] = useState('')
  const [staffError, setStaffError] = useState('')
  const [shiftError, setShiftError] = useState('')
  const [reportError, setReportError] = useState('')
  const [notice, setNotice] = useState('')

  const [scenarioShiftMinutes, setScenarioShiftMinutes] = useState(480)
  const [scenarioShiftsPerWeek, setScenarioShiftsPerWeek] = useState(2)
  const [staffForm, setStaffForm] = useState(buildEmptyStaffForm)
  const [shiftForm, setShiftForm] = useState(buildEmptyShiftForm)
  const [editingStaffId, setEditingStaffId] = useState('')
  const [editingShiftId, setEditingShiftId] = useState('')
  const [generatedReport, setGeneratedReport] = useState(null)
  const [reportRange, setReportRange] = useState({
    start_date: '',
    end_date: ''
  })
  const [staffFilters, setStaffFilters] = useState({
    query: '',
    role: 'all',
    employment: 'all'
  })
  const [shiftFilters, setShiftFilters] = useState({
    query: '',
    role: 'all',
    date: ''
  })

  const shiftImportRef = useRef(null)
  const dashboardRequestIdRef = useRef(0)
  const deferredStaffQuery = useDeferredValue(staffFilters.query)
  const deferredShiftQuery = useDeferredValue(shiftFilters.query)

  const clearMessages = () => {
    setPageError('')
    setStaffError('')
    setShiftError('')
    setReportError('')
    setNotice('')
  }

  const loadDashboard = useCallback(async (facilityIdOverride = selectedFacilityId) => {
    const currentFacilityId = facilityIdOverride || selectedFacilityId

    if (!currentFacilityId) {
      return
    }

    const requestId = dashboardRequestIdRef.current + 1
    dashboardRequestIdRef.current = requestId

    setLoadingDashboard(true)
    setDashboardStatus('loading')
    setPageError('')

    try {
      const { summary, scenarioForecast, reportData } = await fetchDashboardBundle({
        facilityId: currentFacilityId,
        scenarioShiftMinutes,
        scenarioShiftsPerWeek
      })

      if (requestId !== dashboardRequestIdRef.current) {
        return
      }

      setDashboard(summary)
      setForecast(scenarioForecast)
      setReport(reportData)
      setShiftForm((currentValue) => ({
        ...currentValue,
        shift_date: currentValue.shift_date || summary.date
      }))
      setDashboardStatus('ready')
    } catch (error) {
      if (requestId !== dashboardRequestIdRef.current) {
        return
      }

      setDashboardStatus('error')
      setPageError(getApiErrorMessage(error))
    } finally {
      if (requestId === dashboardRequestIdRef.current) {
        setLoadingDashboard(false)
      }
    }
  }, [scenarioShiftMinutes, scenarioShiftsPerWeek, selectedFacilityId])

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
          setSelectedFacilityId(DEFAULT_FACILITY_ID)
          setDashboard(null)
          setForecast(null)
          setReport(null)
          setDashboardStatus('idle')
          return
        }

        const initialFacilityId = resolveSelectedFacilityId(facilityList)
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
  }, [setSelectedFacilityId])

  useEffect(() => {
    if (!selectedFacilityId) {
      setLoadingDashboard(false)
      return
    }

    setDashboardStatus('idle')
    setEditingStaffId('')
    setEditingShiftId('')
    setStaffError('')
    setShiftError('')
    setReportError('')
    setStaffForm(buildEmptyStaffForm())
    setShiftForm(buildEmptyShiftForm())
    setGeneratedReport(null)
  }, [selectedFacilityId])

  useEffect(() => {
    const nextFacilityId = resolveSelectedFacilityId(facilities, selectedFacilityId)

    if (nextFacilityId !== selectedFacilityId) {
      setSelectedFacilityId(nextFacilityId)
    }
  }, [facilities, selectedFacilityId, setSelectedFacilityId])

  useEffect(() => {
    if (!selectedFacilityId) {
      return
    }

    void loadDashboard(selectedFacilityId)
  }, [loadDashboard, selectedFacilityId])

  const selectedFacility = useMemo(
    () => facilities.find((facilityOption) => getFacilityIdValue(facilityOption) === selectedFacilityId) ?? null,
    [facilities, selectedFacilityId]
  )
  const hasCurrentDashboardData = isDashboardBundleReady({
    selectedFacilityId,
    dashboardStatus,
    dashboard,
    forecast,
    report
  })
  const {
    facility,
    dailyCompliance,
    staff,
    shifts,
    aiAlert,
    todayDate,
    quarterBounds,
    weekBounds,
    statusMeta,
    alertTag,
    todayStatusPercent,
    todayBreakdown,
    hasTodayBreakdown,
    hasStaff,
    historyChartData,
    staffMix,
    suggestedStaffNames,
    shiftsWithNames,
    totalMinutesShortfallToday,
    rnMinutesShortfallToday,
    totalMinutesNeededTomorrow,
    rnMinutesNeededTomorrow,
    topBannerTone,
    topBannerTitle,
    topBannerMessage,
    weeklyShifts,
    weeklyMinutes,
    weeklyTargetMinutes,
    weeklyProgressPercent,
    qualityRating,
    qualityImpactLabel,
    penaltyAccrued,
    protectedRevenue,
    projectedCoverageDelta,
    quarterCompletionPercent,
    availableRnStaff,
    coverageSuggestions,
    staffCounts,
    staffById,
    staffByNormalizedName
  } = useMemo(() => {
    const facilityValue = hasCurrentDashboardData
      ? dashboard?.facility
      : selectedFacility ?? dashboard?.facility
    const dailyComplianceValue = hasCurrentDashboardData ? dashboard?.daily_compliance : null
    const historyValue = hasCurrentDashboardData ? dashboard?.history ?? [] : []
    const staffValue = hasCurrentDashboardData ? dashboard?.staff ?? [] : []
    const shiftsValue = hasCurrentDashboardData ? dashboard?.shifts ?? [] : []
    const aiAlertValue = hasCurrentDashboardData ? dashboard?.ai_alert : null
    const todayDateValue = hasCurrentDashboardData ? dashboard?.date : null
    const quarterBoundsValue = todayDateValue ? getQuarterBounds(todayDateValue) : { start: null, end: null }
    const weekBoundsValue = todayDateValue ? getWeekBounds(todayDateValue) : { start: null, end: null }
    const statusMetaValue = getStatusMeta(dailyComplianceValue?.status)
    const alertTagValue = getAlertTag(aiAlertValue)
    const todayStatusPercentValue = getDailyStatusPercent(dailyComplianceValue)
    const todayBreakdownValue = getTodayStaffTypeBreakdown(dailyComplianceValue).map((row) => ({
      ...row,
      color: todayBreakdownColors[row.name] ?? '#f59e0b'
    }))
    const staffByIdValue = new Map(staffValue.map((member) => [member.id, member]))
    const staffByNormalizedNameValue = new Map(
      staffValue.map((member) => [member.full_name.trim().toLowerCase(), member])
    )
    const historyChartDataValue = historyValue.map((row) => ({
      date: formatDateLabel(row.compliance_date),
      compliance: row.compliance_percent ?? 0,
      rnCompliance: row.rn_compliance_percent ?? 0,
      penalty: row.penalty_amount ?? 0
    }))
    const staffMixValue = Object.keys(staffTypeLabels).map((staffType, index) => ({
      name: staffTypeLabels[staffType],
      value: staffValue.filter((member) => member.staff_type === staffType).length,
      color: staffMixColors[index]
    }))
    const suggestedStaffNamesValue = (aiAlertValue?.suggested_staff_ids ?? [])
      .map((staffId) => staffByIdValue.get(staffId)?.full_name)
      .filter(Boolean)
    const shiftsWithNamesValue = shiftsValue.map((shift) => ({
      ...shift,
      staff_name: staffByIdValue.get(shift.staff_id)?.full_name ?? 'Unknown staff'
    }))
    const totalMinutesShortfallTodayValue = Math.max(
      toFiniteNumber(dailyComplianceValue?.required_total_minutes) - toFiniteNumber(dailyComplianceValue?.actual_total_minutes),
      0
    )
    const rnMinutesShortfallTodayValue = Math.max(
      toFiniteNumber(dailyComplianceValue?.required_rn_minutes) - toFiniteNumber(dailyComplianceValue?.actual_rn_minutes),
      0
    )
    const totalMinutesNeededTomorrowValue = Math.max(
      totalMinutesShortfallTodayValue,
      toFiniteNumber(forecast?.minutes_needed_per_day_to_recover)
    )
    const rnMinutesNeededTomorrowValue = Math.max(
      rnMinutesShortfallTodayValue,
      toFiniteNumber(forecast?.rn_minutes_needed_per_day_to_recover)
    )
    const isCompliantTodayValue = hasCurrentDashboardData && dailyComplianceValue?.status === 'green'
    const weeklyShiftsValue = shiftsValue.filter((shift) =>
      weekBoundsValue.start && weekBoundsValue.end
        ? shift.shift_date >= weekBoundsValue.start && shift.shift_date <= weekBoundsValue.end
        : false
    )
    const weeklyMinutesValue = weeklyShiftsValue.reduce(
      (total, shift) => total + toFiniteNumber(shift.duration_minutes),
      0
    )
    const weeklyTargetMinutesValue =
      toFiniteNumber(facilityValue?.resident_count) * toFiniteNumber(facilityValue?.care_minutes_target) * 7
    const weeklyProgressPercentValue = weeklyTargetMinutesValue > 0
      ? (weeklyMinutesValue / weeklyTargetMinutesValue) * 100
      : 0
    const qualityRatingValue = getQualityRating(report?.summary?.overall_compliance_percent)
    const projectedCoverageDeltaValue =
      toFiniteNumber(forecast?.scenario?.overall_projected_compliance_percent)
      - toFiniteNumber(forecast?.overall_projected_compliance_percent)
    const protectedRevenueValue = getProtectedRevenueEstimate({
      currentPercent: forecast?.overall_projected_compliance_percent,
      scenarioPercent: forecast?.scenario?.overall_projected_compliance_percent,
      valueAtRisk: forecast?.dollar_value_at_risk
    })
    const staffCountsValue = staffValue.reduce((counts, member) => {
      counts.total += 1
      if (member.staff_type === 'rn') {
        counts.rn += 1
      }
      if (member.staff_type === 'en') {
        counts.en += 1
      }
      if (member.staff_type === 'pcw') {
        counts.pcw += 1
      }
      if (member.employment_type === 'agency') {
        counts.agency += 1
      }
      return counts
    }, {
      total: 0,
      rn: 0,
      en: 0,
      pcw: 0,
      agency: 0
    })

    return {
      facility: facilityValue,
      dailyCompliance: dailyComplianceValue,
      staff: staffValue,
      shifts: shiftsValue,
      aiAlert: aiAlertValue,
      todayDate: todayDateValue,
      quarterBounds: quarterBoundsValue,
      weekBounds: weekBoundsValue,
      statusMeta: statusMetaValue,
      alertTag: alertTagValue,
      todayStatusPercent: todayStatusPercentValue,
      todayBreakdown: todayBreakdownValue,
      hasTodayBreakdown: hasBreakdownMinutes(todayBreakdownValue),
      hasStaff: staffValue.length > 0,
      historyChartData: historyChartDataValue,
      staffMix: staffMixValue,
      suggestedStaffNames: suggestedStaffNamesValue,
      shiftsWithNames: shiftsWithNamesValue,
      totalMinutesShortfallToday: totalMinutesShortfallTodayValue,
      rnMinutesShortfallToday: rnMinutesShortfallTodayValue,
      totalMinutesNeededTomorrow: totalMinutesNeededTomorrowValue,
      rnMinutesNeededTomorrow: rnMinutesNeededTomorrowValue,
      topBannerTone: isCompliantTodayValue && rnMinutesNeededTomorrowValue <= 0 ? 'success' : 'warning',
      topBannerTitle: hasCurrentDashboardData
        ? isCompliantTodayValue && rnMinutesNeededTomorrowValue <= 0
          ? 'Operations are on track today'
          : `Recover ${formatNumber(rnMinutesNeededTomorrowValue)} RN minutes tomorrow`
        : '',
      topBannerMessage: hasCurrentDashboardData
        ? isCompliantTodayValue && rnMinutesNeededTomorrowValue <= 0
          ? `Overall daily compliance is ${formatPercent(todayStatusPercentValue)} for ${todayDateValue}, and RN coverage is on target.`
          : `Current status is ${statusMetaValue.label}. Recover ${formatNumber(totalMinutesNeededTomorrowValue)} total minutes per day and ${formatNumber(rnMinutesNeededTomorrowValue)} RN minutes per day to stay on track.`
        : '',
      weeklyShifts: weeklyShiftsValue,
      weeklyMinutes: weeklyMinutesValue,
      weeklyTargetMinutes: weeklyTargetMinutesValue,
      weeklyProgressPercent: weeklyProgressPercentValue,
      qualityRating: qualityRatingValue,
      qualityImpactLabel: getQualityImpactLabel(qualityRatingValue),
      penaltyAccrued: historyValue.reduce((total, row) => total + toFiniteNumber(row.penalty_amount), 0),
      protectedRevenue: protectedRevenueValue,
      projectedCoverageDelta: projectedCoverageDeltaValue,
      quarterCompletionPercent: toFiniteNumber(forecast?.total_days_in_quarter) > 0
        ? (toFiniteNumber(forecast?.days_elapsed) / toFiniteNumber(forecast?.total_days_in_quarter)) * 100
        : 0,
      availableRnStaff: staffValue.filter((member) => member.staff_type === 'rn').slice(0, 3),
      coverageSuggestions: staffValue.slice(0, 4),
      staffCounts: staffCountsValue,
      staffById: staffByIdValue,
      staffByNormalizedName: staffByNormalizedNameValue
    }
  }, [dashboard, forecast, hasCurrentDashboardData, report, selectedFacility])
  const isBusy = loadingDashboard || savingStaff || savingShift || runningAlert || downloadingPdf || !!deletingId || importingShifts || generatingReport
  const shiftFormDisabled = isBusy || !hasStaff
  const dashboardUnavailableTitle = loadingDashboard
    ? 'Loading current facility data'
    : 'Current facility data unavailable'
  const dashboardUnavailableMessage = loadingDashboard
    ? 'Fetching dashboard, forecast, report, staff, and shift data for the selected facility.'
    : pageError || 'Refresh the dashboard to retry the selected facility.'

  useEffect(() => {
    if (!todayDate) {
      return
    }

    setReportRange(buildDefaultReportRange(todayDate))
    setShiftFilters((currentValue) => ({
      ...currentValue,
      date: currentValue.date || todayDate
    }))
  }, [todayDate, selectedFacilityId])

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

  const handleDownloadPdf = async (
    startDate = forecast?.quarter_start_date,
    endDate = dashboard?.date
  ) => {
    if (!selectedFacilityId || !startDate || !endDate) {
      return
    }

    setDownloadingPdf(true)
    setNotice('')
    setPageError('')

    try {
      const response = await fetch(buildApiUrl('/reports/audit.pdf', {
        facility_id: selectedFacilityId,
        start_date: startDate,
        end_date: endDate
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
      anchor.download = buildPdfFilename(facility?.name, startDate, endDate)
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
    navigate('/staff')
    setEditingStaffId(member.id)
    setStaffForm(buildStaffFormFromMember(member))
  }

  const handleEditShift = (shift) => {
    clearMessages()
    navigate('/shifts')
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

  const handleGenerateReport = async (event) => {
    event.preventDefault()

    if (!selectedFacilityId || !reportRange.start_date || !reportRange.end_date) {
      setReportError('Start and end dates are required.')
      return
    }

    setGeneratingReport(true)
    setReportError('')
    setNotice('')
    setPageError('')

    try {
      const generated = await unwrap(api.get('/reports', {
        params: {
          facility_id: selectedFacilityId,
          start_date: reportRange.start_date,
          end_date: reportRange.end_date
        }
      }))

      setGeneratedReport(generated)
      setNotice('Audit report generated successfully.')
    } catch (error) {
      setReportError(getApiErrorMessage(error))
    } finally {
      setGeneratingReport(false)
    }
  }

  const handleExportShifts = () => {
    if (!shiftsWithNames.length) {
      setPageError('No shifts are available to export.')
      return
    }

    const csv = buildCsv([
      ['staff_name', 'staff_id', 'staff_type', 'shift_date', 'start_time', 'end_time', 'duration_minutes', 'notes'],
      ...shiftsWithNames.map((shift) => [
        shift.staff_name,
        shift.staff_id,
        shift.staff_type_snapshot ?? '',
        shift.shift_date,
        shift.start_time,
        shift.end_time,
        shift.duration_minutes,
        shift.notes ?? ''
      ])
    ])

    triggerDownload({
      filename: `${(facility?.name ?? 'facility').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-shifts.csv`,
      content: csv,
      mimeType: 'text/csv;charset=utf-8'
    })
    setNotice('Shift export started.')
  }

  const handleShiftImport = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file || !selectedFacilityId) {
      return
    }

    setImportingShifts(true)
    setShiftError('')
    setPageError('')
    setNotice('')

    try {
      const raw = await file.text()
      const rows = raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)

      if (rows.length < 2) {
        throw new Error('CSV must include a header row and at least one shift row.')
      }

      const headers = parseCsvRow(rows[0]).map((header) => header.trim().toLowerCase())
      const requiredFields = ['shift_date', 'start_time', 'end_time']

      if (!requiredFields.every((field) => headers.includes(field))) {
        throw new Error('CSV requires shift_date, start_time, and end_time columns.')
      }

      let importedCount = 0

      for (let index = 1; index < rows.length; index += 1) {
        const values = parseCsvRow(rows[index])
        const row = Object.fromEntries(headers.map((header, headerIndex) => [header, values[headerIndex] ?? '']))
        const matchingStaff = row.staff_id
          ? staffById.get(row.staff_id)
          : staffByNormalizedName.get(String(row.staff_name ?? '').trim().toLowerCase())

        if (!matchingStaff) {
          throw new Error(`Unable to match staff on CSV row ${index + 1}. Include staff_id or an exact staff_name.`)
        }

        await unwrap(api.post('/shifts', {
          facility_id: selectedFacilityId,
          staff_id: matchingStaff.id,
          shift_date: row.shift_date,
          start_time: row.start_time,
          end_time: row.end_time,
          notes: row.notes ?? ''
        }))
        importedCount += 1
      }

      setNotice(`Imported ${importedCount} shifts successfully.`)
      await loadDashboard(selectedFacilityId)
    } catch (error) {
      setShiftError(error instanceof Error ? error.message : 'Unable to import shifts.')
    } finally {
      setImportingShifts(false)
    }
  }

  const filteredStaff = useMemo(() => {
    const query = deferredStaffQuery.trim().toLowerCase()
    return staff.filter((member) => {
      const matchesQuery = !query
        || member.full_name.toLowerCase().includes(query)
        || String(member.email ?? '').toLowerCase().includes(query)
        || String(member.phone ?? '').toLowerCase().includes(query)
      const matchesRole = staffFilters.role === 'all' || member.staff_type === staffFilters.role
      const matchesEmployment = staffFilters.employment === 'all' || member.employment_type === staffFilters.employment

      return matchesQuery && matchesRole && matchesEmployment
    })
  }, [deferredStaffQuery, staff, staffFilters.employment, staffFilters.role])

  const filteredShifts = useMemo(() => {
    const query = deferredShiftQuery.trim().toLowerCase()

    return shiftsWithNames.filter((shift) => {
      const matchesQuery = !query
        || shift.staff_name.toLowerCase().includes(query)
        || String(shift.notes ?? '').toLowerCase().includes(query)
      const matchesRole = shiftFilters.role === 'all' || shift.staff_type_snapshot === shiftFilters.role
      const matchesDate = !shiftFilters.date || shift.shift_date === shiftFilters.date

      return matchesQuery && matchesRole && matchesDate
    })
  }, [deferredShiftQuery, shiftFilters.date, shiftFilters.role, shiftsWithNames])

  const hasStaffFiltersApplied = Boolean(staffFilters.query.trim())
    || staffFilters.role !== 'all'
    || staffFilters.employment !== 'all'
  const hasShiftFiltersApplied = Boolean(shiftFilters.query.trim())
    || shiftFilters.role !== 'all'
    || Boolean(shiftFilters.date)
  const alertFeed = useMemo(() => [
    aiAlert
      ? {
          id: 'ai-primary',
          tone: alertTag.tone,
          title: aiAlert.title ?? 'AI alert ready',
          status: alertTag.label,
          date: aiAlert.alert_date ?? todayDate,
          channel: aiAlert.delivery_channel ?? 'in_app',
          message: aiAlert.message,
          gaps: [
            `${formatNumber(totalMinutesNeededTomorrow)} total recovery minutes/day`,
            `${formatNumber(rnMinutesNeededTomorrow)} RN recovery minutes/day`
          ],
          recommendation: aiAlert.recommended_action,
          contacts: suggestedStaffNames.map((name) => ({
            name,
            detail: 'Suggested contact'
          }))
        }
      : null,
    {
      id: 'rn-gap',
      tone: rnMinutesNeededTomorrow > 0 ? 'danger' : 'success',
      title: rnMinutesNeededTomorrow > 0 ? 'RN coverage recovery needed' : 'RN coverage holding steady',
      status: rnMinutesNeededTomorrow > 0 ? 'Action needed' : 'On track',
      date: todayDate,
      channel: 'email',
      message: rnMinutesNeededTomorrow > 0
        ? `Schedule additional RN-qualified coverage to recover ${formatNumber(rnMinutesNeededTomorrow)} minutes on the next operating day.`
        : 'Current RN staffing mix is sufficient for the current daily target.',
      gaps: [
        `${formatPercent(dailyCompliance?.rn_compliance_percent)} RN compliance today`,
        `${formatNumber(forecast?.rn_minutes_needed_per_day_to_recover)} RN minutes/day to recover quarter`
      ],
      recommendation: rnMinutesNeededTomorrow > 0
        ? 'Contact RN staff first, then review EN support for total care recovery.'
        : 'Maintain current roster and continue monitoring tomorrow’s coverage.',
      contacts: availableRnStaff.map((member) => ({
        name: member.full_name,
        detail: member.email || member.phone || 'No contact details'
      }))
    },
    {
      id: 'revenue-risk',
      tone: toFiniteNumber(forecast?.dollar_value_at_risk) > 0 ? 'warning' : 'success',
      title: toFiniteNumber(forecast?.dollar_value_at_risk) > 0 ? 'Protected revenue under pressure' : 'Protected revenue stable',
      status: toFiniteNumber(forecast?.dollar_value_at_risk) > 0 ? 'Watch risk' : 'Stable',
      date: forecast?.quarter_end_date,
      channel: 'in_app',
      message: toFiniteNumber(forecast?.dollar_value_at_risk) > 0
        ? `Projected AN-ACC funding at risk is ${formatCurrency(forecast?.dollar_value_at_risk)} if the current pace holds.`
        : 'The current quarter trajectory is not showing any projected funding risk.',
      gaps: [
        `${formatNumber(forecast?.funding_at_risk?.equivalent_non_compliant_days)} equivalent non-compliant days`,
        `${formatPercent(forecast?.overall_projected_compliance_percent)} projected quarter compliance`
      ],
      recommendation: projectedCoverageDelta > 0
        ? `Current scenario could protect about ${formatCurrency(protectedRevenue)} if the extra minutes land as planned.`
        : 'Increase recovery minutes or roster mix to protect quarter revenue.',
      contacts: coverageSuggestions.map((member) => ({
        name: member.full_name,
        detail: `${staffTypeLabels[member.staff_type] ?? 'Staff'} • ${employmentTypeLabels[member.employment_type] ?? 'Employment'}`
      }))
    }
  ].filter(Boolean), [
    aiAlert,
    alertTag.label,
    alertTag.tone,
    availableRnStaff,
    coverageSuggestions,
    dailyCompliance?.rn_compliance_percent,
    forecast,
    projectedCoverageDelta,
    protectedRevenue,
    rnMinutesNeededTomorrow,
    suggestedStaffNames,
    todayDate,
    totalMinutesNeededTomorrow
  ])
  const pageMeta = useMemo(() => ({
    dashboard: {
      title: 'Compliance dashboard',
      subtitle: 'Real-time facility operations, staffing pressure, and quarter outlook.'
    },
    shifts: {
      title: 'Shift operations',
      subtitle: 'Capture coverage quickly, monitor weekly progress, and keep the log clean.'
    },
    staff: {
      title: 'Staff roster',
      subtitle: 'Manage active staff, workforce mix, and contact details used across the platform.'
    },
    forecast: {
      title: 'Quarter forecast',
      subtitle: 'Surface penalty exposure early and turn scenario planning into a clear recovery plan.'
    },
    alerts: {
      title: 'Alerts center',
      subtitle: `Daily operational signal feed for ${facility?.timezone || 'Australia/Sydney'}.`
    },
    reports: {
      title: 'Reports',
      subtitle: 'Generate audit-ready compliance summaries and download a polished PDF packet.'
    }
  }), [facility?.timezone])

  const renderSharedPageHeader = () => (
    <header className="page-header">
      <div>
        <h1>{pageMeta[activePage].title}</h1>
        <p>{pageMeta[activePage].subtitle}</p>
      </div>
      <div className="page-header-meta">
        <Badge tone="neutral">{todayDate ?? 'No date loaded'}</Badge>
        <Badge tone={toneByStatus(dailyCompliance?.status)}>{statusMeta.label}</Badge>
        <Badge tone="info">{facility?.name ?? 'Facility'}</Badge>
      </div>
    </header>
  )

  const renderDashboardPage = () => (
    <div className="page-stack">
      <section className={`hero-banner hero-banner-${topBannerTone}`}>
        <div>
          <p className="section-eyebrow">Today&apos;s action signal</p>
          <h2>{topBannerTitle}</h2>
          <p>{topBannerMessage}</p>
        </div>
        <div className="hero-banner-grid">
          <div className="hero-banner-stat">
            <span>Facility day</span>
            <strong>{todayDate ?? 'Unavailable'}</strong>
            <p>{weekBounds.start ?? 'N/A'} to {weekBounds.end ?? 'N/A'}</p>
          </div>
          <div className="hero-banner-stat">
            <span>Funding at risk</span>
            <strong>{formatCurrency(forecast?.dollar_value_at_risk)}</strong>
            <p>{formatNumber(forecast?.funding_at_risk?.equivalent_non_compliant_days)} equivalent days</p>
          </div>
          <div className="hero-banner-stat">
            <span>Recovery scenario</span>
            <strong>+{formatNumber(scenarioShiftMinutes * scenarioShiftsPerWeek)} min/week</strong>
            <p>{formatPercent(forecast?.scenario?.overall_projected_compliance_percent)} projected with scenario</p>
          </div>
        </div>
      </section>

      <section className="stats-grid stats-grid-4">
        <StatCard
          label="Residents"
          value={formatNumber(facility?.resident_count)}
          hint="Active census"
          meta={`${formatNumber(staff.length)} staff`}
        />
        <StatCard
          label="Shifts logged"
          value={formatNumber(shifts.length)}
          hint="Current facility bundle"
          meta={`${formatNumber(weeklyShifts.length)} this week`}
          tone="info"
        />
        <StatCard
          label="Compliance"
          value={formatPercent(todayStatusPercent)}
          hint={statusMeta.label}
          meta={`${formatPercent(forecast?.overall_projected_compliance_percent)} projected`}
          tone={toneByStatus(dailyCompliance?.status)}
        />
        <StatCard
          label="Penalty / risk"
          value={formatCurrency(forecast?.dollar_value_at_risk)}
          hint={`${formatNumber(forecast?.minutes_needed_per_day_to_recover)} min/day recovery`}
          meta={`${formatNumber(forecast?.days_remaining)} days remaining`}
          tone={toFiniteNumber(forecast?.dollar_value_at_risk) > 0 ? 'warning' : 'success'}
        />
      </section>

      <section className="layout-grid layout-grid-dashboard">
        <SectionCard
          eyebrow="Today"
          title="Compliance progress"
          subtitle="Total care minutes and RN minutes against today’s target."
          className="span-4"
          actions={<Badge tone={toneByStatus(dailyCompliance?.status)}>{statusMeta.label}</Badge>}
        >
          <div className="card-stack">
            <ProgressMetric
              label="Total care minutes"
              value={dailyCompliance?.actual_total_minutes}
              target={dailyCompliance?.required_total_minutes}
              percent={dailyCompliance?.compliance_percent}
              tone="green"
            />
            <ProgressMetric
              label="RN minutes"
              value={dailyCompliance?.actual_rn_minutes}
              target={dailyCompliance?.required_rn_minutes}
              percent={dailyCompliance?.rn_compliance_percent}
              tone="blue"
            />
            <div className="key-value-grid">
              <div>
                <span>Minutes shortfall today</span>
                <strong>{formatNumber(totalMinutesShortfallToday)}</strong>
              </div>
              <div>
                <span>RN shortfall today</span>
                <strong>{formatNumber(rnMinutesShortfallToday)}</strong>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          eyebrow="Funding"
          title="AN-ACC / subsidy outlook"
          subtitle="A clean snapshot of daily targets, exposure, and revenue protection."
          className="span-4"
        >
          <div className="metric-pair-list">
            <div>
              <span>AN-ACC target</span>
              <strong>{formatNumber(facility?.care_minutes_target)} min / resident</strong>
            </div>
            <div>
              <span>RN target</span>
              <strong>{formatNumber(facility?.rn_minutes_target)} min / resident</strong>
            </div>
            <div>
              <span>Subsidy exposure</span>
              <strong>{formatCurrency(forecast?.dollar_value_at_risk)}</strong>
            </div>
            <div>
              <span>Protected revenue</span>
              <strong>{formatCurrency(protectedRevenue)}</strong>
            </div>
          </div>
          <p className="card-helper">
            Current scenario protects an estimated {formatCurrency(protectedRevenue)} if projected compliance lifts by {formatPercent(projectedCoverageDelta)}.
          </p>
        </SectionCard>

        <SectionCard
          eyebrow="Quality"
          title="Star rating / quality impact"
          subtitle="Derived from quarter-to-date overall compliance performance."
          className="span-4"
        >
          <div className="rating-card">
            <div className="rating-stars">{Array.from({ length: 5 }, (_, index) => (
              <span key={index} className={index < qualityRating ? 'rating-star-active' : ''}>★</span>
            ))}</div>
            <strong>{qualityRating}.0 / 5 internal score</strong>
            <p>{qualityImpactLabel}</p>
            <div className="rating-meta">
              <Badge tone="info">{formatPercent(report?.summary?.overall_compliance_percent)} quarter-to-date</Badge>
              <Badge tone={toFiniteNumber(forecast?.dollar_value_at_risk) > 0 ? 'warning' : 'success'}>
                {toFiniteNumber(forecast?.dollar_value_at_risk) > 0 ? 'Risk present' : 'No projected risk'}
              </Badge>
            </div>
          </div>
        </SectionCard>
      </section>

      <section className="layout-grid layout-grid-dashboard">
        <SectionCard
          eyebrow="Trend"
          title="14-day compliance chart"
          subtitle="Daily total and RN trajectory with enough room to read the trend clearly."
          className="span-8"
        >
          <div className="chart-area">
            {loadingDashboard && !historyChartData.length ? (
              <LoadingState
                compact
                title="Loading compliance trend"
                description="Preparing the latest daily compliance history for this facility."
              />
            ) : historyChartData.length ? (
              <ResponsiveContainer {...chartContainerProps}>
                <LineChart data={historyChartData}>
                  <CartesianGrid strokeDasharray="4 4" stroke={chartGridStroke} />
                  <XAxis dataKey="date" tick={chartAxisStyle} stroke="#cbd5e1" />
                  <YAxis tick={chartAxisStyle} stroke="#cbd5e1" />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Legend formatter={renderLegendText} />
                  <Line isAnimationActive={false} type="monotone" dataKey="compliance" name="Total %" stroke="#22c55e" strokeWidth={3} dot={false} />
                  <Line isAnimationActive={false} type="monotone" dataKey="rnCompliance" name="RN %" stroke="#3b82f6" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : <EmptyState title="No compliance history yet" description="Add more shifts to build out the 14-day trend view." />}
          </div>
        </SectionCard>

        <SectionCard
          eyebrow="Coverage"
          title="Today&apos;s minutes by staff type"
          subtitle="Permanent and agency minutes remain separated to keep the mix readable."
          className="span-4"
        >
          <div className="chart-area chart-area-compact">
            {loadingDashboard && !hasTodayBreakdown ? (
              <LoadingState
                compact
                title="Loading minutes breakdown"
                description="Calculating delivered minutes by staff type for the selected day."
              />
            ) : hasTodayBreakdown ? (
              <ResponsiveContainer {...chartContainerProps}>
                <BarChart data={todayBreakdown}>
                  <CartesianGrid strokeDasharray="4 4" stroke={chartGridStroke} />
                  <XAxis dataKey="name" tick={chartAxisStyle} stroke="#cbd5e1" />
                  <YAxis tick={chartAxisStyle} stroke="#cbd5e1" />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Bar isAnimationActive={false} dataKey="minutes" radius={[12, 12, 0, 0]}>
                    {todayBreakdown.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState title="No delivered minutes yet" description="Recorded shifts will appear here as soon as coverage is entered." />}
          </div>
        </SectionCard>
      </section>
    </div>
  )

  const renderShiftsPage = () => (
    <div className="page-stack">
      <section className="layout-grid layout-grid-two-up">
        <SectionCard
          eyebrow="Weekly target"
          title="Coverage progress"
          subtitle="This week’s logged minutes against the expected resident target."
          className="span-1"
        >
          <div className="card-stack">
            <div className="summary-kpi">
              <strong>{formatNumber(weeklyMinutes)}</strong>
              <span>minutes logged this week</span>
            </div>
            <ProgressMetric
              label={`${weekBounds.start ?? 'Week'} to ${weekBounds.end ?? ''}`}
              value={weeklyMinutes}
              target={weeklyTargetMinutes}
              percent={weeklyProgressPercent}
              tone="green"
            />
            <div className="key-value-grid">
              <div>
                <span>Shifts this week</span>
                <strong>{formatNumber(weeklyShifts.length)}</strong>
              </div>
              <div>
                <span>Recovery pace</span>
                <strong>{formatNumber(totalMinutesNeededTomorrow)} min/day</strong>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          eyebrow="Scenario"
          title="Recovery controls"
          subtitle="Adjust the scenario inputs without leaving the operations page."
          className="span-1"
          actions={
            <button className="btn btn-secondary" aria-busy={loadingDashboard} disabled={loadingDashboard || !selectedFacilityId} type="button" onClick={() => void loadDashboard()}>
              {loadingDashboard ? 'Refreshing...' : 'Refresh'}
            </button>
          }
        >
          <div className="form-grid compact-form-grid">
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
            <label className="field">
              <span>Scenario shift minutes</span>
              <input
                min="0"
                step="15"
                type="number"
                value={scenarioShiftMinutes}
                onChange={(event) => setScenarioShiftMinutes(clampScenarioValue(event.target.value, { maximum: 1440 }))}
              />
            </label>
            <label className="field">
              <span>Scenario shifts / week</span>
              <input
                min="0"
                step="1"
                type="number"
                value={scenarioShiftsPerWeek}
                onChange={(event) => setScenarioShiftsPerWeek(clampScenarioValue(event.target.value, { maximum: 21 }))}
              />
            </label>
          </div>
          <p className="card-helper">
            Scenario adds {formatNumber(scenarioShiftMinutes * scenarioShiftsPerWeek)} minutes per week and shifts projected quarter compliance to {formatPercent(forecast?.scenario?.overall_projected_compliance_percent)}.
          </p>
        </SectionCard>
      </section>

      <SectionCard
        eyebrow="Add new shift"
        title={editingShiftId ? 'Update shift record' : 'Add new shift'}
        subtitle="Desktop stays horizontal for faster data entry; mobile stacks cleanly without clipping fields."
        actions={
          <div className="section-actions">
            <input ref={shiftImportRef} className="visually-hidden" accept=".csv,text/csv" type="file" onChange={(event) => void handleShiftImport(event)} />
            <button className="btn btn-secondary" aria-busy={importingShifts} disabled={importingShifts || !hasStaff} type="button" onClick={() => shiftImportRef.current?.click()}>
              {importingShifts ? 'Importing...' : 'Import CSV'}
            </button>
            <button className="btn btn-secondary" disabled={!shifts.length} type="button" onClick={handleExportShifts}>
              Export CSV
            </button>
          </div>
        }
      >
        {shiftError ? <div className="inline-banner inline-banner-danger">{shiftError}</div> : null}
        {!hasStaff ? <div className="inline-banner inline-banner-info">Add a staff member before recording shifts for this facility.</div> : null}

        <form className="form-grid form-grid-shifts" onSubmit={submitShift}>
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

          <label className="field field-span-2">
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

          <div className="form-footer field-span-2">
            <p className="card-helper">
              Overnight shifts are supported automatically. If the end time is earlier than the start time, the shift rolls into the next facility day.
            </p>
            <div className="button-row">
              <button className="btn btn-primary" aria-busy={savingShift} disabled={savingShift || shiftFormDisabled} type="submit">
                {savingShift ? 'Saving...' : editingShiftId ? 'Update shift' : 'Add shift'}
              </button>
              {editingShiftId ? (
                <button className="btn btn-secondary" disabled={savingShift || shiftFormDisabled} type="button" onClick={cancelShiftEdit}>
                  Cancel
                </button>
              ) : null}
            </div>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        eyebrow="Shift log"
        title="Recent shift activity"
        subtitle="Readable rows, tidy actions, and local filters for rapid operational review."
      >
        <div className="toolbar">
          <label className="field toolbar-field">
            <span>Search</span>
            <input
              type="text"
              value={shiftFilters.query}
              onChange={(event) => setShiftFilters((currentValue) => ({
                ...currentValue,
                query: event.target.value
              }))}
            />
          </label>
          <label className="field toolbar-field">
            <span>Role</span>
            <select
              value={shiftFilters.role}
              onChange={(event) => setShiftFilters((currentValue) => ({
                ...currentValue,
                role: event.target.value
              }))}
            >
              <option value="all">All roles</option>
              <option value="rn">RN</option>
              <option value="en">EN</option>
              <option value="pcw">PCW</option>
            </select>
          </label>
          <label className="field toolbar-field">
            <span>Date</span>
            <input
              type="date"
              value={shiftFilters.date}
              onChange={(event) => setShiftFilters((currentValue) => ({
                ...currentValue,
                date: event.target.value
              }))}
            />
          </label>
        </div>

        <div className="table-shell">
          {filteredShifts.length ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Staff</th>
                  <th>Role</th>
                  <th>Date</th>
                  <th>Window</th>
                  <th>Duration</th>
                  <th>Notes</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredShifts.map((shift) => (
                  <tr key={shift.id}>
                    <td>
                      <div className="table-primary">{shift.staff_name}</div>
                      <div className="table-secondary">{employmentTypeLabels[shift.employment_type_snapshot] ?? 'Unknown employment'}</div>
                    </td>
                    <td><Badge tone={getStaffTone(shift.staff_type_snapshot)}>{staffTypeLabels[shift.staff_type_snapshot] ?? 'Unknown'}</Badge></td>
                    <td>{shift.shift_date}</td>
                    <td>{formatDateTimeLabel(shift.start_time)} to {formatDateTimeLabel(shift.end_time)}</td>
                    <td>{formatNumber(shift.duration_minutes)} min</td>
                    <td>{shift.notes || 'No notes'}</td>
                    <td>
                      <div className="button-row">
                        <button className="btn btn-secondary btn-small" aria-label={`Edit shift for ${shift.staff_name} on ${shift.shift_date}`} disabled={isBusy} type="button" onClick={() => handleEditShift(shift)}>
                          Edit
                        </button>
                        <button className="btn btn-danger btn-small" aria-busy={deletingId === shift.id} aria-label={`Delete shift for ${shift.staff_name} on ${shift.shift_date}`} disabled={isBusy} type="button" onClick={() => handleDeleteShift(shift.id)}>
                          {deletingId === shift.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState
              title={hasShiftFiltersApplied ? 'No shifts match the current filters' : 'No shifts logged yet'}
              description={hasShiftFiltersApplied
                ? 'Adjust the filters or import new coverage rows.'
                : 'Import a CSV or add the first shift to populate the recent activity table.'}
            />
          )}
        </div>
      </SectionCard>
    </div>
  )

  const renderStaffPage = () => (
    <div className="page-stack">
      <section className="stats-grid stats-grid-5">
        <StatCard label="Total staff" value={formatNumber(staffCounts.total)} hint="Active roster" />
        <StatCard label="RN" value={formatNumber(staffCounts.rn)} hint="Registered nurses" tone="info" />
        <StatCard label="EN" value={formatNumber(staffCounts.en)} hint="Enrolled nurses" tone="warning" />
        <StatCard label="PCW" value={formatNumber(staffCounts.pcw)} hint="Personal care workers" tone="success" />
        <StatCard label="Agency" value={formatNumber(staffCounts.agency)} hint="External coverage" tone="warning" />
      </section>

      <section className="layout-grid layout-grid-two-up">
        <SectionCard
          eyebrow="Add new staff member"
          title={editingStaffId ? 'Update staff profile' : 'Create staff profile'}
          subtitle="Keep the roster clean so forecasting, alerts, and shift logging stay reliable."
        >
          {staffError ? <div className="inline-banner inline-banner-danger">{staffError}</div> : null}
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

            <div className="form-footer field-span-2">
              <p className="card-helper">Staff data flows directly into the shift form, workforce charts, and AI recommendations.</p>
              <div className="button-row">
                <button className="btn btn-primary" aria-busy={savingStaff} disabled={savingStaff || isBusy} type="submit">
                  {savingStaff ? 'Saving...' : editingStaffId ? 'Update staff' : 'Add staff'}
                </button>
                {editingStaffId ? (
                  <button className="btn btn-secondary" disabled={savingStaff || isBusy} type="button" onClick={cancelStaffEdit}>
                    Cancel
                  </button>
                ) : null}
              </div>
            </div>
          </form>
        </SectionCard>

        <SectionCard
          eyebrow="Workforce mix"
          title="Roster composition"
          subtitle="Balance permanent, casual, and agency coverage at a glance."
        >
          <div className="chart-area">
            {loadingDashboard && !staffCounts.total ? (
              <LoadingState
                compact
                title="Loading workforce mix"
                description="Preparing the current roster composition for this facility."
              />
            ) : staff.some((member) => member.staff_type) ? (
              <ResponsiveContainer {...chartContainerProps}>
                <PieChart>
                  <Pie
                    isAnimationActive={false}
                    data={staffMix}
                    dataKey="value"
                    nameKey="name"
                    outerRadius={104}
                    innerRadius={58}
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
            ) : <EmptyState title="No staff added yet" description="Create the first staff member to populate workforce analytics." />}
          </div>
        </SectionCard>
      </section>

      <SectionCard
        eyebrow="Staff list"
        title="Roster directory"
        subtitle="Professional filters, polished badges, and clear row actions."
      >
        <div className="toolbar">
          <label className="field toolbar-field">
            <span>Search</span>
            <input
              type="text"
              value={staffFilters.query}
              onChange={(event) => setStaffFilters((currentValue) => ({
                ...currentValue,
                query: event.target.value
              }))}
            />
          </label>
          <label className="field toolbar-field">
            <span>Role</span>
            <select
              value={staffFilters.role}
              onChange={(event) => setStaffFilters((currentValue) => ({
                ...currentValue,
                role: event.target.value
              }))}
            >
              <option value="all">All roles</option>
              <option value="rn">RN</option>
              <option value="en">EN</option>
              <option value="pcw">PCW</option>
            </select>
          </label>
          <label className="field toolbar-field">
            <span>Employment</span>
            <select
              value={staffFilters.employment}
              onChange={(event) => setStaffFilters((currentValue) => ({
                ...currentValue,
                employment: event.target.value
              }))}
            >
              <option value="all">All types</option>
              <option value="permanent">Permanent</option>
              <option value="part_time">Part time</option>
              <option value="casual">Casual</option>
              <option value="agency">Agency</option>
            </select>
          </label>
        </div>

        <div className="table-shell">
          {filteredStaff.length ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Employment</th>
                  <th>Contact</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStaff.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <div className="table-primary">{member.full_name}</div>
                      <div className="table-secondary">{member.id.slice(0, 8)}</div>
                    </td>
                    <td><Badge tone={getStaffTone(member.staff_type)}>{staffTypeLabels[member.staff_type] ?? 'Unknown'}</Badge></td>
                    <td><Badge tone={getEmploymentTone(member.employment_type)}>{employmentTypeLabels[member.employment_type] ?? 'Unknown'}</Badge></td>
                    <td>{member.email || member.phone || 'No contact details provided'}</td>
                    <td><Badge tone="success">{member.is_active === false ? 'Inactive' : 'Active'}</Badge></td>
                    <td>
                      <div className="button-row">
                        <button className="btn btn-secondary btn-small" aria-label={`Edit ${member.full_name}`} disabled={isBusy} type="button" onClick={() => handleEditStaff(member)}>
                          Edit
                        </button>
                        <button className="btn btn-danger btn-small" aria-busy={deletingId === member.id} aria-label={`Delete ${member.full_name}`} disabled={isBusy} type="button" onClick={() => handleDeleteStaff(member.id)}>
                          {deletingId === member.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState
              title={hasStaffFiltersApplied ? 'No staff match the current filters' : 'No staff added yet'}
              description={hasStaffFiltersApplied
                ? 'Broaden the filters or add another staff member to the roster.'
                : 'Create the first staff member to populate the roster directory and analytics.'}
            />
          )}
        </div>
      </SectionCard>
    </div>
  )

  const renderForecastPage = () => (
    <div className="page-stack">
      <section className="stats-grid stats-grid-4">
        <StatCard label="Quarter compliance" value={formatPercent(forecast?.overall_projected_compliance_percent)} hint="Projected overall result" tone={toFiniteNumber(forecast?.overall_projected_compliance_percent) >= 100 ? 'success' : 'warning'} />
        <StatCard label="Days remaining" value={formatNumber(forecast?.days_remaining)} hint={`${formatPercent(quarterCompletionPercent)} elapsed`} tone="info" />
        <StatCard label="Penalty accrued" value={formatCurrency(penaltyAccrued)} hint="Penalty estimate to date" tone={penaltyAccrued > 0 ? 'warning' : 'success'} />
        <StatCard label="Projected penalty" value={formatCurrency(forecast?.dollar_value_at_risk)} hint="Current quarter outlook" tone={toFiniteNumber(forecast?.dollar_value_at_risk) > 0 ? 'danger' : 'success'} />
      </section>

      <section className="layout-grid layout-grid-three-up">
        <SectionCard
          eyebrow="Gauge"
          title="Compliance gauge"
          subtitle="Risk is obvious immediately without hiding the percentage."
        >
          <div className="gauge-shell">
            <div
              className="gauge-ring"
              style={{
                background: `conic-gradient(${toFiniteNumber(forecast?.overall_projected_compliance_percent) >= 100 ? '#22c55e' : '#f59e0b'} ${Math.max(0, Math.min(toFiniteNumber(forecast?.overall_projected_compliance_percent), 100))}%, #e2e8f0 0)`
              }}
            >
              <div className="gauge-center">
                <strong>{formatPercent(forecast?.overall_projected_compliance_percent)}</strong>
                <span>overall projected</span>
              </div>
            </div>
            <div className="key-value-grid">
              <div>
                <span>Total projection</span>
                <strong>{formatPercent(forecast?.projected_compliance_percent)}</strong>
              </div>
              <div>
                <span>RN projection</span>
                <strong>{formatPercent(forecast?.projected_rn_compliance_percent)}</strong>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          eyebrow="Recovery plan"
          title="Scenario-led recovery"
          subtitle="A highlighted plan card that keeps the next step obvious."
          className={projectedCoverageDelta > 0 ? 'surface-card-highlight' : ''}
        >
          <div className="card-stack">
            <div className="summary-kpi">
              <strong>{formatPercent(forecast?.scenario?.overall_projected_compliance_percent)}</strong>
              <span>scenario projected outcome</span>
            </div>
            <div className="metric-pair-list">
              <div>
                <span>Additional scenario minutes</span>
                <strong>{formatNumber(forecast?.scenario?.additional_minutes_total)}</strong>
              </div>
              <div>
                <span>Projected coverage lift</span>
                <strong>{formatPercent(projectedCoverageDelta)}</strong>
              </div>
              <div>
                <span>Protected revenue estimate</span>
                <strong>{formatCurrency(protectedRevenue)}</strong>
              </div>
              <div>
                <span>Target outlook</span>
                <strong>{forecast?.scenario?.will_meet_target ? 'Recovered' : 'Still below target'}</strong>
              </div>
            </div>
            <div className="alert-callout">
              <Badge tone={forecast?.scenario?.will_meet_target ? 'success' : 'warning'}>
                {forecast?.scenario?.will_meet_target ? 'Recovery plan viable' : 'More coverage still required'}
              </Badge>
              <p>{forecast?.scenario?.assumption ?? 'Scenario assumptions are unavailable.'}</p>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          eyebrow="Quarter pacing"
          title="Current trajectory"
          subtitle="Keep the risk framing simple and executive-readable."
        >
          <div className="metric-pair-list">
            <div>
              <span>Actual minutes so far</span>
              <strong>{formatNumber(forecast?.actual_minutes_so_far)}</strong>
            </div>
            <div>
              <span>Required minutes so far</span>
              <strong>{formatNumber(forecast?.required_minutes_so_far)}</strong>
            </div>
            <div>
              <span>Actual RN minutes</span>
              <strong>{formatNumber(forecast?.actual_rn_minutes_so_far)}</strong>
            </div>
            <div>
              <span>Required RN minutes</span>
              <strong>{formatNumber(forecast?.required_rn_minutes_so_far)}</strong>
            </div>
          </div>
        </SectionCard>
      </section>

      <SectionCard
        eyebrow="Penalty breakdown"
        title="Risk breakdown table"
        subtitle="A clean operational-financial breakdown of the quarter exposure."
      >
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Value</th>
                <th>Severity</th>
                <th>Operational read</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Projected shortfall minutes</td>
                <td>{formatNumber(forecast?.projected_shortfall_minutes)}</td>
                <td><Badge tone={toFiniteNumber(forecast?.projected_shortfall_minutes) > 0 ? 'danger' : 'success'}>{toFiniteNumber(forecast?.projected_shortfall_minutes) > 0 ? 'High' : 'Low'}</Badge></td>
                <td>Total minutes still missing at current pace.</td>
              </tr>
              <tr>
                <td>Projected RN shortfall minutes</td>
                <td>{formatNumber(forecast?.projected_rn_shortfall_minutes)}</td>
                <td><Badge tone={toFiniteNumber(forecast?.projected_rn_shortfall_minutes) > 0 ? 'danger' : 'success'}>{toFiniteNumber(forecast?.projected_rn_shortfall_minutes) > 0 ? 'High' : 'Low'}</Badge></td>
                <td>RN-qualified minutes remain the tightest constraint.</td>
              </tr>
              <tr>
                <td>Equivalent non-compliant days</td>
                <td>{formatNumber(forecast?.funding_at_risk?.equivalent_non_compliant_days)}</td>
                <td><Badge tone={toFiniteNumber(forecast?.funding_at_risk?.equivalent_non_compliant_days) > 0 ? 'warning' : 'success'}>{toFiniteNumber(forecast?.funding_at_risk?.equivalent_non_compliant_days) > 0 ? 'Watch' : 'Stable'}</Badge></td>
                <td>Penalty estimate converted into operational day-equivalents.</td>
              </tr>
              <tr>
                <td>Estimated dollar exposure</td>
                <td>{formatCurrency(forecast?.dollar_value_at_risk)}</td>
                <td><Badge tone={toFiniteNumber(forecast?.dollar_value_at_risk) > 0 ? 'danger' : 'success'}>{toFiniteNumber(forecast?.dollar_value_at_risk) > 0 ? 'Critical' : 'Protected'}</Badge></td>
                <td>Planning estimate only, based on the penalty assumption in the model.</td>
              </tr>
              <tr>
                <td>Minutes/day to recover</td>
                <td>{formatNumber(forecast?.minutes_needed_per_day_to_recover)}</td>
                <td><Badge tone={toFiniteNumber(forecast?.minutes_needed_per_day_to_recover) > 0 ? 'warning' : 'success'}>{toFiniteNumber(forecast?.minutes_needed_per_day_to_recover) > 0 ? 'Manage' : 'Covered'}</Badge></td>
                <td>Daily staffing uplift needed to close the quarter gap.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  )

  const renderAlertsPage = () => (
    <div className="page-stack">
      <div className="page-actions-right">
        <button className="btn btn-primary" aria-busy={runningAlert} disabled={runningAlert || !selectedFacilityId || !hasCurrentDashboardData} type="button" onClick={handleRunAlert}>
          {runningAlert ? 'Generating alert...' : aiAlert ? 'Refresh alert' : 'Generate alert'}
        </button>
      </div>

      <section className="stats-grid stats-grid-3">
        <StatCard label="Total alerts" value={formatNumber(alertFeed.length)} hint="Current operational feed" />
        <StatCard label="On track" value={formatNumber(alertFeed.filter((alert) => alert.status === 'On track' || alert.status === 'Stable').length)} hint="No urgent action required" tone="success" />
        <StatCard label="Action needed" value={formatNumber(alertFeed.filter((alert) => alert.status !== 'On track' && alert.status !== 'Stable').length)} hint="Warnings and recovery items" tone="warning" />
      </section>

      <div className="alerts-feed">
        {alertFeed.map((alert) => (
          <article key={alert.id} className={`alert-card alert-card-${alert.tone}`}>
            <div className="alert-card-head">
              <div>
                <h3>{alert.title}</h3>
                <p>{alert.message}</p>
              </div>
              <div className="alert-card-meta">
                <Badge tone={alert.tone}>{alert.status}</Badge>
                <Badge tone="neutral">{alert.date ?? 'No date'}</Badge>
                <Badge tone="info">{String(alert.channel).replace('_', ' ')}</Badge>
              </div>
            </div>

            <div className="alert-card-body">
              <div>
                <h4>Identified gaps</h4>
                <div className="gap-pill-row">
                  {alert.gaps.map((gap) => (
                    <span key={gap} className="gap-pill">{gap}</span>
                  ))}
                </div>
              </div>

              <div>
                <h4>Suggested action</h4>
                <p className="alert-card-copy">{alert.recommendation}</p>
              </div>

              <div>
                <h4>Suggested staff / contacts</h4>
                {alert.contacts.length ? (
                  <div className="contact-list">
                    {alert.contacts.map((contact) => (
                      <div key={`${alert.id}-${contact.name}`} className="contact-card">
                        <strong>{contact.name}</strong>
                        <span>{contact.detail}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="card-helper">No staff suggestions are available for this alert yet.</p>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  )

  const reportPreview = generatedReport

  const renderReportsPage = () => (
    <div className="page-stack">
      <section className="layout-grid layout-grid-two-up">
        <SectionCard
          eyebrow="Report generation"
          title="Generate audit report"
          subtitle="Create a clean audit summary for any valid period without leaving the app."
        >
          {reportError ? <div className="inline-banner inline-banner-danger">{reportError}</div> : null}
          <form className="form-grid compact-form-grid" onSubmit={handleGenerateReport}>
            <label className="field">
              <span>Start date</span>
              <input
                required
                type="date"
                value={reportRange.start_date}
                onChange={(event) => setReportRange((currentValue) => ({
                  ...currentValue,
                  start_date: event.target.value
                }))}
              />
            </label>
            <label className="field">
              <span>End date</span>
              <input
                required
                type="date"
                value={reportRange.end_date}
                onChange={(event) => setReportRange((currentValue) => ({
                  ...currentValue,
                  end_date: event.target.value
                }))}
              />
            </label>
            <div className="form-footer field-span-2">
              <p className="card-helper">
                Current quarter defaults to {quarterBounds.start ?? 'N/A'} through {todayDate ?? 'N/A'}.
              </p>
              <div className="button-row">
                <button className="btn btn-primary" aria-busy={generatingReport} disabled={generatingReport || !selectedFacilityId} type="submit">
                  {generatingReport ? 'Generating...' : 'Generate report'}
                </button>
                <button className="btn btn-secondary" aria-busy={downloadingPdf} disabled={downloadingPdf || !selectedFacilityId || !reportRange.start_date || !reportRange.end_date} type="button" onClick={() => void handleDownloadPdf(reportRange.start_date, reportRange.end_date)}>
                  {downloadingPdf ? 'Downloading...' : 'Download PDF'}
                </button>
              </div>
            </div>
          </form>
        </SectionCard>

        <SectionCard
          eyebrow="Quarter reference"
          title="Current quarter summary"
          subtitle="A reference card so the report page never feels sparse."
        >
          <div className="metric-pair-list">
            <div>
              <span>Compliance result</span>
              <strong>{report?.compliance_result?.toUpperCase() ?? 'N/A'}</strong>
            </div>
            <div>
              <span>Overall compliance</span>
              <strong>{formatPercent(report?.summary?.overall_compliance_percent)}</strong>
            </div>
            <div>
              <span>Total care %</span>
              <strong>{formatPercent(report?.summary?.compliance_percent)}</strong>
            </div>
            <div>
              <span>RN %</span>
              <strong>{formatPercent(report?.summary?.rn_compliance_percent)}</strong>
            </div>
          </div>
        </SectionCard>
      </section>

      {!reportPreview ? (
        <SectionCard
          eyebrow="Preview"
          title={generatingReport ? 'Generating report preview' : 'No generated report yet'}
          subtitle={generatingReport ? 'Building the current report preview from the selected date range.' : 'The preview area appears here once you run a report.'}
        >
          {generatingReport ? (
            <LoadingState
              title="Generating report preview"
              description="Compiling the selected date range into the preview pane."
            />
          ) : (
            <EmptyState
              title="Generate a report to preview it here"
              description="Use the date range form above to create an audit-ready compliance summary and keep the page centered and intentional."
            />
          )}
        </SectionCard>
      ) : (
        <SectionCard
          eyebrow="Preview"
          title="Generated report preview"
          subtitle={`${reportPreview.report_period.start_date} to ${reportPreview.report_period.end_date}`}
        >
          <div className="report-preview">
            <div className="report-preview-head">
              <div>
                <h3>{reportPreview.facility.name}</h3>
                <p>{reportPreview.report_period.start_date} to {reportPreview.report_period.end_date}</p>
              </div>
              <Badge tone={reportPreview.compliance_result === 'met' ? 'success' : 'warning'}>
                {reportPreview.compliance_result === 'met' ? 'Compliant' : 'Not met'}
              </Badge>
            </div>

            <section className="stats-grid stats-grid-4">
              <StatCard label="Overall %" value={formatPercent(reportPreview.summary.overall_compliance_percent)} hint="Combined total + RN" />
              <StatCard label="Total minutes" value={formatNumber(reportPreview.summary.total_actual_minutes)} hint={`Target ${formatNumber(reportPreview.summary.total_required_minutes)}`} tone="info" />
              <StatCard label="RN days met" value={formatNumber(reportPreview.summary.total_rn_days_met)} hint={`${formatNumber(reportPreview.summary.total_days)} days in period`} tone="success" />
              <StatCard label="Agency split" value={formatPercent(reportPreview.agency_permanent_split.agency_percent)} hint="Agency of delivered minutes" tone="warning" />
            </section>

            <div className="table-shell">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Overall %</th>
                    <th>Total %</th>
                    <th>RN %</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {reportPreview.daily_breakdown.slice(0, 8).map((row) => (
                    <tr key={row.compliance_date}>
                      <td>{row.compliance_date}</td>
                      <td>{formatPercent(row.overall_compliance_percent)}</td>
                      <td>{formatPercent(row.compliance_percent)}</td>
                      <td>{formatPercent(row.rn_compliance_percent)}</td>
                      <td><Badge tone={toneByStatus(row.status)}>{getStatusMeta(row.status).label}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </SectionCard>
      )}
    </div>
  )

  const renderUnavailablePage = () => (
    <SectionCard
      eyebrow="Facility data"
      title={dashboardUnavailableTitle}
      subtitle={dashboardUnavailableMessage}
    >
      {loadingDashboard ? (
        <LoadingState
          title={dashboardUnavailableTitle}
          description={dashboardUnavailableMessage}
        />
      ) : (
        <EmptyState
          title={dashboardUnavailableTitle}
          description={dashboardUnavailableMessage}
          action={
            <button className="btn btn-primary" aria-busy={loadingDashboard} disabled={loadingDashboard || !selectedFacilityId} type="button" onClick={() => void loadDashboard()}>
              {loadingDashboard ? 'Refreshing...' : 'Refresh dashboard'}
            </button>
          }
        />
      )}
    </SectionCard>
  )

  const renderPageFor = (pageId) => {
    if (!hasCurrentDashboardData) {
      return renderUnavailablePage()
    }

    if (pageId === 'dashboard') {
      return renderDashboardPage()
    }

    if (pageId === 'shifts') {
      return renderShiftsPage()
    }

    if (pageId === 'staff') {
      return renderStaffPage()
    }

    if (pageId === 'forecast') {
      return renderForecastPage()
    }

    if (pageId === 'alerts') {
      return renderAlertsPage()
    }

    if (pageId === 'reports') {
      return renderReportsPage()
    }

    return renderDashboardPage()
  }

  const managerDisplayName = 'Facility admin'
  const managerInitial = managerDisplayName.slice(0, 1).toUpperCase()

  if (loadingFacilities) {
    return (
      <main className="app-shell app-shell-status">
        <section className="status-card" role="status" aria-live="polite">
          <p className="section-eyebrow">Care Minutes AI</p>
          <LoadingState title="Loading dashboard" description="Fetching facilities and compliance data..." />
        </section>
      </main>
    )
  }

  if (!facilities.length) {
    return (
      <main className="app-shell app-shell-status">
        <section className="status-card">
          <p className="section-eyebrow">Care Minutes AI</p>
          <h1>{pageError ? 'Unable to load facilities' : 'No facilities configured'}</h1>
          <p>{pageError || 'Add a facility to begin tracking care minutes and compliance performance.'}</p>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="brand-mark">CM</div>
          <div className="brand-copy">
            <strong>Care Minutes AI</strong>
            <span>{facility?.name ?? 'Facility workspace'}</span>
          </div>
        </div>

        <div className="sidebar-scroll">
          <div className="sidebar-facility-card">
            <span>Facility</span>
            <strong>{facility?.name ?? 'Not selected'}</strong>
            <p>{formatNumber(facility?.resident_count)} residents • {facility?.timezone ?? 'Australia/Sydney'}</p>
          </div>

          <nav className="sidebar-nav" aria-label="Primary">
            {navItems.map((item) => (
              <SidebarItem key={item.id} active={activePage === item.id} item={item} />
            ))}
          </nav>
        </div>

        <div className="sidebar-footer">
          <span className="sidebar-section-label">Admin</span>
          <div className="sidebar-user-card">
            <div className="sidebar-user-avatar">{managerInitial}</div>
            <div>
              <strong>{managerDisplayName}</strong>
              <span>{facility?.name ?? 'Facility workspace'}</span>
            </div>
          </div>
        </div>
      </aside>

      <section className="workspace" aria-busy={loadingDashboard || isBusy}>
        <div className="workspace-inner">
          {renderSharedPageHeader()}

          {pageError ? <div className="notice-banner notice-banner-danger" role="alert">{pageError}</div> : null}
          {notice ? <div className="notice-banner notice-banner-success" role="status" aria-live="polite">{notice}</div> : null}
          {loadingDashboard ? <div className="notice-banner notice-banner-info" role="status" aria-live="polite">Refreshing latest compliance and forecast data...</div> : null}

          <Routes>
            <Route path="/" element={renderPageFor('dashboard')} />
            <Route path="/staff" element={renderPageFor('staff')} />
            <Route path="/shifts" element={renderPageFor('shifts')} />
            <Route path="/forecast" element={renderPageFor('forecast')} />
            <Route path="/alerts" element={renderPageFor('alerts')} />
            <Route path="/reports" element={renderPageFor('reports')} />
            <Route path="*" element={<Navigate replace to="/" />} />
          </Routes>
        </div>
      </section>
    </main>
  )
}

export default App
