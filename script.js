/* ================================================================
   Phoenix-4 replica diagnosis — frontend logic
   ================================================================ */

// ----------------------------------------------------------------
// Reason code catalogue — single source of truth
// Ported 1:1 from the Python backend's reason_codes.py
// ----------------------------------------------------------------

const SEVERITY = { BLOCKING: "blocking", WARNING: "warning" };

const REASON_CODES = {
  // Step 1 — Consent
  NO_CONSENT_STATEMENT: {
    code: "NO_CONSENT_STATEMENT",
    category: "consent",
    severity: SEVERITY.BLOCKING,
    customer_message: "We could not find a spoken consent statement in your video.",
    fix_action: "Re-record and read the full consent script at the start of the video.",
  },
  PARTIAL_CONSENT: {
    code: "PARTIAL_CONSENT",
    category: "consent",
    severity: SEVERITY.BLOCKING,
    customer_message: "Your consent statement was detected but is missing required phrases.",
    fix_action: "Re-record reading the complete consent script word for word.",
  },
  CONSENT_INAUDIBLE: {
    code: "CONSENT_INAUDIBLE",
    category: "consent",
    severity: SEVERITY.BLOCKING,
    customer_message: "The consent statement was too quiet or unclear to verify.",
    fix_action: "Re-record the consent statement clearly in a quiet environment.",
  },
  // Step 2 — Talking duration
  TALKING_TOO_SHORT: {
    code: "TALKING_TOO_SHORT",
    category: "speech",
    severity: SEVERITY.BLOCKING,
    customer_message: "Your video does not contain enough active speech for training.",
    fix_action: "Record at least 2 minutes of continuous talking.",
  },
  INSUFFICIENT_SPEECH_VARIETY: {
    code: "INSUFFICIENT_SPEECH_VARIETY",
    category: "speech",
    severity: SEVERITY.WARNING,
    customer_message: "Your speech sample is repetitive and may produce a lower-quality replica.",
    fix_action: "Read varied sentences covering different sounds and expressions.",
  },
  // Step 3 — Silence
  TOO_MUCH_SILENCE: {
    code: "TOO_MUCH_SILENCE",
    category: "speech",
    severity: SEVERITY.BLOCKING,
    customer_message: "Too much of your video is silent.",
    fix_action: "Reduce dead air and keep talking continuously through the recording.",
  },
  LONG_PAUSES_DETECTED: {
    code: "LONG_PAUSES_DETECTED",
    category: "speech",
    severity: SEVERITY.WARNING,
    customer_message: "There are unusually long pauses in your speech.",
    fix_action: "Speak at a steady pace without long pauses between sentences.",
  },
  // Step 4 — File size
  FILE_TOO_SMALL: {
    code: "FILE_TOO_SMALL",
    category: "technical",
    severity: SEVERITY.BLOCKING,
    customer_message: "Your uploaded file is too small to contain a usable training video.",
    fix_action: "Re-export the video with higher bitrate or check that the upload completed.",
  },
  FILE_TOO_LARGE: {
    code: "FILE_TOO_LARGE",
    category: "technical",
    severity: SEVERITY.BLOCKING,
    customer_message: "Your uploaded file exceeds the maximum allowed size.",
    fix_action: "Re-export at a lower bitrate or trim the video length.",
  },
  // Step 5 — Codec
  UNSUPPORTED_CODEC: {
    code: "UNSUPPORTED_CODEC",
    category: "technical",
    severity: SEVERITY.BLOCKING,
    customer_message: "Your video uses a codec we cannot process.",
    fix_action: "Re-encode the video to H.264 or H.265 (MP4 container).",
  },
  CORRUPT_STREAM: {
    code: "CORRUPT_STREAM",
    category: "technical",
    severity: SEVERITY.BLOCKING,
    customer_message: "The video stream could not be decoded.",
    fix_action: "Re-export the file from your editor and upload again.",
  },
  // Step 6 — Source type
  AI_GENERATED_DETECTED: {
    code: "AI_GENERATED_DETECTED",
    category: "authenticity",
    severity: SEVERITY.BLOCKING,
    customer_message: "Your training video appears to be AI-generated, which is not allowed.",
    fix_action: "Submit footage of a real human filmed on a camera.",
  },
  DEEPFAKE_DETECTED: {
    code: "DEEPFAKE_DETECTED",
    category: "authenticity",
    severity: SEVERITY.BLOCKING,
    customer_message: "We detected deepfake or face-swap artifacts in your video.",
    fix_action: "Submit unmodified footage of yourself.",
  },
  // Step 7 — Face & lip
  LIP_SYNC_MISMATCH: {
    code: "LIP_SYNC_MISMATCH",
    category: "framing",
    severity: SEVERITY.BLOCKING,
    customer_message: "Your lip movement does not match the audio track.",
    fix_action: "Re-record with the camera capturing your face while you speak (no dubbing).",
  },
  FACE_PARTIALLY_OCCLUDED: {
    code: "FACE_PARTIALLY_OCCLUDED",
    category: "framing",
    severity: SEVERITY.BLOCKING,
    customer_message: "Your face is partially covered (by hands, hair, mask, or objects).",
    fix_action: "Keep your full face visible and unobstructed throughout the recording.",
  },
  FACE_OUT_OF_FRAME: {
    code: "FACE_OUT_OF_FRAME",
    category: "framing",
    severity: SEVERITY.BLOCKING,
    customer_message: "Your face moves out of the frame during the video.",
    fix_action: "Stay centered in the frame for the entire recording.",
  },
  SECOND_PERSON_DETECTED: {
    code: "SECOND_PERSON_DETECTED",
    category: "framing",
    severity: SEVERITY.BLOCKING,
    customer_message: "A second person was detected in your training video.",
    fix_action: "Record alone with no one else visible in the frame.",
  },
  // Step 8 — Resolution
  RESOLUTION_TOO_LOW: {
    code: "RESOLUTION_TOO_LOW",
    category: "resolution",
    severity: SEVERITY.BLOCKING,
    customer_message: "Your video resolution is too low for training.",
    fix_action: "Re-record at 1080p (1920x1080) or higher.",
  },
  INVALID_ASPECT_RATIO: {
    code: "INVALID_ASPECT_RATIO",
    category: "resolution",
    severity: SEVERITY.WARNING,
    customer_message: "Your video has an unusual aspect ratio.",
    fix_action: "Record in 16:9 landscape orientation.",
  },
};

