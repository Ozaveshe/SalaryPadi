# Native worker module compatibility

SalaryPadi's Netlify site is `f20afc4c-5326-4f00-97bf-570a679aadbc` (`salarypadi.com`). Production uses Node 22.

Set the non-secret `NODE_OPTIONS` value to `--experimental-require-module` for this site in **both builds and functions scopes**, including production and deployment previews. This must be a Netlify environment variable; build-only values in `netlify.toml` do not configure the function runtime.

The patched `sanitize-html` 2.18.0 CommonJS entry loads the ESM-only `htmlparser2` 12 package. Ordinary Node 22 enables that interoperability, but AWS Lambda disables it by default. Its documented `NODE_OPTIONS` setting enables the same module behavior in the function runtime. See [AWS Node.js runtime documentation](https://docs.aws.amazon.com/lambda/latest/dg/lambda-nodejs.html) and [Netlify function environment documentation](https://docs.netlify.com/build/functions/environment-variables/).

This setting enables an experimental runtime feature; AWS documents that such features are outside its runtime SLA. Dependency and runtime updates require the startup check and an actual scheduled-run verification. Do not replace the patched sanitizer with an older vulnerable release to bypass a startup failure.

`npm run verify:worker-dependencies` requires Node 22, rejects a missing or contradictory module setting, and starts a fresh Node process that loads the sanitizer and verifies its basic text sanitization. CI and Netlify's production build run this check. Its output records the checked Node version. A future runtime upgrade must update this guard along with the CI, build and function runtime settings. It never calls a worker handler, contacts a provider, sends an email, or writes a database record.

After deployment, verify the Netlify published deploy's full commit, the runtime build-info response, and real `private.worker_runs` entries carrying that deploy ID. A successful app build or module import alone does not establish scheduled-worker recovery. Do not manufacture worker records or manually invoke alert delivery against ordinary recipients for verification.
