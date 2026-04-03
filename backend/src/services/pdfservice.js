const PAGE_WIDTH = 595
const PAGE_HEIGHT = 842
const PAGE_MARGIN = 48
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2

const escapePdfText = (value) =>
  String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')

const approximateTextWidth = (text, fontSize) => String(text ?? '').length * fontSize * 0.52

const wrapText = (text, maxWidth, fontSize) => {
  const words = String(text ?? '').split(/\s+/).filter(Boolean)

  if (!words.length) {
    return ['']
  }

  const lines = []
  let currentLine = words[0]

  for (const word of words.slice(1)) {
    const candidate = `${currentLine} ${word}`
    if (approximateTextWidth(candidate, fontSize) <= maxWidth) {
      currentLine = candidate
    } else {
      lines.push(currentLine)
      currentLine = word
    }
  }

  lines.push(currentLine)
  return lines
}

class SimplePdf {
  constructor() {
    this.pages = []
    this.pageNumber = 0
    this.addPage()
  }

  addPage() {
    this.pageNumber += 1
    this.currentPage = {
      commands: []
    }
    this.pages.push(this.currentPage)
  }

  ensurePageSpace(currentY, neededHeight) {
    if (currentY + neededHeight <= PAGE_HEIGHT - PAGE_MARGIN) {
      return currentY
    }

    this.addPage()
    return PAGE_MARGIN
  }

  drawText(x, yTop, text, { font = 'F1', size = 12, color = [0.12, 0.1, 0.08] } = {}) {
    const y = PAGE_HEIGHT - yTop
    const escaped = escapePdfText(text)
    this.currentPage.commands.push(
      `${color[0]} ${color[1]} ${color[2]} rg BT /${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${escaped}) Tj ET`
    )
  }

  drawWrappedText(x, yTop, text, maxWidth, options = {}) {
    const {
      font = 'F1',
      size = 12,
      color = [0.12, 0.1, 0.08],
      lineHeight = size + 4
    } = options
    const lines = wrapText(text, maxWidth, size)
    let currentY = yTop

    for (const line of lines) {
      this.drawText(x, currentY, line, { font, size, color })
      currentY += lineHeight
    }

    return currentY
  }

  drawLine(x1, y1Top, x2, y2Top, color = [0.72, 0.69, 0.65], width = 1) {
    const y1 = PAGE_HEIGHT - y1Top
    const y2 = PAGE_HEIGHT - y2Top
    this.currentPage.commands.push(
      `${width} w ${color[0]} ${color[1]} ${color[2]} RG ${x1} ${y1} m ${x2} ${y2} l S`
    )
  }

  drawRect(x, yTop, width, height, strokeColor = [0.72, 0.69, 0.65], fillColor = null) {
    const y = PAGE_HEIGHT - yTop - height
    if (fillColor) {
      this.currentPage.commands.push(
        `${fillColor[0]} ${fillColor[1]} ${fillColor[2]} rg ${x} ${y} ${width} ${height} re f`
      )
    }
    this.currentPage.commands.push(
      `1 w ${strokeColor[0]} ${strokeColor[1]} ${strokeColor[2]} RG ${x} ${y} ${width} ${height} re S`
    )
  }

  drawPolyline(points, color = [0.15, 0.39, 0.92], width = 2) {
    if (points.length < 2) {
      return
    }

    const [firstPoint, ...rest] = points
    const commands = [`${width} w ${color[0]} ${color[1]} ${color[2]} RG`]
    commands.push(`${firstPoint.x} ${PAGE_HEIGHT - firstPoint.y} m`)

    for (const point of rest) {
      commands.push(`${point.x} ${PAGE_HEIGHT - point.y} l`)
    }

    commands.push('S')
    this.currentPage.commands.push(commands.join(' '))
  }