// ----------------------------------------------------------------
// Detector definitions — order matters, this is the pipeline order
// ----------------------------------------------------------------

const DETECTORS = [
  { id: "consent",          name: "Consent statement",       simulated: true  },
  { id: "talking_duration", name: "Talking segment duration", simulated: true  },
  { id: "silence",          name: "Silent segments",          simulated: true  },
  { id: "file_size",        name: "File size",                simulated: false },
  { id: "codec",            name: "Video codec",              simulated: false },
  { id: "source_type",      name: "Source type (real/AI)",    simulated: true  },
  { id: "face_lip",         name: "Face &amp; lip checks",    simulated: true  },
  { id: "resolution",       name: "Resolution &amp; aspect",  simulated: false },
];

// Thresholds — match the Python backend
const MIN_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE_MB = 2048;
const MIN_WIDTH = 1920;
const MIN_HEIGHT = 1080;
const TARGET_ASPECT = 16 / 9;
const ASPECT_TOLERANCE = 0.1;
const SUPPORTED_MIMES = ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"];

// ----------------------------------------------------------------
// Real detectors — these run on the actual uploaded file
// ----------------------------------------------------------------

function checkFileSize(file) {
  const findings = [];
  const sizeMb = file.size / (1024 * 1024);
  if (sizeMb < MIN_FILE_SIZE_MB) {
    findings.push({
      ...REASON_CODES.FILE_TOO_SMALL,
      evidence: { size_mb: sizeMb.toFixed(2), minimum_mb: MIN_FILE_SIZE_MB },
    });
  } else if (sizeMb > MAX_FILE_SIZE_MB) {
    findings.push({
      ...REASON_CODES.FILE_TOO_LARGE,
      evidence: { size_mb: sizeMb.toFixed(2), maximum_mb: MAX_FILE_SIZE_MB },
    });
  }
  return findings;
}

