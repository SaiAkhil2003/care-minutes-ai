import { AppError, isAppError } from './errors.js'

export const sendData = (res, data, status = 200) => {
  res.status(status).json({ data })
}

export const sendDeleted = (res, data = { success: true }) => {
  res.status(200).json({ data })
}

export const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: {
      message: `Route not found: ${req.method} ${req.originalUrl}`
    }
  })
}

export const errorHandler = (error, req, res, next) => {
  if (res.headersSent) {
    return next(error)
  }

  if (
    error instanceof SyntaxError
    && error.status === 400
    && Object.prototype.hasOwnProperty.call(error, 'body')
  ) {
    return res.status(400).json({
      error: {
        message: 'Invalid JSON request body'
      }
    })
  }

  if (isAppError(error)) {
    return res.status(error.status).json({
      error: {
        message: error.message,
        details: error.details
      }
    })
  }

  console.error(error)

  return res.status(500).json({
    error: {
      message: 'Internal server error'
    }
  })
}

export const asyncHandler = (handler) => async (req, res, next) => {
  try {
    await handler(req, res, next)
  } catch (error) {
    next(error)
  }
}

export const invariant = (condition, status, message, details = null) => {
  if (!condition) {
    throw new AppError(status, message, details)
  }
}
