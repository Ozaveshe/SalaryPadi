const origin = process.env.SALARYPADI_ORIGIN ?? "https://salarypadi.com";
const requiredWorkers = [
  "job_source_sync",
  "editorial_job_snapshot",
  "editorial_topic_candidates",
  "editorial_draft",
  "editorial_preflight",
  "editorial_queue",
  "editorial_publish",
  "editorial_live_blocks",
];

async function get(path, accept = "application/json") {
  const response = await fetch(new URL(path, origin), {
    headers: { Accept: accept },
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response;
}

const health = await (await get("/api/health")).json();
if (health.status !== "ok") throw new Error(`Health is ${health.status}`);

const workers = new Map(
  Array.isArray(health.checks?.workers)
    ? health.checks.workers.map((worker) => [worker.task_key, worker])
    : [],
);
for (const taskKey of requiredWorkers) {
  const worker = workers.get(taskKey);
  if (!worker) throw new Error(`Missing worker health: ${taskKey}`);
  if (worker.freshness !== "healthy") {
    throw new Error(`${taskKey} freshness is ${worker.freshness}`);
  }
  if (!worker.last_started_at) throw new Error(`${taskKey} has never run`);
}

for (const path of ["/", "/jobs", "/insights", "/feed.xml"]) {
  await get(path, path.endsWith(".xml") ? "application/rss+xml" : "text/html");
}

const sourceWorker = workers.get("job_source_sync");
const publishWorker = workers.get("editorial_publish");
console.log(
  JSON.stringify(
    {
      status: "fresh",
      origin,
      job_source_sync: sourceWorker.last_success_at,
      editorial_publish: publishWorker.last_success_at,
      verified_routes: ["/", "/jobs", "/insights", "/feed.xml"],
    },
    null,
    2,
  ),
);
