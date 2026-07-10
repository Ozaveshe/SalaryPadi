import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabasePublicConfig } from "@/lib/env";

export async function createServerSupabaseClient() {
  const configuration = getSupabasePublicConfig();
  if (!configuration) return null;

  const cookieStore = await cookies();

  return createServerClient(configuration.url, configuration.publishableKey, {
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
  });
}
