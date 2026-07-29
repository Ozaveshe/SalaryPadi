// Read an employer's own careers page and find which ATS it actually links to.
//
//   node scripts/sniff-employer-ats-links.mjs [--out output/ats-links.json]
//
// WHY THIS EXISTS
//
// probe-african-employer-boards.mjs guesses a tenant slug from the company
// name. That works when the employer used its own name and fails silently
// otherwise -- Flutterwave, Paystack, Interswitch and OPay all returned nothing
// on a guess, which is not evidence that they have no board.
//
// This asks the employer instead. The careers page is the one place a company
// states where its applications go, so the ATS URL printed there is the
// employer's own declaration of its tenant, not our inference. That also makes
// the slug collisions of the guessing pass impossible: a slug found on
// paystack.com belongs to Paystack by construction.
//
// A hit still needs the board probed for freshness and Nigerian yield before it
// is worth registering, and identity still needs corroborating at registration.

import { Buffer } from "node:buffer";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const USER_AGENT = "SalaryPadi/1.0 (+https://salarypadi.com/about)";
const MAX_PAGE_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 20_000;
const CONCURRENCY = 6;

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

const OUT_PATH = resolve(process.cwd(), arg("--out", "output/ats-links.json"));

/** Employer pages are untrusted input, so read to a ceiling. */
async function readBoundedText(response) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_PAGE_BYTES) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Where each provider publishes a tenant board. Captured group 1 is the tenant.
 * Only providers src/lib/jobs/ats/endpoints.ts can fetch are looked for.
 */
const ATS_PATTERNS = [
  {
    provider: "greenhouse",
    re: /(?:job-boards(?:\.eu)?|boards)\.greenhouse\.io\/([A-Za-z0-9][A-Za-z0-9_-]{1,80})/g,
  },
  {
    provider: "greenhouse",
    re: /boards-api\.greenhouse\.io\/v1\/boards\/([A-Za-z0-9][A-Za-z0-9_-]{1,80})/g,
  },
  {
    provider: "lever",
    re: /jobs\.(?:eu\.)?lever\.co\/([A-Za-z0-9][A-Za-z0-9_-]{1,80})/g,
  },
  {
    provider: "ashby",
    re: /jobs\.ashbyhq\.com\/([A-Za-z0-9][A-Za-z0-9_-]{1,80})/g,
  },
  {
    provider: "workable",
    re: /apply\.workable\.com\/([A-Za-z0-9][A-Za-z0-9_-]{1,80})/g,
  },
];

/** Slugs that appear in ATS URLs but are paths, not tenants. */
const NOT_A_TENANT = new Set([
  "embed",
  "api",
  "v1",
  "j",
  "assets",
  "static",
  "widget",
  "boards",
  "jobs",
]);

const EMPLOYERS = [
  ["Flutterwave", "flutterwave.com"],
  ["Paystack", "paystack.com"],
  ["Interswitch", "interswitchgroup.com"],
  ["OPay", "opayweb.com"],
  ["PalmPay", "palmpay.com"],
  ["Andela", "andela.com"],
  ["Chipper Cash", "chippercash.com"],
  ["Yellow Card", "yellowcard.io"],
  ["Nomba", "nomba.com"],
  ["Autochek", "autochek.africa"],
  ["Sun King", "sunking.com"],
  ["Wasoko", "wasoko.com"],
  ["TymeBank", "tymebank.co.za"],
  ["Cowrywise", "cowrywise.com"],
  ["PiggyVest", "piggyvest.com"],
  ["Paga", "mypaga.com"],
  ["Mono", "mono.co"],
  ["Okra", "okra.ng"],
  ["Bamboo", "investbamboo.com"],
  ["Risevest", "risevest.com"],
  ["Fincra", "fincra.com"],
  ["Klasha", "klasha.com"],
  ["Bitnob", "bitnob.com"],
  ["Reliance Health", "reliancehmo.com"],
  ["Vendease", "vendease.com"],
  ["Sabi", "sabi.am"],
  ["Moniepoint", "moniepoint.com"],
  ["Jumia", "group.jumia.com"],
  ["Cellulant", "cellulant.io"],
  ["JUMO", "jumo.world"],
  ["Yoco", "yoco.com"],
  ["Peach Payments", "peachpayments.com"],
  ["Stitch", "stitch.money"],
  ["Twiga Foods", "twiga.com"],
  ["mPharma", "mpharma.com"],
  ["Branch International", "branch.co"],
  ["Wave Mobile Money", "wave.com"],
  ["Termii", "termii.com"],
  ["Norwegian Refugee Council", "nrc.no"],
  ["eHealth Africa", "ehealthafrica.org"],
  ["Mercy Corps", "mercycorps.org"],
  ["International Rescue Committee", "rescue.org"],
  ["Save the Children", "savethechildren.net"],
  ["Malaria Consortium", "malariaconsortium.org"],
  ["Sightsavers", "sightsavers.org"],
  ["TechnoServe", "technoserve.org"],
  ["Evidence Action", "evidenceaction.org"],
  ["IDinsight", "idinsight.org"],
  ["Sama", "sama.com"],
  ["Onafriq", "onafriq.com"],
];

/** Careers pages live under a handful of conventional paths. */
const PATHS = [
  "/careers",
  "/careers/",
  "/jobs",
  "/about/careers",
  "/company/careers",
  "/",
];

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { "user-agent": USER_AGENT },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!response.ok) return "";
    return await readBoundedText(response);
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

function findTenants(html) {
  const found = [];
  for (const { provider, re } of ATS_PATTERNS) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(html)) !== null) {
      const tenant = match[1];
      if (NOT_A_TENANT.has(tenant.toLowerCase())) continue;
      if (!found.some((f) => f.provider === provider && f.tenant === tenant)) {
        found.push({ provider, tenant });
      }
    }
  }
  return found;
}

const results = [];
let index = 0;
async function worker() {
  while (index < EMPLOYERS.length) {
    const [name, domain] = EMPLOYERS[index++];
    const hits = [];
    for (const path of PATHS) {
      const html = await fetchText(`https://${domain}${path}`);
      if (!html) continue;
      for (const hit of findTenants(html)) {
        if (
          !hits.some(
            (h) => h.provider === hit.provider && h.tenant === hit.tenant,
          )
        ) {
          hits.push({ ...hit, foundOn: `https://${domain}${path}` });
        }
      }
      if (hits.length > 0) break;
      await sleep(150);
    }
    if (hits.length > 0) {
      console.log(
        `  ${name} (${domain}) -> ${hits.map((h) => `${h.provider}/${h.tenant}`).join(", ")}`,
      );
      results.push({ employer: name, domain, hits });
    }
  }
}

console.log(`Reading ${EMPLOYERS.length} careers pages…`);
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(
  OUT_PATH,
  JSON.stringify({ readAt: new Date().toISOString(), results }, null, 2),
);
console.log(
  `\n${results.length} employers declare an ATS board. Written to ${OUT_PATH}`,
);
