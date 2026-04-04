import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

export const getSupabaseConfig = () => ({
  url: process.env.SUPABASE_URL?.trim(),
  key: process.env.SUPABASE_KEY?.trim()
})

export const hasSupabaseConfig = () => {
  const { url, key } = getSupabaseConfig()
  return Boolean(url && key)
}

export const validateSupabaseConfig = () => {
  const { url, key } = getSupabaseConfig()

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_KEY in environment')
  }

  return { url, key }
}

export const createSupabaseClient = () => {
  const { url, key } = validateSupabaseConfig()

  return createClient(url, key)
}
