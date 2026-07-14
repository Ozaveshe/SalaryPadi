import "server-only";

import { NextResponse } from "next/server";

import { noStoreResponse } from "@/lib/http/json";

export function noStoreRedirect(
  destination: string | URL,
  status: 303 | 307 | 308 = 303,
): NextResponse {
  return noStoreResponse(
    NextResponse.redirect(destination, status),
  ) as NextResponse;
}
