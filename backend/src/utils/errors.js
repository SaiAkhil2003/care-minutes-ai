export class AppError extends Error {
  constructor(status, message, details = null) {
    super(message)
    this.name = 'AppError'
    this.status = status
    this.details = details
  }
}

export const isAppError = (error) => error instanceof AppError
