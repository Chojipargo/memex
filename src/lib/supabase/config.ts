export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * Supabase is optional at build time so the UI can be developed and reviewed
 * before credentials are wired up. Auth actions surface a clear notice instead
 * of throwing.
 */
export function isSupabaseConfigured(): boolean {
  return supabaseUrl.startsWith("https://") && supabaseAnonKey.length > 20;
}
