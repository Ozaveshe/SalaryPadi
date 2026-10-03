# Native worker module compatibility

SalaryPadi's Netlify site is `f20afc4c-5326-4f00-97bf-570a679aadbc` (`salarypadi.com`). Production uses Node 22.

The patched `sanitize-html` 2.18.0 CommonJS entry loads the ESM-only `htmlparser2` 12 package. Ordinary Node 22 enables that interoperability, but AWS Lambda disables it by default. Netlify's native function packager preserves the dependency's CommonJS require call, so successful Next.js and ordinary Node builds did not prove worker startup. See [AWS Node.js runtime documentation](https://docs.aws.amazon.com/lambda/latest/dg/lambda-nodejs.html).

`npm ci` builds the locked sanitizer and its dependencies into `src/lib/jobs/generated/sanitize-html.cjs` through `scripts/build-sanitizer.mjs`. The job normalizer imports that artifact in both the application and native workers. Its adjacent declaration preserves the upstream sanitizer types. The artifact is ignored by Git, formatting and lint; the locked source dependency is authoritative. To rebuild it after an install that skips lifecycle scripts, run `npm run build:sanitizer`.

`npm run verify:worker-dependencies` requires Node 22 and starts a fresh Node process with `--no-experimental-require-module`. It loads the bundled sanitizer and checks script and event-handler removal. CI and Netlify's production build run this check. Its output records the checked Node version. It never calls a worker handler, contacts a provider, sends an email or writes a database record.

Do not downgrade to an older vulnerable sanitizer. No experimental module flag is required. An attempted site-scoped `NODE_OPTIONS` setting did not repair native startup on the observed production deployment; the packaged-worker check and real scheduled-run result are the release evidence.

After deployment, verify the Netlify published deploy's full commit, the runtime build-info response, and real `private.worker_runs` entries carrying that deploy ID. A successful app build or module import alone does not establish scheduled-worker recovery. Do not manufacture worker records or manually invoke alert delivery against ordinary recipients for verification.
