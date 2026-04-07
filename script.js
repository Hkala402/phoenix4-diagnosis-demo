/**
 * Phoenix-4 Replica Diagnostic Tool
 * ====================================
 * Author : Himanshu Kala — QA Engineer
 * GitHub : github.com/Hkala402
 *
 * WHAT THIS DOES:
 * Tavus Phoenix-4 rejects training videos if they don't meet exact
 * requirements. This tool validates every requirement and uses
 * Claude AI to diagnose why a replica would be rejected.
 */

// ── STATE ──────────────────────────────────────────────
const state = { currentStep: 0 };
let checkResults = [];
let aiDiagnosis  = '';
let apiKey       = localStorage.getItem('anthropic_api_key') || '';

// ── API KEY MODAL ──────────────────────────────────────
function openApiModal() {
  document.getElementById('apiModal').classList.add('open');
  document.getElementById('apiKeyInput').value = apiKey;
}

function closeApiModal() {
  document.getElementById('apiModal').classList.remove('open');
}

function saveApiKey() {
  const val = document.getElementById('apiKeyInput').value.trim();
  if (!val) { alert('Please enter your Anthropic API key.'); return; }
  apiKey = val;
  localStorage.setItem('anthropic_api_key', val);
  closeApiModal();
}

// ── RADIO HELPER ───────────────────────────────────────
function pickRadio(el, name) {
  document.querySelectorAll(`[name="${name}"]`).forEach(r => {
    r.closest('.radio-opt').classList.remove('selected');
  });
  const radio = el.querySelector('input[type="radio"]');
  if (radio) { radio.checked = true; el.classList.add('selected'); }
}

