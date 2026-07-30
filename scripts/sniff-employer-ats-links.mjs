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
 *
 * `parseable` marks the four providers src/lib/jobs/ats/endpoints.ts can fetch
 * today. The rest are recorded but not ingestable, because the useful question
 * before building a fifth adapter is which provider Africa's employers actually
 * use -- and guessing tenant slugs answers that badly. A SmartRecruiters sweep
 * over 224 guessed slugs found three tenants and zero African roles, which is
 * evidence about the guessing, not about the provider.
 */
const ATS_PATTERNS = [
  {
    provider: "greenhouse",
    parseable: true,
    re: /(?:job-boards(?:\.eu)?|boards)\.greenhouse\.io\/([A-Za-z0-9][A-Za-z0-9_-]{1,80})/g,
  },
  {
    provider: "greenhouse",
    parseable: true,
    re: /boards-api\.greenhouse\.io\/v1\/boards\/([A-Za-z0-9][A-Za-z0-9_-]{1,80})/g,
  },
  {
    provider: "lever",
    parseable: true,
    re: /jobs\.(?:eu\.)?lever\.co\/([A-Za-z0-9][A-Za-z0-9_-]{1,80})/g,
  },
  {
    provider: "ashby",
    parseable: true,
    re: /jobs\.ashbyhq\.com\/([A-Za-z0-9][A-Za-z0-9_-]{1,80})/g,
  },
  {
    provider: "workable",
    parseable: true,
    re: /apply\.workable\.com\/([A-Za-z0-9][A-Za-z0-9_-]{1,80})/g,
  },
  // Not yet parseable. Recorded to size the gap.
  {
    provider: "smartrecruiters",
    parseable: false,
    re: /jobs\.smartrecruiters\.com\/([A-Za-z0-9][A-Za-z0-9_.-]{1,80})/g,
  },
  {
    provider: "smartrecruiters",
    parseable: false,
    re: /api\.smartrecruiters\.com\/v1\/companies\/([A-Za-z0-9][A-Za-z0-9_.-]{1,80})/g,
  },
  {
    provider: "workday",
    parseable: false,
    re: /([A-Za-z0-9][A-Za-z0-9_-]{1,60})\.wd\d+\.myworkdayjobs\.com/g,
  },
  {
    provider: "successfactors",
    parseable: false,
    re: /career\d*\.successfactors\.(?:com|eu)\/[^"'<>]*company=([A-Za-z0-9]{1,40})/g,
  },
  {
    provider: "oraclecloud",
    parseable: false,
    re: /([A-Za-z0-9-]{2,40})\.(?:fa\.)?(?:oraclecloud|oracle)\.com\/hcmUI\/CandidateExperience/g,
  },
  {
    provider: "taleo",
    parseable: false,
    re: /([A-Za-z0-9-]{2,40})\.taleo\.net/g,
  },
  {
    provider: "icims",
    parseable: false,
    re: /([A-Za-z0-9-]{2,40})\.icims\.com/g,
  },
  {
    provider: "erecruiter",
    parseable: false,
    re: /(erecruiterafrica|seamlesshiring|myjobmag|jobberman)\.com/g,
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

  // Large Nigerian and pan-African employers, which are the ones most likely to
  // sit on an enterprise ATS rather than Greenhouse or Workable.
  ["Dangote", "dangote.com"],
  ["MTN Nigeria", "mtn.ng"],
  ["MTN Group", "mtn.com"],
  ["Airtel Nigeria", "airtel.com.ng"],
  ["Guaranty Trust", "gtbank.com"],
  ["Zenith Bank", "zenithbank.com"],
  ["United Bank for Africa", "ubagroup.com"],
  ["First Bank", "firstbanknigeria.com"],
  ["Stanbic IBTC", "stanbicibtc.com"],
  ["Access Bank", "accessbankplc.com"],
  ["Ecobank", "ecobank.com"],
  ["Standard Bank", "standardbank.com"],
  ["Safaricom", "safaricom.co.ke"],
  ["Equity Bank", "equitygroupholdings.com"],
  ["Nestle Nigeria", "nestle-cwa.com"],
  ["Unilever Nigeria", "unilever-ewa.com"],
  ["Nigerian Breweries", "nbplc.com"],
  ["Guinness Nigeria", "guinness-nigeria.com"],
  ["Flour Mills", "fmnplc.com"],
  ["PZ Cussons", "pzcussons.com"],
  ["Seplat", "seplatenergy.com"],
  ["Oando", "oandoplc.com"],
  ["TotalEnergies Nigeria", "totalenergies.ng"],
  ["Julius Berger", "julius-berger.com"],
  ["Lafarge Africa", "lafarge.com.ng"],
  ["IHS Towers", "ihstowers.com"],
  ["Shoprite", "shoprite.co.za"],
  ["BUA Group", "buagroup.com"],
  ["Nigeria LNG", "nlng.com"],
  ["Chevron Nigeria", "chevron.com"],
  ["Bolt", "bolt.eu"],
  ["Uber", "uber.com"],
  ["Glovo", "glovoapp.com"],
  ["African Development Bank", "afdb.org"],
  ["World Health Organization", "who.int"],
  ["UNICEF", "unicef.org"],
  ["UNDP", "undp.org"],
  ["World Food Programme", "wfp.org"],
  ["Plan International", "plan-international.org"],
  ["FHI 360", "fhi360.org"],
  ["Jhpiego", "jhpiego.org"],
  ["Chemonics", "chemonics.com"],
  ["Palladium", "thepalladiumgroup.com"],
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
  for (const { provider, re, parseable } of ATS_PATTERNS) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(html)) !== null) {
      const tenant = match[1];
      if (NOT_A_TENANT.has(tenant.toLowerCase())) continue;
      if (!found.some((f) => f.provider === provider && f.tenant === tenant)) {
        found.push({ provider, tenant, parseable });
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
