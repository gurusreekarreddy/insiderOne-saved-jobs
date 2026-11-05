// Saved-jobs logic: validation, duplicate handling, and JSON persistence.
// Kept in one small module so the server stays thin and this is easy to test.
import { readFile, writeFile, rename } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { loadJobs } from "./jobs.js";

const DEFAULT_STORAGE_PATH = new URL("../saved.json", import.meta.url);

// Serializes read-modify-write cycles so concurrent save/remove requests
// cannot interleave and lose each other's updates (lost-update race).
let writeChain = Promise.resolve();

function serializedWrite(operation) {
  const previous = writeChain;
  const result = previous.then(operation);
  writeChain = result.catch(() => {}); // prevent unhandled rejection in the chain
  return result;
}

function storagePath() {
  const p = process.env.SAVED_STORAGE_PATH;
  return p ? pathToFileURL(p) : DEFAULT_STORAGE_PATH;
}

class SavedStorageError extends Error {
  constructor(message) {
    super(message);
    this.name = "SavedStorageError";
  }
}

function validateJobId(jobId) {
  if (typeof jobId !== "string" || jobId.trim() === "") {
    return { ok: false, error: "jobId must be a non-empty string" };
  }
  return { ok: true, jobId: jobId.trim() };
}

// Read the saved-jobs file. Missing file -> empty list.
// Invalid/unreadable file -> preserve the original, log clearly, and throw.
// Never silently replace corrupted data with an empty list.
async function readSaved() {
  const sp = storagePath();
  try {
    const raw = await readFile(sp, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new SavedStorageError("Saved data storage is not an array");
    }
    return parsed;
  } catch (err) {
    if (err.code === "ENOENT") return [];
    // File exists but is unreadable / invalid JSON: preserve it.
    try {
      const ts = Date.now();
      const corruptPath = sp.pathname + ".corrupt." + ts;
      await rename(sp, corruptPath);
      console.error(
        `Saved jobs storage corrupted (${sp.pathname}); preserved as ${corruptPath}: ${err.message}`
      );
    } catch (renameErr) {
      console.error(
        `Failed to read saved jobs and could not preserve corrupted file: ${err.message}; rename error: ${renameErr.message}`
      );
    }
    throw new SavedStorageError("Saved data storage is corrupted");
  }
}

// Atomic write: write to a temp file, then rename over the real file.
// A write failure leaves the original saved file untouched.
async function writeSaved(saved) {
  const sp = storagePath();
  const tmp = new URL(sp.href + ".tmp");
  await writeFile(tmp, JSON.stringify(saved, null, 2), "utf8");
  await rename(tmp, sp);
}

// Return the list of saved job ids.
export async function listSaved() {
  return readSaved();
}

// Save a job. Validates input, confirms the job exists, prevents duplicates.
// The read-modify-write cycle is serialized against concurrent calls.
export async function saveJob(jobId) {
  const validation = validateJobId(jobId);
  if (!validation.ok) {
    return { status: 400, error: validation.error };
  }
  const id = validation.jobId;

  const jobs = await loadJobs();
  if (!jobs.some((j) => j.id === id)) {
    return { status: 404, error: "Unknown job id" };
  }

  return serializedWrite(async () => {
    try {
      const saved = await readSaved();
      if (saved.includes(id)) {
        return { status: 200, saved, message: "Already saved" };
      }
      saved.push(id);
      await writeSaved(saved);
      return { status: 201, saved, message: "Saved" };
    } catch (err) {
      if (err instanceof SavedStorageError) {
        return { status: 500, error: "Saved data storage is corrupted" };
      }
      throw err;
    }
  });
}

// Remove a saved job. Handles "not currently saved" safely.
// The read-modify-write cycle is serialized against concurrent calls.
export async function removeJob(jobId) {
  const validation = validateJobId(jobId);
  if (!validation.ok) {
    return { status: 400, error: validation.error };
  }
  const id = validation.jobId;

  return serializedWrite(async () => {
    try {
      const saved = await readSaved();
      const index = saved.indexOf(id);
      if (index === -1) {
        return { status: 404, error: "Not currently saved" };
      }
      saved.splice(index, 1);
      await writeSaved(saved);
      return { status: 200, saved, message: "Removed" };
    } catch (err) {
      if (err instanceof SavedStorageError) {
        return { status: 500, error: "Saved data storage is corrupted" };
      }
      throw err;
    }
  });
}