// ── STEP NAVIGATION ────────────────────────────────────
function goToStep(n) {
  if (n === 1) buildChecklist();
  if (n === 2) {
    resetTerminal();
    document.getElementById('api-key-notice').style.display = apiKey ? 'none' : 'flex';
  }
  if (n === 3) buildResults();

  document.querySelectorAll('.step-pane').forEach(p => p.classList.remove('active'));
  document.getElementById(`step-${n}`).classList.add('active');

  document.querySelectorAll('.step-item').forEach((item, i) => {
    const dot = item.querySelector('.step-dot');
    item.classList.remove('active', 'done');
    dot.classList.remove('active', 'done');
    if (i < n) {
      item.classList.add('done');
      dot.classList.add('done');
      dot.textContent = '✓';
    } else if (i === n) {
      item.classList.add('active');
      dot.classList.add('active');
      dot.textContent = i + 1;
    } else {
      dot.textContent = i + 1;
    }
  });

  state.currentStep = n;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── GET FORM VALUES ────────────────────────────────────
function getValues() {
  return {
    consent:    document.querySelector('input[name="consent"]:checked')?.value || '',
    talkDur:    document.getElementById('talk-dur').value,
    silence:    document.getElementById('silence').value,
    fileSize:   document.getElementById('file-size').value,
    codec:      document.getElementById('codec').value,
    source:     document.querySelector('input[name="source"]:checked')?.value || '',
    lips:       document.getElementById('lips').value,
    resolution: document.getElementById('resolution').value,
    notes:      document.getElementById('extra-notes').value.trim(),
  };
}

// ── CHECKLIST DATA ─────────────────────────────────────
function getChecks(v) {
  return [
    {
      name: 'Consent Statement',
      pass: v.consent === 'yes',
      warn: v.consent === 'partial',
      fail: v.consent === 'no' || v.consent === '',
      detail: {
        pass: 'Consent statement is clearly included at the start of the video.',
        warn: 'Consent statement present but may be unclear or incomplete.',
        fail: 'No consent statement detected. This is the #1 rejection reason.',
      },
      fix: 'Re-record the video. Speak the full consent statement clearly at the very beginning: "I, [FULL NAME], am currently speaking and give consent to Tavus to create an AI clone of me by using the audio and video samples I provide."',
    },
    {
      name: 'Talking Segment Duration',
      pass: v.talkDur === '60-90',
      warn: v.talkDur === '45-60' || v.talkDur === 'over90',
      fail: v.talkDur === 'under30' || v.talkDur === '30-45' || v.talkDur === '',
      detail: {
        pass: 'Talking segment duration is approximately 1 minute — optimal.',
        warn: 'Duration is outside the ideal 1-minute window. May affect training quality.',
        fail: 'Talking segment is too short. Phoenix-4 requires approximately 1 minute of natural speech.',
      },
      fix: 'Record at least 1 full minute of natural, continuous speech. Speak clearly and vary your expressions.',
    },
    {
      name: 'Silence Segment (1 minute)',
      pass: v.silence === 'yes-full',
      warn: v.silence === 'yes-short' || v.silence === 'unknown',
      fail: v.silence === 'no' || v.silence === '',
      detail: {
        pass: '1 minute of silence segment is included after the talking portion.',
        warn: 'Silence segment is shorter than recommended. May impact lip sync accuracy.',
        fail: 'No silence segment found. Phoenix-4 requires ~1 min of silence AFTER the talking segment.',
      },
      fix: 'After the talking segment ends, continue recording 1 full minute of silence. Do not stop recording early.',
    },
    {
      name: 'File Size (max 750 MB)',
      pass: ['under100', '100-500'].includes(v.fileSize),
      warn: v.fileSize === '500-750' || v.fileSize === 'unknown',
      fail: v.fileSize === 'over750' || v.fileSize === '',
      detail: {
        pass: 'File size is within the accepted 750 MB limit.',
        warn: 'File is close to or exceeds the 750 MB limit. Compression recommended.',
        fail: 'File exceeds 750 MB. Tavus will reject files over this threshold.',
      },
      fix: 'Compress the video: lower resolution to 1080p, reduce frame rate to 30fps, use HandBrake targeting H.264 codec.',
    },
    {
      name: 'Codec — H.264 Required',
      pass: v.codec === 'h264',
      warn: v.codec === 'unknown' || v.codec === '',
      fail: ['h265', 'vp9', 'av1', 'other'].includes(v.codec),
      detail: {
        pass: 'Video uses H.264 codec — the required format for Phoenix-4.',
        warn: 'Codec is unknown. Verify the video uses H.264 before submitting.',
        fail: 'Video uses an unsupported codec. Tavus requires H.264 encoding for all uploads.',
      },
      fix: 'Re-encode using H.264: use HandBrake or run: ffmpeg -i input.mp4 -vcodec libx264 output.mp4',
    },
    {
      name: 'Real Human Video Source',
      pass: v.source === 'real',
      warn: v.source === '',
      fail: v.source === 'ai' || v.source === 'screen',
      detail: {
        pass: 'Video is from a real human recording — ideal for training quality.',
        warn: 'Source type not specified. Confirm it is a direct camera recording.',
        fail: 'AI-generated or screen-recorded videos are not suitable for Phoenix-4 replica training.',
      },
      fix: 'Record the person directly using a camera or webcam in good lighting. AI-generated videos produce poor replica quality.',
    },
    {
      name: 'Full Lip Closure',
      pass: v.lips === 'full',
      warn: v.lips === 'partial' || v.lips === '',
      fail: v.lips === 'none',
      detail: {
        pass: 'Lips fully close during speech — optimal for lip sync training.',
        warn: 'Lip closure is partial. May affect lip sync realism in the replica.',
        fail: 'Minimal lip movement detected. Phoenix-4 cannot learn accurate lip sync without full lip closure.',
      },
      fix: 'Re-record with natural, full lip movement. Ensure lips fully close between words and syllables.',
    },
  ];
}

// ── BUILD CHECKLIST ────────────────────────────────────
function buildChecklist() {
  const v         = getValues();
  const container = document.getElementById('checklist-items');
  container.innerHTML = '';
  checkResults = [];

  const checks = getChecks(v);
  let pass = 0, warn = 0, fail = 0;

  checks.forEach((c, i) => {
    const status = c.pass ? 'pass' : c.warn ? 'warn' : 'fail';
    if      (status === 'pass') pass++;
    else if (status === 'warn') warn++;
    else                        fail++;

    checkResults.push({ ...c, status });

    const icon      = status === 'pass' ? '✓' : status === 'warn' ? '!' : '✗';
    const iconClass = `status-${status}`;
    const detailTxt = c.detail[status];

    const item = document.createElement('div');
    item.className         = `check-item ${status}`;
    item.style.animationDelay = `${i * 60}ms`;
    item.innerHTML = `
      <div class="check-status ${iconClass}">${icon}</div>
      <div class="check-content">
        <div class="check-name">${c.name}</div>
        <div class="check-detail">${detailTxt}</div>
        ${status !== 'pass' ? `<div class="check-fix">→ Fix: ${c.fix}</div>` : ''}
      </div>
    `;
    container.appendChild(item);
  });

  // Score ring
  const total      = checks.length;
  const pct        = Math.round((pass / total) * 100);
  const circumference = 188.5;
  const offset     = circumference - (pct / 100) * circumference;
  const ringColor  = pct >= 85 ? 'var(--green)' : pct >= 57 ? 'var(--amber)' : 'var(--red)';

  setTimeout(() => {
    const ring = document.getElementById('ring-fill');
    ring.style.strokeDashoffset = offset;
    ring.style.stroke           = ringColor;
    const num = document.getElementById('score-num');
    num.textContent = `${pass}/${total}`;
    num.style.color = ringColor;
  }, 100);

  document.getElementById('score-label').textContent =
    pct >= 85 ? 'Looking Good' : pct >= 57 ? 'Needs Attention' : 'High Risk of Rejection';
  document.getElementById('score-sub').textContent =
    `${pass} passed · ${warn} warnings · ${fail} failed`;

  // Score bar pips
  const bar = document.getElementById('score-bar');
  bar.innerHTML = '';
  checkResults.forEach(c => {
    const pip = document.createElement('div');
    pip.className = 'score-pip';
    pip.style.background = c.status === 'pass' ? 'var(--green)'
      : c.status === 'warn' ? 'var(--amber)' : 'var(--red)';
    bar.appendChild(pip);
  });
}

// ── TERMINAL HELPERS ───────────────────────────────────
function resetTerminal() {
  document.getElementById('terminal-output').innerHTML = `
    <div class="term-line"><span class="term-prompt">$ </span><span class="term-output">phoenix4-diagnostics --mode ai-analysis</span></div>
    <div class="term-line"><span class="term-output">Engine ready. Click "Run AI Diagnosis" to analyze.</span></div>
    <div class="term-line"><span class="term-cursor"></span></div>
  `;
}

function termPrint(html, delay = 0) {
  return new Promise(resolve => {
    setTimeout(() => {
      const out    = document.getElementById('terminal-output');
      const cursor = out.querySelector('.term-cursor');
      const line   = document.createElement('div');
      line.className = 'term-line';
      line.innerHTML  = html;
      if (cursor) out.insertBefore(line, cursor);
      else        out.appendChild(line);
      resolve();
    }, delay);
  });
}

// ── AI DIAGNOSIS ───────────────────────────────────────
async function runAIDiagnosis() {
  if (!apiKey) { openApiModal(); return; }

  const btn = document.getElementById('run-ai-btn');
  btn.disabled    = true;
  btn.textContent = 'Analyzing...';

  const out = document.getElementById('terminal-output');
  out.innerHTML = '';

  const v      = getValues();
  const issues = checkResults.filter(c => c.status !== 'pass').map(c => `- ${c.name}: ${c.status.toUpperCase()}`).join('\n');
  const passed = checkResults.filter(c => c.status === 'pass').map(c => c.name).join(', ');

  await termPrint(`<span class="term-prompt">$ </span><span class="term-output">Connecting to Claude AI engine...</span>`);
  await termPrint(`<span class="term-prompt">$ </span><span class="term-output">Sending replica details for analysis...</span>`, 400);
  await termPrint(`<span class="term-info">→ Model: claude-sonnet-4-20250514</span>`, 700);

  const typingEl = document.createElement('div');
  typingEl.className = 'typing-indicator';
  typingEl.innerHTML = `<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div><span>AI is analyzing...</span>`;
  out.appendChild(typingEl);

  const prompt = buildPrompt(v, passed, issues);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    typingEl.remove();

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      await termPrint(`<span class="term-error">✗ API Error: ${err.error?.message || response.statusText}</span>`, 100);
      await termPrint(`<span class="term-warn">→ Using offline checklist analysis...</span>`, 300);
      aiDiagnosis = buildOfflineAnalysis(v);
      setTimeout(() => goToStep(3), 600);
      return;
    }

    const data = await response.json();
    aiDiagnosis = data.content?.[0]?.text || '';

    await termPrint(`<span class="term-success">✓ Analysis complete</span>`);
    await termPrint(`<span class="term-output">Rendering results...</span>`, 300);
    setTimeout(() => goToStep(3), 600);

  } catch (err) {
    typingEl.remove();
    await termPrint(`<span class="term-error">✗ Connection error: ${err.message}</span>`, 100);
    await termPrint(`<span class="term-warn">→ Falling back to offline analysis...</span>`, 300);
    aiDiagnosis = buildOfflineAnalysis(v);
    setTimeout(() => goToStep(3), 800);
  } finally {
    btn.disabled    = false;
    btn.textContent = '🔍 Run AI Diagnosis';
  }
}