function checkCodec(file) {
  const findings = [];
  if (!file.type || !SUPPORTED_MIMES.includes(file.type)) {
    findings.push({
      ...REASON_CODES.UNSUPPORTED_CODEC,
      evidence: { detected_type: file.type || "unknown", supported: SUPPORTED_MIMES },
    });
  }
  return findings;
}

function checkResolution(meta) {
  const findings = [];
  if (meta.width < MIN_WIDTH || meta.height < MIN_HEIGHT) {
    findings.push({
      ...REASON_CODES.RESOLUTION_TOO_LOW,
      evidence: { width: meta.width, height: meta.height, minimum: `${MIN_WIDTH}x${MIN_HEIGHT}` },
    });
  }
  if (meta.height > 0) {
    const aspect = meta.width / meta.height;
    if (Math.abs(aspect - TARGET_ASPECT) > ASPECT_TOLERANCE) {
      findings.push({
        ...REASON_CODES.INVALID_ASPECT_RATIO,
        evidence: { aspect_ratio: aspect.toFixed(3), expected: "16:9" },
      });
    }
  }
  return findings;
}

// ----------------------------------------------------------------
// Video metadata extraction (real, browser-native)
// ----------------------------------------------------------------

function readVideoMetadata(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.src = url;
    video.onloadedmetadata = () => {
      const meta = {
        width: video.videoWidth,
        height: video.videoHeight,
        duration: video.duration,
      };
      URL.revokeObjectURL(url);
      resolve(meta);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode video"));
    };
  });
}

// ----------------------------------------------------------------
// Scenario simulator — for ML-based checks the browser cannot do
// ----------------------------------------------------------------

const SCENARIOS = {
  "all-pass": {
    label: "All checks pass",
    file: { name: "training-good.mp4", sizeMb: 145, width: 1920, height: 1080, type: "video/mp4" },
    extraFindings: [],
  },
  "low-res": {
    label: "Low resolution video",
    file: { name: "phone-recording.mp4", sizeMb: 24, width: 640, height: 480, type: "video/mp4" },
    extraFindings: [],
  },
  "no-consent": {
    label: "Missing consent statement",
    file: { name: "intro-video.mp4", sizeMb: 180, width: 1920, height: 1080, type: "video/mp4" },
    extraFindings: ["NO_CONSENT_STATEMENT"],
  },
  "ai-generated": {
    label: "AI-generated source",
    file: { name: "synthetic-avatar.mp4", sizeMb: 95, width: 1920, height: 1080, type: "video/mp4" },
    extraFindings: ["AI_GENERATED_DETECTED"],
  },
  "multiple": {
    label: "Multiple issues",
    file: { name: "rough-cut.mov", sizeMb: 12, width: 1280, height: 720, type: "video/quicktime" },
    extraFindings: ["PARTIAL_CONSENT", "TOO_MUCH_SILENCE", "FACE_PARTIALLY_OCCLUDED"],
  },
};

// ----------------------------------------------------------------
// Pipeline — runs all detectors and assembles a report
// ----------------------------------------------------------------

