import test from 'node:test'
import assert from 'node:assert/strict'
import { createSupabaseRepository } from '../src/data/supabaseRepository.js'
import { AppError } from '../src/utils/errors.js'

test('listFacilities uses Supabase REST endpoint with apikey and bearer auth headers', async (t) => {
  const originalUrl = process.env.SUPABASE_URL
  const originalKey = process.env.SUPABASE_KEY
  const originalFetch = globalThis.fetch

  process.env.SUPABASE_URL = 'https://ymvzjimugruosdxbcwqw.supabase.co/'
  process.env.SUPABASE_KEY = 'legacy-anon-key'

  t.after(() => {
    process.env.SUPABASE_URL = originalUrl
    process.env.SUPABASE_KEY = originalKey
    globalThis.fetch = originalFetch
  })

  const facilities = [{ id: 'facility-1', name: 'Alpha Care' }]
  const requests = []

  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options })

    return new Response(JSON.stringify(facilities), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }

  const repository = createSupabaseRepository()
  const data = await repository.listFacilities()

  assert.deepEqual(data, facilities)
  assert.equal(requests.length, 1)
  assert.equal(
    requests[0].url,
    'https://ymvzjimugruosdxbcwqw.supabase.co/rest/v1/facilities?select=*&order=name.asc'
  )
  assert.equal(requests[0].options.method, 'GET')
  assert.equal(requests[0].options.headers.apikey, 'legacy-anon-key')
  assert.equal(requests[0].options.headers.Authorization, 'Bearer legacy-anon-key')
  assert.equal(requests[0].options.headers.Accept, 'application/json')
})

test('listFacilities surfaces fetch failures as AppError details', async (t) => {
  const originalUrl = process.env.SUPABASE_URL
  const originalKey = process.env.SUPABASE_KEY
  const originalFetch = globalThis.fetch

  process.env.SUPABASE_URL = 'https://ymvzjimugruosdxbcwqw.supabase.co'
  process.env.SUPABASE_KEY = 'legacy-anon-key'

  t.after(() => {
    process.env.SUPABASE_URL = originalUrl
    process.env.SUPABASE_KEY = originalKey
    globalThis.fetch = originalFetch
  })

  globalThis.fetch = async () => {
    throw new TypeError('fetch failed')
  }

  const repository = createSupabaseRepository()

  await assert.rejects(
    () => repository.listFacilities(),
    (error) => {
      assert.ok(error instanceof AppError)
      assert.equal(error.message, 'Unable to fetch facilities')
      assert.equal(error.details, 'TypeError: fetch failed')
      return true
    }
  )
})
