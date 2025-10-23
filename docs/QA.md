# LiveRC Import QA checklist

> Run these steps inside the dev VM. Commands are copy/paste ready; leave the dev server running while executing the checks.

## Prep (once per session)

- [ ] Start Postgres (skip if already running):
  ```bash
  docker run -d --name mre-postgres \
    -e POSTGRES_USER=pacetracer \
    -e POSTGRES_PASSWORD=change-me \
    -e POSTGRES_DB=pacetracer \
    -p 5432:5432 \
    -v mre-pgdata:/var/lib/postgresql/data \
    postgres:16
  ```
- [ ] Install deps, copy env template, and generate Prisma client:
  ```bash
  cd /workspace/My-Race-Engineer
  npm ci
  cp -n .env.example .env || true
  npx prisma generate
  npx prisma migrate dev --name qa-prep
  ```
- [ ] Enable importer flags (JSON wizard defaults to enabled, ensure resolver & file upload are on):
  ```bash
  sed -i 's/^ENABLE_IMPORT_WIZARD=.*/ENABLE_IMPORT_WIZARD=1/' .env
  sed -i 's/^ENABLE_LIVERC_RESOLVER=.*/ENABLE_LIVERC_RESOLVER=1/' .env
  sed -i 's/^ENABLE_IMPORT_FILE=.*/ENABLE_IMPORT_FILE=1/' .env
  ```
  To reset after QA:
  ```bash
  sed -i 's/^ENABLE_IMPORT_WIZARD=.*/ENABLE_IMPORT_WIZARD=0/' .env
  sed -i 's/^ENABLE_LIVERC_RESOLVER=.*/ENABLE_LIVERC_RESOLVER=0/' .env
  sed -i 's/^ENABLE_IMPORT_FILE=.*/ENABLE_IMPORT_FILE=0/' .env
  ```
- [ ] Launch the dev server (keep it running in its own terminal):
  ```bash
  npm run dev
  ```

## Scenarios

1. [ ] **Connector import plan succeeds**
   1. Export one or more LiveRC `eventRef` identifiers (e.g., from discovery results).
      ```bash
      export LIVERC_EVENT_REF="2024-gnats-pro-buggy"
      ```
   2. Trigger the connector plan endpoint and confirm a `200` with plan payload:
      ```bash
      curl -sS -w '\nHTTP %{http_code}\n' \
        -H 'Content-Type: application/json' \
        -d "{\"events\":[{\"eventRef\":\"${LIVERC_EVENT_REF}\"}]}" \
        http://localhost:3001/api/connectors/liverc/import/plan | tee /tmp/liverc-plan.json
      ```
      Expect `HTTP 200` and a `data.planId`.

2. [ ] **Connector apply enqueues a job**
   1. Reuse the `planId` from `/tmp/liverc-plan.json`.
      ```bash
      PLAN_ID=$(jq -r '.data.planId' /tmp/liverc-plan.json)
      ```
   2. Apply the plan and confirm a `202` response with a job identifier:
      ```bash
      curl -sS -w '\nHTTP %{http_code}\n' \
        -H 'Content-Type: application/json' \
        -d "{\"planId\":\"${PLAN_ID}\"}" \
        http://localhost:3001/api/connectors/liverc/import/apply | tee /tmp/liverc-apply.json
      ```
      Expect `HTTP 202` and a `data.jobId`.

3. [ ] **Job status exposes progress**
   1. Query the job endpoint using the job identifier from `/tmp/liverc-apply.json`:
      ```bash
      JOB_ID=$(jq -r '.data.jobId' /tmp/liverc-apply.json)
      curl -sS -w '\nHTTP %{http_code}\n' \
        http://localhost:3001/api/connectors/liverc/jobs/${JOB_ID}
      ```
      Expect `HTTP 200` with progress metrics that update as the importer runs.

4. [ ] **Bookmarklet prefill works (manual)**
   1. Copy the bookmarklet link target from the card on `/import`.
   2. Visit any LiveRC race page, paste the bookmarklet into the address bar, and confirm `/import` opens with the race URL pre-filled in the single-link input for downstream connector workflows.

- Clear importer flags after QA if needed (run the reset block above) and stop background services. Stop the dev server with `Ctrl+C` in its terminal, then:
  ```bash
  docker stop mre-postgres && docker rm mre-postgres
  ```