async function runPipeline(input, scenarioFindings = []) {
  const checkListEl = document.getElementById("checkList");
  checkListEl.innerHTML = "";

  // Initialize all rows as pending
  DETECTORS.forEach((d, i) => {
    const row = document.createElement("div");
    row.className = "check-row";
    row.id = `row-${d.id}`;
    row.innerHTML = `
      <span class="num">${i + 1}</span>
      <span class="name">${d.name}</span>
      <span class="status">queued</span>
    `;
    checkListEl.appendChild(row);
  });

  const allFindings = [];

  for (const detector of DETECTORS) {
    const row = document.getElementById(`row-${detector.id}`);
    row.classList.add("running");
    row.querySelector(".status").textContent = "checking…";
    await sleep(380 + Math.random() * 220);

    let findings = [];

    if (!detector.simulated) {
      // Real check on the file metadata
      if (detector.id === "file_size") findings = checkFileSize(input.file);
      else if (detector.id === "codec") findings = checkCodec(input.file);
      else if (detector.id === "resolution") findings = checkResolution(input.meta);
    } else {
      // Simulated — pull from scenario findings if relevant
      findings = scenarioFindings
        .filter((code) => detectorOwnsCode(detector.id, code))
        .map((code) => ({ ...REASON_CODES[code], evidence: { simulated: true } }));
    }

    row.classList.remove("running");
    if (findings.length === 0) {
      row.classList.add("pass");
      row.querySelector(".status").textContent = "passed";
    } else {
      const blocking = findings.some((f) => f.severity === SEVERITY.BLOCKING);
      row.classList.add(blocking ? "fail" : "warn");
      row.querySelector(".status").textContent =
        `${findings.length} issue${findings.length > 1 ? "s" : ""}`;
    }

    allFindings.push(...findings);
  }

  return {
    video_name: input.file.name,
    findings: allFindings,
  };
}

function detectorOwnsCode(detectorId, code) {
  const ownership = {
    consent: ["NO_CONSENT_STATEMENT", "PARTIAL_CONSENT", "CONSENT_INAUDIBLE"],
    talking_duration: ["TALKING_TOO_SHORT", "INSUFFICIENT_SPEECH_VARIETY"],
    silence: ["TOO_MUCH_SILENCE", "LONG_PAUSES_DETECTED"],
    source_type: ["AI_GENERATED_DETECTED", "DEEPFAKE_DETECTED"],
    face_lip: ["LIP_SYNC_MISMATCH", "FACE_PARTIALLY_OCCLUDED", "FACE_OUT_OF_FRAME", "SECOND_PERSON_DETECTED"],
  };
  return (ownership[detectorId] || []).includes(code);
}

// ----------------------------------------------------------------
// Report rendering
// ----------------------------------------------------------------

function renderReport(report) {
  const body = document.getElementById("resultsBody");
  const badge = document.getElementById("resultsBadge");

  const blocking = report.findings.filter((f) => f.severity === SEVERITY.BLOCKING);
  const warnings = report.findings.filter((f) => f.severity === SEVERITY.WARNING);
  const isBlocking = blocking.length > 0;

  let banner;
  if (isBlocking) {
    banner = `<div class="summary-banner fail">
      <h3>Replica cannot be built</h3>
      <p>${blocking.length} blocking issue${blocking.length > 1 ? "s" : ""} must be fixed before resubmission${warnings.length ? `, plus ${warnings.length} warning${warnings.length > 1 ? "s" : ""}` : ""}.</p>
    </div>`;
    badge.textContent = "Failed";
    badge.className = "badge badge-fail";
  } else if (warnings.length) {
    banner = `<div class="summary-banner warn">
      <h3>Replica can be built — with warnings</h3>
      <p>${warnings.length} non-blocking issue${warnings.length > 1 ? "s" : ""} detected. Quality may be affected.</p>
    </div>`;
    badge.textContent = "Warnings";
    badge.className = "badge badge-warn";
  } else {
    banner = `<div class="summary-banner pass">
      <h3>All checks passed</h3>
      <p>This video meets every requirement and is ready for replica training.</p>
    </div>`;
    badge.textContent = "Passed";
    badge.className = "badge badge-pass";
  }

  let html = banner;
  html += `<p class="muted small">Video: <strong>${escapeHtml(report.video_name)}</strong> · ${report.findings.length} finding${report.findings.length === 1 ? "" : "s"}</p>`;

  if (blocking.length) {
    html += `<div class="findings-section"><h3>Blocking issues — must be fixed</h3>`;
    blocking.forEach((f) => { html += renderFinding(f); });
    html += `</div>`;
  }
  if (warnings.length) {
    html += `<div class="findings-section"><h3>Warnings — recommended</h3>`;
    warnings.forEach((f) => { html += renderFinding(f); });
    html += `</div>`;
  }

  body.innerHTML = html;
}