function buildPrompt(v, passed, issues) {
  return `You are a Tavus Phoenix-4 replica training expert and support engineer.

A customer's replica submission has been analyzed. Here are the details:

Form Data:
- Consent statement: ${v.consent || 'not provided'}
- Talking segment: ${v.talkDur || 'not specified'}
- Silence segment: ${v.silence || 'not specified'}
- File size: ${v.fileSize || 'not specified'}
- Codec: ${v.codec || 'not specified'}
- Video source: ${v.source || 'not specified'}
- Lip movement: ${v.lips || 'not specified'}
- Resolution: ${v.resolution || 'not specified'}
- Additional notes: ${v.notes || 'none'}

Automated Checklist Results:
PASSED: ${passed || 'none'}
ISSUES:
${issues || 'No issues detected'}

Provide a detailed diagnostic report structured as:
1. REJECTION RISK LEVEL: (High/Medium/Low) and brief verdict
2. PRIMARY REJECTION CAUSES: Top 1-3 critical issues that would cause rejection
3. SECONDARY CONCERNS: Lower priority issues affecting quality
4. STEP-BY-STEP FIX PLAN: Numbered, actionable steps to resubmit successfully
5. APPROVAL ESTIMATE: Percentage chance of approval after fixes

Be specific, technical, and practical. Address the customer directly.`;
}

