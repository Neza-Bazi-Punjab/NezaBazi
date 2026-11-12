// src/proxy.ts
import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

// Not run for static files, nor for the public, cookie-less endpoints: the
// live scoring feeds (/api/live/...), the keyed broadcast feeds
// (/api/broadcast/..., a ?key= check, never a session), the location lookups
// (/api/locations/...) and the stream overlays (/overlay...). None of them
// reads a session, and on event day each of their requests was one more
// function call just to refresh a session nobody used.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/live/|api/broadcast/|api/locations/|overlay(?:/|$)|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}