function renderFinding(f) {
  const evidenceStr = f.evidence
    ? Object.entries(f.evidence).map(([k, v]) => `${k}: ${v}`).join(" · ")
    : "";
  return `
    <div class="finding ${f.severity}">
      <div class="finding-head">
        <span class="finding-code">${f.code}</span>
        <span class="finding-category">${f.category}</span>
      </div>
      <div class="finding-message">${escapeHtml(f.customer_message)}</div>
      <div class="finding-fix"><strong>Fix:</strong> ${escapeHtml(f.fix_action)}</div>
      ${evidenceStr ? `<div class="finding-evidence">${escapeHtml(evidenceStr)}</div>` : ""}
    </div>
  `;
}

// ----------------------------------------------------------------
// Catalogue rendering — shown on page load
// ----------------------------------------------------------------

function renderCatalogue() {
  const grid = document.getElementById("catalogueGrid");
  const groups = {};
  Object.values(REASON_CODES).forEach((rc) => {
    if (!groups[rc.category]) groups[rc.category] = [];
    groups[rc.category].push(rc);
  });

  let html = "";
  Object.entries(groups).forEach(([cat, codes]) => {
    html += `<div class="cat-group"><h4>${cat}</h4><div class="cat-codes">`;
    codes.forEach((c) => {
      html += `<span class="cat-code ${c.severity}" title="${escapeHtml(c.customer_message)}">${c.code}</span>`;
    });
    html += `</div></div>`;
  });
  grid.innerHTML = html;
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showAnalysis() {
  document.getElementById("analysisCard").classList.remove("hidden");
  document.getElementById("resultsCard").classList.add("hidden");
  document.getElementById("analysisBadge").textContent = "In progress";
  document.getElementById("analysisBadge").className = "badge badge-running";
  document.getElementById("analysisCard").scrollIntoView({ behavior: "smooth", block: "start" });
}

function showResults() {
  document.getElementById("analysisBadge").textContent = "Complete";
  document.getElementById("analysisBadge").className = "badge";
  document.getElementById("resultsCard").classList.remove("hidden");
  setTimeout(() => {
    document.getElementById("resultsCard").scrollIntoView({ behavior: "smooth", block: "start" });
  }, 200);
}

function resetUI() {
  document.getElementById("analysisCard").classList.add("hidden");
  document.getElementById("resultsCard").classList.add("hidden");
  document.getElementById("checkList").innerHTML = "";
  document.getElementById("fileInput").value = "";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ----------------------------------------------------------------
// Event handlers
// ----------------------------------------------------------------

async function handleFile(file) {
  if (!file) return;
  showAnalysis();

  let meta;
  try {
    meta = await readVideoMetadata(file);
  } catch (err) {
    meta = { width: 0, height: 0, duration: 0 };
  }

  const report = await runPipeline({ file, meta }, []);
  renderReport(report);
  showResults();
}

async function handleScenario(scenarioKey) {
  const scenario = SCENARIOS[scenarioKey];
  if (!scenario) return;
  showAnalysis();

  // Build a fake file-like object so the real detectors still run
  const fakeFile = {
    name: scenario.file.name,
    size: scenario.file.sizeMb * 1024 * 1024,
    type: scenario.file.type,
  };
  const fakeMeta = { width: scenario.file.width, height: scenario.file.height, duration: 180 };

  const report = await runPipeline({ file: fakeFile, meta: fakeMeta }, scenario.extraFindings);
  renderReport(report);
  showResults();
}

// ----------------------------------------------------------------
// Wire up the UI
// ----------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  renderCatalogue();

  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");

  dropzone.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (e) => handleFile(e.target.files[0]));

  ["dragenter", "dragover"].forEach((ev) => {
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });
  });
  ["dragleave", "drop"].forEach((ev) => {
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
    });
  });
  dropzone.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  document.querySelectorAll("[data-scenario]").forEach((btn) => {
    btn.addEventListener("click", () => handleScenario(btn.dataset.scenario));
  });

  document.getElementById("resetBtn").addEventListener("click", resetUI);
});
