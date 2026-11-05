import { test } from "node:test";
import assert from "node:assert/strict";
import { findJob, loadJobs, searchJobs } from "../lib/jobs.js";

test("loads the jobs file", async () => {
  const jobs = await loadJobs();
  assert.ok(jobs.length >= 8);
  assert.ok(jobs.every((j) => j.id && j.title));
});

test("search matches title, company and place, ignoring case", async () => {
  const jobs = await loadJobs();
  assert.deepEqual(searchJobs(jobs, "intern").length, jobs.length);
  assert.deepEqual(searchJobs(jobs, "REMOTE").map((j) => j.id), ["j1", "j3", "j6", "j8"]);
  assert.deepEqual(searchJobs(jobs, "kosha").map((j) => j.id), ["j4"]);
  assert.equal(searchJobs(jobs, "").length, jobs.length);
});

test("findJob returns null for an unknown id", async () => {
  const jobs = await loadJobs();
  assert.equal(findJob(jobs, "j2").company, "Kite Learning");
  assert.equal(findJob(jobs, "nope"), null);
});
