import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server.js";
import { readFile, writeFile, unlink, readdir, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Isolated temp storage file: tests never touch the real saved.json.
const STORAGE = join(tmpdir(), `job-board-saved-test-${process.pid}.json`);
process.env.SAVED_STORAGE_PATH = STORAGE;

async function resetStorage(ids = []) {
  await writeFile(STORAGE, JSON.stringify(ids), "utf8");
}

async function startServer() {
  const app = createApp();
  await new Promise((resolve) => app.listen(0, resolve));
  const port = app.address().port;
  return { app, base: `http://localhost:${port}` };
}

async function request(base, method, path, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers["content-type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${base}${path}`, opts);
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await res.json() : await res.text();
  return { status: res.status, body: data };
}

test("saves a valid job and persists it", async () => {
  await resetStorage();
  const { app, base } = await startServer();
  try {
    const res = await request(base, "POST", "/api/saved", { jobId: "j1" });
    assert.equal(res.status, 201);
    assert.equal(res.body.message, "Saved");
    assert.ok(res.body.saved.includes("j1"));

    const raw = await readFile(STORAGE, "utf8");
    assert.deepEqual(JSON.parse(raw), ["j1"]);
  } finally {
    app.close();
  }
});

test("retrieves saved jobs with meaningful details", async () => {
  await resetStorage(["j1", "j2"]);
  const { app, base } = await startServer();
  try {
    const res = await request(base, "GET", "/api/saved");
    assert.equal(res.status, 200);
    assert.equal(res.body.saved.length, 2);
    assert.equal(res.body.saved[0].id, "j1");
    assert.equal(res.body.saved[0].title, "Data Analyst Intern");
    assert.equal(res.body.saved[1].id, "j2");
  } finally {
    app.close();
  }
});

test("removes a saved job", async () => {
  await resetStorage(["j1", "j2"]);
  const { app, base } = await startServer();
  try {
    const res = await request(base, "DELETE", "/api/saved/j1");
    assert.equal(res.status, 200);
    assert.equal(res.body.message, "Removed");
    assert.deepEqual(res.body.saved, ["j2"]);

    const get = await request(base, "GET", "/api/saved");
    assert.equal(get.body.saved.length, 1);
    assert.equal(get.body.saved[0].id, "j2");
  } finally {
    app.close();
  }
});

test("prevents duplicate saves", async () => {
  await resetStorage();
  const { app, base } = await startServer();
  try {
    const first = await request(base, "POST", "/api/saved", { jobId: "j3" });
    assert.equal(first.status, 201);

    const second = await request(base, "POST", "/api/saved", { jobId: "j3" });
    assert.equal(second.status, 200);
    assert.equal(second.body.message, "Already saved");
    assert.deepEqual(second.body.saved, ["j3"]);

    const raw = await readFile(STORAGE, "utf8");
    assert.deepEqual(JSON.parse(raw), ["j3"]);
  } finally {
    app.close();
  }
});

test("concurrent saves for different jobs do not lose updates", async () => {
  await resetStorage();
  const { app, base } = await startServer();
  try {
    const [res1, res2] = await Promise.all([
      request(base, "POST", "/api/saved", { jobId: "j1" }),
      request(base, "POST", "/api/saved", { jobId: "j2" }),
    ]);
    const statuses = [res1.status, res2.status].sort();
    assert.deepEqual(statuses, [201, 201]);

    const raw = await readFile(STORAGE, "utf8");
    const saved = JSON.parse(raw);
    assert.deepEqual(saved.sort(), ["j1", "j2"]);
  } finally {
    app.close();
  }
});

test("rejects unknown job ids", async () => {
  await resetStorage();
  const { app, base } = await startServer();
  try {
    const res = await request(base, "POST", "/api/saved", { jobId: "nope" });
    assert.equal(res.status, 404);
    assert.equal(res.body.error, "Unknown job id");

    const del = await request(base, "DELETE", "/api/saved/nope");
    assert.equal(del.status, 404);
  } finally {
    app.close();
  }
});

test("rejects empty or malformed requests", async () => {
  await resetStorage();
  const { app, base } = await startServer();
  try {
    const a = await request(base, "POST", "/api/saved", {});
    assert.equal(a.status, 400);

    const b = await request(base, "POST", "/api/saved", { jobId: "" });
    assert.equal(b.status, 400);

    const rawRes = await fetch(`${base}/api/saved`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    assert.equal(rawRes.status, 400);
  } finally {
    app.close();
  }
});

test("returns an empty saved list when nothing is saved", async () => {
  await resetStorage([]);
  const { app, base } = await startServer();
  try {
    const res = await request(base, "GET", "/api/saved");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.saved, []);
  } finally {
    app.close();
  }
});

test("saved jobs survive a server restart", async () => {
  await resetStorage();
  const s1 = await startServer();
  const save = await request(s1.base, "POST", "/api/saved", { jobId: "j6" });
  assert.equal(save.status, 201);
  s1.app.close();

  const s2 = await startServer();
  try {
    const get = await request(s2.base, "GET", "/api/saved");
    assert.equal(get.status, 200);
    assert.deepEqual(get.body.saved.map((j) => j.id), ["j6"]);
  } finally {
    s2.app.close();
  }
});

test("failed operations do not corrupt stored data", async () => {
  await resetStorage(["j1"]);
  const { app, base } = await startServer();
  try {
    const bad = await request(base, "POST", "/api/saved", { jobId: "ghost" });
    assert.equal(bad.status, 404);

    const raw = await readFile(STORAGE, "utf8");
    assert.deepEqual(JSON.parse(raw), ["j1"]);
  } finally {
    app.close();
  }
});

test("delete of a not-saved id returns 404 without corruption", async () => {
  await resetStorage(["j1"]);
  const { app, base } = await startServer();
  try {
    const res = await request(base, "DELETE", "/api/saved/j9");
    assert.equal(res.status, 404);

    const raw = await readFile(STORAGE, "utf8");
    assert.deepEqual(JSON.parse(raw), ["j1"]);
  } finally {
    app.close();
  }
});

test("corrupted storage file is preserved (not silently replaced)", async () => {
  await writeFile(STORAGE, "{not valid json", "utf8");
  const { app, base } = await startServer();
  try {
    const res = await request(base, "POST", "/api/saved", { jobId: "j1" });
    assert.equal(res.status, 500);
    assert.equal(res.body.error, "Saved data storage is corrupted");

    // The original corrupted file must be preserved (renamed to .corrupt.*),
    // not deleted or silently overwritten with an empty list.
    const entries = await readdir(tmpdir());
    const prefix = `job-board-saved-test-${process.pid}.json`;
    const corruptEntries = entries.filter((e) => e.startsWith(prefix + ".corrupt."));
    assert.ok(corruptEntries.length >= 1, "Expected a preserved .corrupt file in tmpdir");

    // The original .json path should no longer exist (it was renamed away).
    let originalExists = false;
    try {
      await access(STORAGE);
      originalExists = true;
    } catch {
      originalExists = false;
    }
    assert.equal(originalExists, false);
  } finally {
    app.close();
  }
});

test("non-array storage file is preserved (not silently replaced)", async () => {
  await writeFile(STORAGE, JSON.stringify({ not: "an array" }), "utf8");
  const { app, base } = await startServer();
  try {
    const res = await request(base, "POST", "/api/saved", { jobId: "j1" });
    assert.equal(res.status, 500);
    assert.equal(res.body.error, "Saved data storage is corrupted");

    // The original non-array file must be preserved (renamed to .corrupt.*).
    const entries = await readdir(tmpdir());
    const prefix = `job-board-saved-test-${process.pid}.json`;
    const corruptEntries = entries.filter((e) => e.startsWith(prefix + ".corrupt."));
    assert.ok(corruptEntries.length >= 1, "Expected a preserved .corrupt file in tmpdir");

    // The original .json path should no longer exist (it was renamed away).
    let originalExists = false;
    try {
      await access(STORAGE);
      originalExists = true;
    } catch {
      originalExists = false;
    }
    assert.equal(originalExists, false);
  } finally {
    app.close();
  }
});

// Clean up the temp storage file after all tests.
test.after(async () => {
  try {
    await unlink(STORAGE);
  } catch {
    // ignore if already removed
  }
});
