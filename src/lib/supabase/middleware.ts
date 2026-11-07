// src/lib/supabase/middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refreshes the session if its token has expired (getClaims reads the
  // session through getSession, which swaps an expired token for a new one
  // and writes the new cookies through setAll above). The token itself is
  // then checked locally against the project's cached signing key, so a
  // menu click no longer waits on a round trip to the Auth server here.
  // Nothing is decided from the result: every page and route checks the
  // session again itself. A malformed token must not break the request.
  try {
    await supabase.auth.getClaims()
  } catch {
    // Treated as signed out by the page or route that checks it.
  }

  return supabaseResponse
}