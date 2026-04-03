import express from 'express'
import { downloadAuditPdf, getReport } from '../controllers/reportcontroller.js'

const router = express.Router()

router.get('/', getReport)
router.get('/audit.pdf', downloadAuditPdf)

export default router
