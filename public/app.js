const jobList = document.getElementById("jobs");
const search = document.getElementById("search");
const savedList = document.getElementById("saved-list");
const savedEmpty = document.getElementById("saved-empty");

// Saved jobs, kept in sync with the server (source of truth).
let savedJobs = [];
let savedIds = new Set();

function jobText(job) {
  return `${job.title} at ${job.company}, ${job.location}. Rs ${job.stipend.toLocaleString("en-IN")} a month.`;
}

// Fetch saved jobs from the server and re-render both lists.
async function loadSaved() {
  const res = await fetch("/api/saved");
  const body = await res.json();
  savedJobs = body.saved || [];
  savedIds = new Set(savedJobs.map((j) => j.id));
  renderSaved();
}

// Render the job list, marking already-saved jobs.
async function show(query = "") {
  const res = await fetch(`/api/jobs?q=${encodeURIComponent(query)}`);
  const jobs = await res.json();
  jobList.innerHTML = "";
  for (const job of jobs) {
    const li = document.createElement("li");
    const text = document.createElement("span");
    text.textContent = jobText(job);

    const btn = document.createElement("button");
    btn.type = "button";
    if (savedIds.has(job.id)) {
      // Already saved: show state, no-op on click (remove is via the Saved jobs section).
      btn.textContent = "Saved";
      btn.disabled = true;
    } else {
      btn.textContent = "Save";
      btn.addEventListener("click", () => addSaved(job.id));
    }
    btn.dataset.jobId = job.id;

    li.append(text, btn);
    jobList.append(li);
  }
}

// Render the saved-jobs section with Remove buttons and an empty state.
function renderSaved() {
  savedList.innerHTML = "";
  if (savedJobs.length === 0) {
    savedEmpty.hidden = false;
    return;
  }
  savedEmpty.hidden = true;
  for (const job of savedJobs) {
    const li = document.createElement("li");
    const text = document.createElement("span");
    text.textContent = jobText(job);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Remove";
    btn.dataset.jobId = job.id;
    btn.addEventListener("click", () => removeSaved(job.id));

    li.append(text, btn);
    savedList.append(li);
  }
}

async function addSaved(jobId) {
  const res = await fetch("/api/saved", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jobId }),
  });
  const body = await res.json();
  if (res.ok) {
    await loadSaved(); // server is source of truth
    show(search.value);
  } else {
    alert(body.error || "Could not save job");
  }
}

async function removeSaved(jobId) {
  const res = await fetch(`/api/saved/${encodeURIComponent(jobId)}`, {
    method: "DELETE",
  });
  const body = await res.json();
  if (res.ok) {
    await loadSaved();
    show(search.value);
  } else {
    alert(body.error || "Could not remove job");
  }
}

search.addEventListener("input", () => show(search.value));

async function init() {
  await loadSaved();
  await show();
}
init();
