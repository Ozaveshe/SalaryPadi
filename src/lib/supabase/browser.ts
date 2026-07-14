"use client";

import { createBrowserClient } from "@supabase/ssr";

import { createBoundedFetch } from "@/lib/supabase/bounded-fetch";
import { getSalaryPadiSupabaseOrigin } from "@/lib/supabase/project";
import type { Database } from "@/lib/supabase/database.types";

const SUPABASE_BROWSER_TIMEOUT_MS = 8_000;

export function createBrowserSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) return null;
  return createBrowserClient<Database>(
    getSalaryPadiSupabaseOrigin(url, {
      allowLocal: process.env.NODE_ENV !== "production",
    }),
    publishableKey,
    {
      global: {
        fetch: createBoundedFetch(SUPABASE_BROWSER_TIMEOUT_MS),
      },
    },
  );
}
