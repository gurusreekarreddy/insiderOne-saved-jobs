// A small job board: a JSON API and one page. Run with `npm start`.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { loadJobs, searchJobs } from "./lib/jobs.js";
import { saveJob, removeJob, listSaved } from "./lib/saved.js";

const PORT = Number(process.env.PORT ?? 3000);

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

// Read and parse a JSON request body. Rejects malformed bodies.
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      try {
        resolve(raw === "" ? {} : JSON.parse(raw));
      } catch (err) {
        reject(new Error("Malformed JSON body"));
      }
    });
    req.on("error", reject);
  });
}

export function createApp() {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (req.method === "GET" && url.pathname === "/api/jobs") {
        const jobs = await loadJobs();
        return sendJson(res, 200, searchJobs(jobs, url.searchParams.get("q")));
      }
      if (req.method === "POST" && url.pathname === "/api/saved") {
        let body;
        try {
          body = await readBody(req);
        } catch {
          return sendJson(res, 400, { error: "Invalid request body" });
        }
        const result = await saveJob(body?.jobId);
        return sendJson(res, result.status, result);
      }
      if (req.method === "GET" && url.pathname === "/api/saved") {
        const savedIds = await listSaved();
        const jobs = await loadJobs();
        const details = savedIds
          .map((id) => jobs.find((j) => j.id === id))
          .filter(Boolean);
        return sendJson(res, 200, { saved: details });
      }
      if (req.method === "DELETE" && url.pathname.startsWith("/api/saved/")) {
        const jobId = decodeURIComponent(url.pathname.slice("/api/saved/".length));
        const result = await removeJob(jobId);
        return sendJson(res, result.status, result);
      }
      if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/app.js")) {
        const file = url.pathname === "/" ? "index.html" : "app.js";
        const type = file.endsWith(".html") ? "text/html" : "text/javascript";
        const body = await readFile(new URL(`./public/${file}`, import.meta.url));
        res.writeHead(200, { "content-type": `${type}; charset=utf-8` });
        return res.end(body);
      }
      sendJson(res, 404, { error: "Not found" });
    } catch (err) {
      console.error(err);
      sendJson(res, 500, { error: "Something went wrong" });
    }
  });
}

// Started directly (npm start), not imported by a test.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createApp().listen(PORT, () => console.log(`Job board on http://localhost:${PORT}`));
}
