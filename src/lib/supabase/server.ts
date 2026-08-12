import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { getSupabasePublicConfig } from "@/lib/env";
import { createBoundedFetch } from "@/lib/supabase/bounded-fetch";
import type { Database } from "@/lib/supabase/database.types";

const SUPABASE_SERVER_TIMEOUT_MS = 8_000;

export type SalaryPadiSupabaseClient = SupabaseClient<Database>;

interface PublicClientCacheOptions {
  revalidate: number;
  tags: string[];
}

/**
 * A credential-free client for reads whose RLS contract is identical for
 * every visitor. Unlike the session-aware client below, this client never
 * reads cookies, so public repository results can safely enter Next's shared
 * data cache without a user token becoming part of the cached work.
 */
export function createPublicSupabaseClient(
  cacheOptions?: PublicClientCacheOptions,
): SalaryPadiSupabaseClient | null {
  const configuration = getSupabasePublicConfig();
  if (!configuration) return null;

  const boundedFetch = createBoundedFetch(SUPABASE_SERVER_TIMEOUT_MS);
  const publicFetch: typeof fetch = (input, init) =>
    boundedFetch(input, {
      ...init,
      ...(cacheOptions ? { next: cacheOptions } : {}),
    });

  return createClient<Database>(
    configuration.url,
    configuration.publishableKey,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
      global: {
        fetch: publicFetch,
      },
    },
  );
}

export async function createServerSupabaseClient() {
  const configuration = getSupabasePublicConfig();
  if (!configuration) return null;

  const cookieStore = await cookies();

  return createServerClient<Database>(
    configuration.url,
    configuration.publishableKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components cannot write cookies. The request proxy refreshes
            // the session and writes the resulting cookies to the browser.
          }
        },
      },
      global: {
        fetch: createBoundedFetch(SUPABASE_SERVER_TIMEOUT_MS),
      },
    },
  );
}
