# Job board starter

A small job board for an insiderOne work sample. It is made up: the jobs and
companies are not real.

## Run it

You need Node 20 or newer. There are no packages to install.

```
npm start      # then open http://localhost:3000
npm test       # runs the tests in test/
```

## What is here

- `server.js`: the web server. `GET /api/jobs?q=` lists jobs, `GET /` serves the page.
- `lib/jobs.js`: reading and searching the jobs. Pure functions.
- `jobs.json`: the jobs.
- `public/`: the page and its script.
- `test/`: tests, using Node's built-in test runner.

## Your task

See the work sample brief on insiderOne: add saved jobs (save, list, remove),
with tests, and add a short section to this README about what you built.

---

## What I built

Added a **Saved Jobs** feature to the job board so students can save jobs they
like and revisit them later.

- Every job listing gets a **Save** button. Once saved, the button shows
  "Saved" (disabled) so it's clear the job is already saved.
- A **Saved jobs** section on the same page lists the saved jobs with their
  title, company, location, and stipend, each with a **Remove** button.
- The list updates after saving or removing without reloading the page, and
  shows a meaningful empty state ("You haven't saved any jobs yet.") when nothing is saved.
- The UI stays in sync with the server, which is the source of truth.

API:
- `POST /api/saved` with `{ "jobId": "..." }` — saves a job (201), or reports
  "Already saved" (200) for duplicates.
- `GET /api/saved` — returns saved jobs with full details (200), empty array when none.
- `DELETE /api/saved/:jobId` — removes a saved job (200).

## How to run

You need Node 20 or newer. There are no packages to install.

```
npm start      # then open http://localhost:3000
npm test       # runs the tests in test/
```

The server stores saved jobs in `saved.json` in the project folder, so they
survive browser reloads and server restarts.

## How to test

```
npm test
```

Uses Node's built-in test runner (`node --test`, no extra frameworks). The
suite covers: saving a valid job, retrieving saved jobs with details, removing
a saved job, duplicate-save prevention, unknown job IDs, empty/malformed
requests, an empty saved list, persistence across server restart, and that
failed operations do not corrupt stored data. The original job tests still pass.

## Engineering decision

I kept the saved jobs in a single JSON file (`saved.json`) and wrote to it
atomically: the data is first written to a temporary file (`saved.json.tmp`)
and then renamed over the real file. A write failure therefore never leaves a
half-written or corrupt `saved.json`, and the existing data stays intact. I
chose this over keeping state only in memory because the brief requires saved
jobs to survive server restarts, and it avoids adding a database.

Two additional safeguards were added:

- **Write lock:** save and remove operations are serialized through an
  in-memory write queue. Without it, two rapid concurrent requests for
  different jobs could interleave their read-modify-write cycles and one
  update would be silently lost.
- **Corrupted storage:** if `saved.json` contains invalid JSON, the original
  file is renamed to `saved.json.corrupt.<timestamp>` (never deleted or
  silently replaced), the corruption is logged, and the API returns a
  controlled 500 error rather than starting over with an empty list.

The storage path can be overridden with the `SAVED_STORAGE_PATH` environment
variable so tests run against a temporary file and never touch the real
`saved.json`.

## What I would do next

- Add client-side loading/error states (toasts or inline messages) instead of
  `alert()` for save/remove failures.
- Persist per-user saved jobs (currently it's a single shared list; the brief
  doesn't require accounts).
- Add tests that exercise concurrent save/remove requests to confirm the
  atomic write holds up under load.
- Show the saved/unsaved state immediately on the job card without waiting for
  a round-trip (optimistic UI), rolling back on error.

## AI assistance disclosure

This work sample was developed with help from OpenCode (Nemotron model). OpenCode
assisted by: inspecting the starter, suggesting the implementation plan, writing
the `lib/saved.js` persistence module, wiring the API routes into `server.js`,
updating `public/app.js` and `public/index.html`, authoring the test suite in
`test/saved.test.js`, and drafting the README sections. I reviewed every file,
ran the test suite and the manual browser flow myself, fixed a storage-path bug
and a button-state ordering bug found during verification, and made the final
engineering decisions. No personal identifying information is included.
