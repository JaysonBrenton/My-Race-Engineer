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
- [ ] Enable importer flags (JSON wizard, resolver, file upload):
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
1. [ ] **Single URL import success**
   1. Pick a LiveRC JSON results URL (four slug segments) and export it:
      ```bash
export LIVERC_JSON_URL="https://liverc.com/results/<event>/<class>/<round>/<race>.json"
      ```
   2. Trigger the API and confirm a `202` with summary payload:
      ```bash
curl -sS -w '\nHTTP %{http_code}\n' \
  -H 'Content-Type: application/json' \
  -d "{\"url\":\"${LIVERC_JSON_URL}\"}" \
  http://localhost:3001/api/liverc/import | tee /tmp/import-single.json
      ```
      Expect `HTTP 202` and a `data` object in `/tmp/import-single.json`.

2. [ ] **HTML URL shows “Needs resolving”**
   1. Hit the API with a legacy HTML link and expect `UNSUPPORTED_URL`:
      ```bash
curl -sS -w '\nHTTP %{http_code}\n' \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://liverc.com/results/?p=view_race_result&id=12345"}' \
  http://localhost:3001/api/liverc/import
      ```
   2. In a browser tab (with the dev server still running) open:
      ```text
http://localhost:3001/import?src=https%3A%2F%2Fliverc.com%2Fresults%2F%3Fp%3Dview_race_result%26id%3D12345
      ```
      Confirm the preview card renders the **“Needs resolving”** badge and resolver tips.

3. [ ] **Bulk paste: mixed inputs**
   1. Prepare sample inputs (JSON, HTML, invalid) to copy:
      ```bash
cat <<'URLS'
https://liverc.com/results/example-series/pro-buggy/round-3/a-main
https://liverc.com/results/?p=view_race_result&id=999
not-a-url
URLS
      ```
   2. In the importer UI, switch to the **Bulk** tab, paste the three lines, and verify rows classify as JSON/Needs resolving/Invalid with proper status chips.

4. [ ] **History chips appear**
   1. Open the importer wizard and step through using the same host/class multiple times (reuse the value from `LIVERC_JSON_URL`).
   2. Reopen the wizard and confirm the host & class steps render the recent-value chip buttons (history suggestions).

5. [ ] **Wizard enabled → composes a URL that imports**
   1. Launch the wizard, enter the host and each slug from `${LIVERC_JSON_URL}`.
   2. Click **Send to form**, then submit the generated URL.
   3. Re-run the single import curl with the wizard-produced URL (stored under **History**) and confirm another `HTTP 202`.

6. [ ] **Bookmarklet prefill works (manual)**
   1. Copy the bookmarklet link target from the card on `/import`.
   2. Visit any LiveRC race page, paste the bookmarklet into the address bar, and confirm `/import` opens with the race URL pre-filled in the single-link input.

7. [ ] **(If enabled) File drop imports via `/api/liverc/import-file`**
   1. Post the bundled fixture payload to the file-import endpoint:
      ```bash
curl -sS -w '\nHTTP %{http_code}\n' \
  -H 'Content-Type: application/json' \
  --data-binary @fixtures/liverc/results/sample-event/sample-class/race-result.json \
  http://localhost:3001/api/liverc/import-file | tee /tmp/import-file.json
      ```
      Expect `HTTP 202` with a summary under `data`.
   2. In the UI, drop the same JSON file onto the upload dropzone and verify the summary panel matches the API response.

- Clear importer flags after QA if needed (run the reset block above) and stop background services. Stop the dev server with `Ctrl+C` in its terminal, then:
  ```bash
docker stop mre-postgres && docker rm mre-postgres
  ```