function buildOfflineAnalysis(v) {
  const issues = checkResults.filter(c => c.status === 'fail');
  const warns  = checkResults.filter(c => c.status === 'warn');
  let out = `REJECTION RISK LEVEL: ${issues.length > 2 ? 'HIGH' : issues.length > 0 ? 'MEDIUM' : 'LOW'}\n\n`;

  if (issues.length) {
    out += `PRIMARY REJECTION CAUSES:\n`;
    issues.forEach((c, i) => out += `${i+1}. ${c.name} — ${c.detail.fail}\n   Fix: ${c.fix}\n\n`);
  }
  if (warns.length) {
    out += `SECONDARY CONCERNS:\n`;
    warns.forEach((c, i) => out += `${i+1}. ${c.name} — ${c.detail.warn}\n\n`);
  }

  const passCount = checkResults.filter(c => c.status === 'pass').length;
  const pct       = Math.round((passCount / checkResults.length) * 100);
  out += `APPROVAL ESTIMATE AFTER FIXES: ${Math.min(95, pct + 30)}%`;
  return out;
}

// ── BUILD RESULTS ──────────────────────────────────────
function buildResults() {
  const criticals = checkResults.filter(c => c.status === 'fail');
  const warnings  = checkResults.filter(c => c.status === 'warn');
  const passCount = checkResults.filter(c => c.status === 'pass').length;
  const pct       = passCount / checkResults.length;

  // Approval meter
  const approvalPct = Math.min(95, Math.round(pct * 100) + (criticals.length === 0 ? 10 : 0));
  const color       = approvalPct >= 70 ? '#4ade80' : approvalPct >= 45 ? '#fbbf24' : '#f87171';

  setTimeout(() => {
    document.getElementById('meter-fill').style.width      = `${approvalPct}%`;
    document.getElementById('meter-fill').style.background = color;
  }, 200);
  document.getElementById('approval-pct').textContent = `${approvalPct}%`;
  document.getElementById('approval-pct').style.color  = color;

  // Critical issues
  const critEl = document.getElementById('critical-issues');
  critEl.innerHTML = '';
  if (!criticals.length) {
    critEl.innerHTML = `<div class="issue-card info"><div class="issue-body"><div class="issue-title" style="color:var(--green)">No critical issues detected ✓</div><div class="issue-desc">All required fields passed validation.</div></div></div>`;
  } else {
    criticals.forEach((c, i) => {
      const el = document.createElement('div');
      el.className = 'issue-card critical';
      el.innerHTML = `
        <div class="issue-num num-red">${i+1}</div>
        <div class="issue-body">
          <div class="issue-title">${c.name}</div>
          <div class="issue-desc">${c.detail.fail}</div>
          <div class="issue-fix"><div class="fix-label">Recommended Fix</div>${c.fix}</div>
        </div>`;
      critEl.appendChild(el);
    });
  }

  // Warnings
  const warnEl = document.getElementById('warning-issues');
  warnEl.innerHTML = '';
  if (!warnings.length) {
    warnEl.innerHTML = `<div class="issue-card info"><div class="issue-body"><div class="issue-title" style="color:var(--text-dim)">No warnings</div></div></div>`;
  } else {
    warnings.forEach((c, i) => {
      const el = document.createElement('div');
      el.className = 'issue-card warning';
      el.innerHTML = `
        <div class="issue-num num-amber">${i+1}</div>
        <div class="issue-body">
          <div class="issue-title">${c.name}</div>
          <div class="issue-desc">${c.detail.warn}</div>
          <div class="issue-fix"><div class="fix-label">Recommendation</div>${c.fix}</div>
        </div>`;
      warnEl.appendChild(el);
    });
  }

  // AI content
  const aiContent = document.getElementById('ai-result-content');
  if (aiDiagnosis) {
    aiContent.innerHTML = `
      <div class="term-line"><span class="term-prompt">$ </span><span class="term-success">Analysis complete</span></div>
      <div class="ai-content" style="margin-top:12px">${formatAIOutput(aiDiagnosis)}</div>`;
  } else {
    aiContent.innerHTML = `<div class="term-line"><span class="term-output">Run AI Analysis (Step 3) to get detailed recommendations.</span></div>`;
  }
}

