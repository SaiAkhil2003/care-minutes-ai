import express from 'express'
import {
  createStaffController,
  deleteStaffController,
  getAllStaff,
  updateStaffController
} from '../controllers/staffcontroller.js'

const router = express.Router()

router.get('/', getAllStaff)
router.post('/', createStaffController)
router.put('/:id', updateStaffController)
router.delete('/:id', deleteStaffController)

export default router
