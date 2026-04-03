import express from 'express'
import {
  createShiftController,
  deleteShiftController,
  getAllShifts,
  updateShiftController
} from '../controllers/shiftcontroller.js'

const router = express.Router()

router.get('/', getAllShifts)
router.post('/', createShiftController)
router.put('/:id', updateShiftController)
router.delete('/:id', deleteShiftController)

export default router