// ── HELPERS ────────────────────────────────────────────
function formatAIOutput(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/^(\d+\.\s)/gm,  '<span style="color:var(--teal)">$1</span>')
    .replace(/(HIGH|CRITICAL)/g,  '<span style="color:var(--red)">$1</span>')
    .replace(/(MEDIUM)/g,         '<span style="color:var(--amber)">$1</span>')
    .replace(/(LOW|PASS)/g,       '<span style="color:var(--green)">$1</span>');
}

function copyReport() {
  const criticals = checkResults.filter(c => c.status === 'fail')
    .map(c => `❌ ${c.name}\n   Issue: ${c.detail.fail}\n   Fix  : ${c.fix}`)
    .join('\n\n');
  const warnings = checkResults.filter(c => c.status === 'warn')
    .map(c => `⚠️  ${c.name}\n   ${c.detail.warn}`)
    .join('\n\n');

  const report = [
    'Phoenix-4 Replica Diagnostic Report',
    '='.repeat(42),
    '',
    'CRITICAL ISSUES:',
    criticals || 'None',
    '',
    'WARNINGS:',
    warnings || 'None',
    '',
    'AI ANALYSIS:',
    aiDiagnosis || 'Not run',
    '',
    '='.repeat(42),
    'Generated by Phoenix-4 Replica Diagnostic Tool',
    'Built by Himanshu Kala — QA Engineer',
    'github.com/Hkala402',
  ].join('\n');

  navigator.clipboard.writeText(report)
    .then(() => alert('Report copied to clipboard!'))
    .catch(() => alert('Copy failed — please select and copy manually.'));
}
