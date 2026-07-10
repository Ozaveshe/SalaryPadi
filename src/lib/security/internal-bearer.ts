import { timingSafeEqual } from "node:crypto";

export function isValidInternalBearer(
  request: Pick<Request, "headers">,
  expected: string | undefined,
): boolean {
  const authorization = request.headers.get("authorization");
  if (!expected || !authorization?.startsWith("Bearer ")) return false;

  const supplied = authorization.slice("Bearer ".length);
  const suppliedBytes = Buffer.from(supplied, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return (
    suppliedBytes.byteLength === expectedBytes.byteLength &&
    timingSafeEqual(suppliedBytes, expectedBytes)
  );
}
