import axios from 'axios'

const SAME_ORIGIN_API_BASE_URL = '/api'
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1'])

const resolveDefaultApiBaseUrl = () => {
  const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()

  if (configuredApiBaseUrl) {
    return configuredApiBaseUrl
  }

  if (import.meta.env.DEV) {
    return SAME_ORIGIN_API_BASE_URL
  }

  if (
    typeof window !== 'undefined'
    && LOCAL_HOSTNAMES.has(window.location.hostname)
  ) {
    const apiPort = import.meta.env.VITE_API_PORT?.trim() || '3000'
    return `${window.location.protocol}//${window.location.hostname}:${apiPort}`
  }

  return SAME_ORIGIN_API_BASE_URL
}

export const apiBaseUrl = resolveDefaultApiBaseUrl().replace(/\/$/, '')

const api = axios.create({
  baseURL: apiBaseUrl,
  timeout: 15000,
  headers: {
    Accept: 'application/json'
  }
})

export const unwrap = async (request) => {
  const response = await request
  return response.data.data
}

export const getApiErrorMessage = (error) =>
  error?.response?.data?.error?.message
  ?? error?.response?.data?.message
  ?? error?.message
  ?? 'Something went wrong'

export const buildApiUrl = (path, params = {}) => {
  const searchParams = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, value)
    }
  })

  const query = searchParams.toString()
  return `${apiBaseUrl}${path}${query ? `?${query}` : ''}`
}

export default api
