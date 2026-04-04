import {
  createFileRepository,
  validateFileStoreAccess,
  usesDefaultFileStorePath
} from './fileRepository.js'
import { createSupabaseRepository } from './supabaseRepository.js'
import { validateSupabaseConfig } from '../config/supabase.js'

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

  if (process.env.NODE_ENV === 'production') {
    if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
      return 'supabase'
    }

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

export const validateRepositoryConfiguration = async () => {
  const mode = getRepositoryMode()

  if (mode === 'file') {
    const fileStore = await validateFileStoreAccess()

    return {
      mode,
      file_store: fileStore,
      warnings:
        process.env.NODE_ENV === 'production' && usesDefaultFileStorePath()
          ? [
            'DATA_PROVIDER=file is using the default local path. Configure LOCAL_DATA_FILE on persistent storage or switch to Supabase before deployment.'
          ]
          : []
    }
  }

  validateSupabaseConfig()

  return {
    mode,
    warnings: []
  }
}

export const resetRepository = () => {
  repositoryInstance = undefined
  repositoryMode = undefined
}
