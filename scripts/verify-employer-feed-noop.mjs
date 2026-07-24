// Proof that the committed (empty) employer feed registry results in zero
// selected feeds and therefore zero network requests. Run:
//   npx tsx scripts/verify-employer-feed-noop.mjs
process.env.NEXT_PUBLIC_APP_URL ||= "https://salarypadi.test";
let attempts = 0;
globalThis.fetch = () => {
  attempts += 1;
  throw new Error("NETWORK REQUEST ATTEMPTED");
};
const { loadRunnableEmployerFeeds } =
  await import("../src/lib/jobs/feeds/runtime.ts");
const feeds = loadRunnableEmployerFeeds(new Date());
console.log("runnable feeds:", feeds.length);
console.log("network requests attempted:", attempts);
if (feeds.length !== 0 || attempts !== 0) {
  console.error("FAIL: expected zero feeds and zero requests");
  process.exit(1);
}
console.log("PASS: empty registry -> zero feeds selected -> zero requests");