  toBuffer() {
    const objects = []
    const addObject = (value) => {
      objects.push(value)
      return objects.length
    }

    const catalogId = addObject('<< /Type /Catalog /Pages 2 0 R >>')
    const pagesId = addObject('')
    const fontRegularId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
    const fontBoldId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>')

    const pageIds = []

    for (const page of this.pages) {
      const stream = `${page.commands.join('\n')}\n`
      const contentId = addObject(`<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}endstream`)
      const pageId = addObject(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentId} 0 R >>`
      )
      pageIds.push(pageId)
    }

    objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((pageId) => `${pageId} 0 R`).join(' ')}] /Count ${pageIds.length} >>`

    let document = '%PDF-1.4\n'
    const offsets = [0]

    objects.forEach((objectValue, index) => {
      offsets.push(Buffer.byteLength(document, 'utf8'))
      document += `${index + 1} 0 obj\n${objectValue}\nendobj\n`
    })

    const xrefOffset = Buffer.byteLength(document, 'utf8')
    document += `xref\n0 ${objects.length + 1}\n`
    document += '0000000000 65535 f \n'

    for (const offset of offsets.slice(1)) {
      document += `${String(offset).padStart(10, '0')} 00000 n \n`
    }

    document += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
    return Buffer.from(document, 'utf8')
  }
}

const formatNumber = (value) => new Intl.NumberFormat('en-AU').format(Number(value ?? 0))
const formatPercent = (value) => `${Number(value ?? 0).toFixed(2)}%`
const formatDate = (value) => value ?? 'N/A'

const drawSummaryCard = (pdf, x, y, width, title, value, caption) => {
  pdf.drawRect(x, y, width, 92, [0.87, 0.84, 0.8], [0.98, 0.97, 0.95])
  pdf.drawText(x + 16, y + 24, title, { font: 'F2', size: 11, color: [0.34, 0.32, 0.3] })
  pdf.drawText(x + 16, y + 52, value, { font: 'F2', size: 21, color: [0.06, 0.46, 0.43] })
  pdf.drawWrappedText(x + 16, y + 70, caption, width - 32, { size: 10, color: [0.47, 0.44, 0.41] })
}

const drawTableHeader = (pdf, y, columns) => {
  pdf.drawRect(PAGE_MARGIN, y, CONTENT_WIDTH, 28, [0.7, 0.66, 0.61], [0.92, 0.9, 0.87])
  columns.forEach((column) => {
    pdf.drawText(column.x, y + 18, column.label, { font: 'F2', size: 10, color: [0.18, 0.16, 0.15] })
  })
}

const drawTrendChart = (pdf, y, report) => {
  const chartX = PAGE_MARGIN
  const chartY = y
  const chartWidth = CONTENT_WIDTH
  const chartHeight = 180

  pdf.drawRect(chartX, chartY, chartWidth, chartHeight, [0.84, 0.8, 0.76], [0.99, 0.99, 0.98])
  pdf.drawText(chartX + 16, chartY + 20, 'Daily Compliance Trend', { font: 'F2', size: 12 })

  const plotX = chartX + 44
  const plotY = chartY + 38
  const plotWidth = chartWidth - 68
  const plotHeight = chartHeight - 62

  for (let step = 0; step <= 4; step += 1) {
    const lineY = plotY + (plotHeight / 4) * step
    pdf.drawLine(plotX, lineY, plotX + plotWidth, lineY, [0.88, 0.86, 0.83], 0.7)
    const value = 150 - step * 25
    pdf.drawText(chartX + 12, lineY + 4, `${value}%`, { size: 8, color: [0.47, 0.44, 0.41] })
  }

  const points = report.trend_chart.map((point, index, rows) => ({
    x: plotX + (rows.length <= 1 ? 0 : (plotWidth / (rows.length - 1)) * index),
    y: plotY + plotHeight - Math.min(point.compliance_percent, 150) / 150 * plotHeight
  }))

  pdf.drawPolyline(points)

  report.trend_chart.forEach((point, index, rows) => {
    const x = plotX + (rows.length <= 1 ? 0 : (plotWidth / (rows.length - 1)) * index)
    if (index === 0 || index === rows.length - 1 || index % 5 === 0) {
      pdf.drawText(x - 8, chartY + chartHeight - 14, formatDate(point.date).slice(5), { size: 8, color: [0.47, 0.44, 0.41] })
    }
  })
}

export const generateAuditPdfBuffer = (report) => {
  const pdf = new SimplePdf()
  let y = PAGE_MARGIN

  pdf.drawRect(PAGE_MARGIN, y, CONTENT_WIDTH, 210, [0.84, 0.8, 0.76], [0.95, 0.93, 0.89])
  pdf.drawText(PAGE_MARGIN + 24, y + 36, 'Care Minutes AI', { font: 'F2', size: 14, color: [0.06, 0.46, 0.43] })
  pdf.drawText(PAGE_MARGIN + 24, y + 76, 'Audit Compliance Report', { font: 'F2', size: 28 })
  pdf.drawText(PAGE_MARGIN + 24, y + 110, report.facility.name, { font: 'F2', size: 18, color: [0.13, 0.16, 0.2] })
  pdf.drawText(PAGE_MARGIN + 24, y + 138, `Reporting period: ${report.report_period.start_date} to ${report.report_period.end_date}`, { size: 12 })
  pdf.drawText(PAGE_MARGIN + 24, y + 160, `Compliance result: ${report.compliance_result.toUpperCase()}`, { font: 'F2', size: 14, color: report.compliance_result === 'met' ? [0.09, 0.42, 0.2] : [0.72, 0.11, 0.11] })
  pdf.drawText(PAGE_MARGIN + 24, y + 182, `Generated: ${report.generated_at.slice(0, 10)}`, { size: 11, color: [0.47, 0.44, 0.41] })

  y += 240
  drawSummaryCard(
    pdf,
    PAGE_MARGIN,
    y,
    (CONTENT_WIDTH - 16) / 2,
    'Total Minutes',
    formatNumber(report.summary.total_actual_minutes),
    `Target ${formatNumber(report.summary.total_required_minutes)}`
  )
  drawSummaryCard(
    pdf,
    PAGE_MARGIN + (CONTENT_WIDTH + 16) / 2,
    y,
    (CONTENT_WIDTH - 16) / 2,
    'Compliance',
    formatPercent(report.summary.compliance_percent),
    `RN coverage days met ${formatNumber(report.summary.total_rn_days_met)}`
  )

  y += 118
  drawTrendChart(pdf, y, report)

  pdf.addPage()
  y = PAGE_MARGIN
  pdf.drawText(PAGE_MARGIN, y, 'Summary', { font: 'F2', size: 22 })
  y += 28

  const summaryColumns = [
    { x: PAGE_MARGIN + 14, label: 'Metric' },
    { x: PAGE_MARGIN + 260, label: 'Value' }
  ]
  drawTableHeader(pdf, y, summaryColumns)
  y += 36

  const summaryRows = [
    ['Total minutes', formatNumber(report.summary.total_actual_minutes)],
    ['Target minutes', formatNumber(report.summary.total_required_minutes)],
    ['Compliance %', formatPercent(report.summary.compliance_percent)],
    ['RN minutes', formatNumber(report.summary.total_actual_rn_minutes)],
    ['RN target minutes', formatNumber(report.summary.total_required_rn_minutes)],
    ['RN coverage days met', formatNumber(report.summary.total_rn_days_met)],
    ['Agency split', `${formatPercent(report.agency_permanent_split.agency_percent)}`],
    ['Permanent split', `${formatPercent(report.agency_permanent_split.permanent_percent)}`]
  ]

  summaryRows.forEach((row, index) => {
    pdf.drawRect(PAGE_MARGIN, y, CONTENT_WIDTH, 24, [0.9, 0.88, 0.85], index % 2 === 0 ? [0.99, 0.99, 0.98] : [0.97, 0.96, 0.94])
    pdf.drawText(PAGE_MARGIN + 14, y + 16, row[0], { size: 10 })
    pdf.drawText(PAGE_MARGIN + 260, y + 16, row[1], { font: 'F2', size: 10 })
    y += 24
  })

  y += 24
  pdf.drawText(PAGE_MARGIN, y, 'Staff Type Breakdown', { font: 'F2', size: 16 })
  y += 20
  const breakdownColumns = [
    { x: PAGE_MARGIN + 14, label: 'Staff Type' },
    { x: PAGE_MARGIN + 260, label: 'Minutes' }
  ]
  drawTableHeader(pdf, y, breakdownColumns)
  y += 36
  report.staff_type_breakdown.forEach((row, index) => {
    pdf.drawRect(PAGE_MARGIN, y, CONTENT_WIDTH, 24, [0.9, 0.88, 0.85], index % 2 === 0 ? [0.99, 0.99, 0.98] : [0.97, 0.96, 0.94])
    pdf.drawText(PAGE_MARGIN + 14, y + 16, row.name, { size: 10 })
    pdf.drawText(PAGE_MARGIN + 260, y + 16, formatNumber(row.minutes), { font: 'F2', size: 10 })
    y += 24
  })

  pdf.addPage()
  y = PAGE_MARGIN
  pdf.drawText(PAGE_MARGIN, y, 'Daily Breakdown', { font: 'F2', size: 22 })
  y += 28

  const dailyColumns = [
    { x: PAGE_MARGIN + 10, label: 'Date' },
    { x: PAGE_MARGIN + 110, label: 'Minutes' },
    { x: PAGE_MARGIN + 210, label: 'Target' },
    { x: PAGE_MARGIN + 305, label: 'Compliance' },
    { x: PAGE_MARGIN + 415, label: 'Status' }
  ]

  drawTableHeader(pdf, y, dailyColumns)
  y += 36

  for (const [index, row] of report.daily_breakdown.entries()) {
    y = pdf.ensurePageSpace(y, 28)
    if (y === PAGE_MARGIN && index > 0) {
      drawTableHeader(pdf, y, dailyColumns)
      y += 36
    }

    pdf.drawRect(PAGE_MARGIN, y, CONTENT_WIDTH, 24, [0.9, 0.88, 0.85], index % 2 === 0 ? [0.99, 0.99, 0.98] : [0.97, 0.96, 0.94])
    pdf.drawText(PAGE_MARGIN + 10, y + 16, formatDate(row.compliance_date), { size: 9 })
    pdf.drawText(PAGE_MARGIN + 110, y + 16, formatNumber(row.actual_total_minutes), { size: 9 })
    pdf.drawText(PAGE_MARGIN + 210, y + 16, formatNumber(row.required_total_minutes), { size: 9 })
    pdf.drawText(PAGE_MARGIN + 305, y + 16, formatPercent(row.compliance_percent), { size: 9 })
    pdf.drawText(PAGE_MARGIN + 415, y + 16, String(row.status).toUpperCase(), {
      font: 'F2',
      size: 9,
      color: row.status === 'green'
        ? [0.09, 0.42, 0.2]
        : row.status === 'amber'
          ? [0.71, 0.33, 0.04]
          : [0.72, 0.11, 0.11]
    })
    y += 24
  }

  return pdf.toBuffer()
}
