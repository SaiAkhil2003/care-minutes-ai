import test from 'node:test'
import assert from 'node:assert/strict'
import { getRepositoryMode, resetRepository } from '../src/data/repository.js'

test('development defaults to file mode even when Supabase credentials exist', (t) => {
  const originalProvider = process.env.DATA_PROVIDER
  const originalNodeEnv = process.env.NODE_ENV
  const originalSupabaseUrl = process.env.SUPABASE_URL
  const originalSupabaseKey = process.env.SUPABASE_KEY

  delete process.env.DATA_PROVIDER
  process.env.NODE_ENV = 'development'
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_KEY = 'test-key'
  resetRepository()

  t.after(() => {
    if (originalProvider === undefined) {
      delete process.env.DATA_PROVIDER
    } else {
      process.env.DATA_PROVIDER = originalProvider
    }

    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = originalNodeEnv
    }

    if (originalSupabaseUrl === undefined) {
      delete process.env.SUPABASE_URL
    } else {
      process.env.SUPABASE_URL = originalSupabaseUrl
    }

    if (originalSupabaseKey === undefined) {
      delete process.env.SUPABASE_KEY
    } else {
      process.env.SUPABASE_KEY = originalSupabaseKey
    }

    resetRepository()
  })

  assert.equal(getRepositoryMode(), 'file')
})

test('explicit DATA_PROVIDER still allows Supabase mode in development', (t) => {
  const originalProvider = process.env.DATA_PROVIDER
  const originalNodeEnv = process.env.NODE_ENV

  process.env.DATA_PROVIDER = 'supabase'
  process.env.NODE_ENV = 'development'
  resetRepository()

  t.after(() => {
    if (originalProvider === undefined) {
      delete process.env.DATA_PROVIDER
    } else {
      process.env.DATA_PROVIDER = originalProvider
    }

    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = originalNodeEnv
    }

    resetRepository()
  })

  assert.equal(getRepositoryMode(), 'supabase')
})
