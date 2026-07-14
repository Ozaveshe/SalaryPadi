import { describe, expect, it } from "vitest";

import { parseAuthLinkCredential } from "@/lib/auth/link-credential";

describe("parseAuthLinkCredential", () => {
  it.each([
    "pkce-code_1234",
    "0123456789abcdef0123456789abcdef",
    "base64/value+with=padding",
  ])("accepts a bounded printable credential (%s)", (value) => {
    expect(parseAuthLinkCredential(value)).toBe(value);
  });

  it.each([
    null,
    "",
    "short",
    " leading-value",
    "trailing-value ",
    "line\nbreak",
    "non-ascii-\u00E9",
    "a".repeat(2_049),
  ])("rejects an invalid credential (%s)", (value) => {
    expect(parseAuthLinkCredential(value)).toBeNull();
  });
});
