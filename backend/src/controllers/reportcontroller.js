import { generateAuditReport } from '../services/reportservice.js'
import { generateAuditPdfBuffer } from '../services/pdfservice.js'
import { asyncHandler, sendData } from '../utils/http.js'
import { requireDateRange, requireUuid } from '../utils/validation.js'

export const getReport = asyncHandler(async (req, res) => {
  const facilityId = requireUuid(req.query.facility_id, 'facility_id')
  const { startDate, endDate } = requireDateRange(req.query.start_date, req.query.end_date)
  const result = await generateAuditReport(facilityId, startDate, endDate)

  sendData(res, result)
})

export const downloadAuditPdf = asyncHandler(async (req, res) => {
  const facilityId = requireUuid(req.query.facility_id, 'facility_id')
  const { startDate, endDate } = requireDateRange(req.query.start_date, req.query.end_date)
  const report = await generateAuditReport(facilityId, startDate, endDate, {
    persistMetadata: true
  })
  const pdfBuffer = generateAuditPdfBuffer(report)

  res.setHeader('content-type', 'application/pdf')
  res.setHeader('content-disposition', `attachment; filename="care-minutes-audit-${startDate}-to-${endDate}.pdf"`)
  res.status(200).send(pdfBuffer)
})
