import { createFileRepository } from './fileRepository.js'
import { createSupabaseRepository } from './supabaseRepository.js'

let repositoryInstance
let repositoryMode

const VALID_MODES = new Set(['file', 'supabase'])

const resolveMode = () => {
  const requestedMode = process.env.DATA_PROVIDER?.trim().toLowerCase()

  if (requestedMode) {
    if (!VALID_MODES.has(requestedMode)) {
      throw new Error(`Unsupported DATA_PROVIDER "${process.env.DATA_PROVIDER}"`)
    }

    return requestedMode
  }

  if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
    return 'supabase'
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('SUPABASE_URL and SUPABASE_KEY are required in production unless DATA_PROVIDER=file is explicitly set')
  }

  return 'file'
}

export const getRepositoryMode = () => {
  if (!repositoryMode) {
    repositoryMode = resolveMode()
  }

  return repositoryMode
}

export const getRepository = () => {
  if (repositoryInstance) {
    return repositoryInstance
  }

  repositoryMode = resolveMode()
  repositoryInstance = repositoryMode === 'supabase'
    ? createSupabaseRepository()
    : createFileRepository()

  return repositoryInstance
}

export const resetRepository = () => {
  repositoryInstance = undefined
  repositoryMode = undefined
}
