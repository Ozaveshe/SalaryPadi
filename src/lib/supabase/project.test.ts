import { describe, expect, it } from "vitest";

import {
  getSalaryPadiSupabaseOrigin,
  SALARYPADI_SUPABASE_ORIGIN,
} from "@/lib/supabase/project";

describe("SalaryPadi Supabase project boundary", () => {
  it("accepts only the exact production project origin", () => {
    expect(
      getSalaryPadiSupabaseOrigin("https://bxelrhklsznmpksgrqep.supabase.co/"),
    ).toBe(SALARYPADI_SUPABASE_ORIGIN);
  });

  it.each([
    "https://zpclagtgczsygrgztlts.supabase.co",
    "https://bxelrhklsznmpksgrqep.supabase.co/rest/v1",
    "https://user:secret@bxelrhklsznmpksgrqep.supabase.co",
    "http://bxelrhklsznmpksgrqep.supabase.co",
    "https://example.com",
  ])("rejects a cross-project or unsafe URL: %s", (url) => {
    expect(() => getSalaryPadiSupabaseOrigin(url)).toThrow(
      /SalaryPadi (must use|Supabase URL must be)/,
    );
  });

  it("allows an explicitly opted-in local Supabase origin", () => {
    expect(
      getSalaryPadiSupabaseOrigin("http://127.0.0.1:54321", {
        allowLocal: true,
      }),
    ).toBe("http://127.0.0.1:54321");
    expect(
      getSalaryPadiSupabaseOrigin("http://[::1]:54321", {
        allowLocal: true,
      }),
    ).toBe("http://[::1]:54321");
    expect(() => getSalaryPadiSupabaseOrigin("http://127.0.0.1:54321")).toThrow(
      /must use Supabase project/,
    );
  });
});
