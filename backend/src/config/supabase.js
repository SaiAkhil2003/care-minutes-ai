import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

export const hasSupabaseConfig = () => Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_KEY)

export const createSupabaseClient = () => {
  if (!hasSupabaseConfig()) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_KEY in environment')
  }

  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)
}
