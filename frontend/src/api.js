import axios from 'axios'

export const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '')

const api = axios.create({
  baseURL: apiBaseUrl
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
