/**
 * Phoenix-4 Replica Diagnostic Tool
 * Author: Himanshu Kala — QA Engineer
 * github.com/Hkala402
 */

let checkResults = [];
let aiDiagnosis  = '';
let apiKey       = localStorage.getItem('gemini_api_key') || '';

// ── API KEY ───────────────────────────────────────────────────────
function openApiModal() {
  document.getElementById('apiModal').classList.add('open');
  document.getElementById('apiKeyInput').value = apiKey;
}
function closeApiModal() {
  document.getElementById('apiModal').classList.remove('open');
}
function saveApiKey() {
  const val = document.getElementById('apiKeyInput').value.trim();
  if (!val) { alert('Please enter your API key first.'); return; }
  apiKey = val;
  localStorage.setItem('gemini_api_key', val);
  closeApiModal();
  document.getElementById('api-key-notice').style.display = 'none';
}

// ── RADIO HELPER ──────────────────────────────────────────────────
function pickRadio(el, name) {
  document.querySelectorAll(`[name="${name}"]`).forEach(r => r.closest('.radio-opt').classList.remove('selected'));
  const radio = el.querySelector('input[type="radio"]');
  if (radio) { radio.checked = true; el.classList.add('selected'); }
}

// ── NAVIGATION ────────────────────────────────────────────────────
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
    item.classList.remove('active','done');
    dot.classList.remove('active','done');
    if (i < n)        { item.classList.add('done');   dot.classList.add('done');   dot.textContent = '✓'; }
    else if (i === n) { item.classList.add('active'); dot.classList.add('active'); dot.textContent = i+1; }
    else              { dot.textContent = i+1; }
  });
  window.scrollTo({ top:0, behavior:'smooth' });
}

// ── FORM VALUES ───────────────────────────────────────────────────
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

// ── CHECKLIST ─────────────────────────────────────────────────────
function buildChecklist() {
  const v = getValues();
  const container = document.getElementById('checklist-items');
  container.innerHTML = '';
  checkResults = [];

  const checks = [
    {
      name:'Consent Statement',
      pass:v.consent==='yes', warn:v.consent==='partial', fail:v.consent==='no'||!v.consent,
      detail:{
        pass:'Consent statement clearly included at the start of the video.',
        warn:'Consent statement present but may be unclear or incomplete.',
        fail:'No consent statement detected. This is the #1 cause of Phoenix-4 rejection.',
      },
      fix:'Re-record with full consent statement at the very start: "I, [FULL NAME], am currently speaking and give consent to Tavus to create an AI clone of me..."',
    },
    {
      name:'Talking Segment (~1 minute)',
      pass:v.talkDur==='60-90', warn:v.talkDur==='45-60'||v.talkDur==='over90', fail:['under30','30-45',''].includes(v.talkDur),
      detail:{
        pass:'Talking segment is approximately 1 minute — optimal.',
        warn:'Duration is outside the ideal 1-minute window. May affect quality.',
        fail:'Talking segment is too short. Phoenix-4 needs approximately 1 minute of speech.',
      },
      fix:'Record at least 1 full minute of natural speech. Vary expressions and speak clearly.',
    },
    {
      name:'Silence Segment (~1 minute)',
      pass:v.silence==='yes-full', warn:['yes-short','unknown'].includes(v.silence), fail:v.silence==='no'||!v.silence,
      detail:{
        pass:'1 minute of silence included after the talking portion.',
        warn:'Silence segment shorter than recommended. May impact lip sync.',
        fail:'No silence segment. Phoenix-4 requires ~1 min silence after the talking.',
      },
      fix:'After talking, stay still and silent for 1 full minute before stopping the recording.',
    },
    {
      name:'File Size (max 750 MB)',
      pass:['under100','100-500'].includes(v.fileSize), warn:['500-750','unknown'].includes(v.fileSize), fail:v.fileSize==='over750'||!v.fileSize,
      detail:{
        pass:'File size is within the accepted 750 MB limit.',
        warn:'File is close to the 750 MB limit. Compression recommended.',
        fail:'File exceeds 750 MB. Tavus will reject uploads over this threshold.',
      },
      fix:'Compress: ffmpeg -i input.mp4 -vcodec libx264 -crf 23 -vf scale=1920:1080 output.mp4',
    },
    {
      name:'Codec — H.264 Required',
      pass:v.codec==='h264', warn:!v.codec||v.codec==='other', fail:['h265','vp9','av1'].includes(v.codec),
      detail:{
        pass:'Video uses H.264 codec — the required format for Phoenix-4.',
        warn:'Codec is unknown. Verify the video uses H.264 before submitting.',
        fail:'Unsupported codec. Tavus requires H.264 for all uploads.',
      },
      fix:'Re-encode: ffmpeg -i input.mp4 -vcodec libx264 -acodec aac output.mp4',
    },
    {
      name:'Real Human Video Source',
      pass:v.source==='real', warn:!v.source, fail:['ai','screen'].includes(v.source),
      detail:{
        pass:'Real human recording — ideal for training quality.',
        warn:'Source type not specified. Verify it is a direct camera recording.',
        fail:'AI-generated or screen-recorded videos are not suitable for Phoenix-4.',
      },
      fix:'Record directly with a camera or webcam in good lighting.',
    },
    {
      name:'Full Lip Closure',
      pass:v.lips==='full', warn:v.lips==='partial'||!v.lips, fail:v.lips==='none',
      detail:{
        pass:'Lips fully close during speech — optimal for lip sync training.',
        warn:'Partial lip closure may affect lip sync realism.',
        fail:'Minimal lip movement. Phoenix-4 needs full lip closure for accurate lip sync.',
      },
      fix:'Re-record with clearly articulated speech. Ensure lips close on P, B, M sounds.',
    },
  ];

  let pass=0, warn=0, fail=0;
  checks.forEach((c,i) => {
    const status = c.pass?'pass':c.warn?'warn':'fail';
    if(status==='pass')pass++; else if(status==='warn')warn++; else fail++;
    checkResults.push({...c,status});

    const item = document.createElement('div');
    item.className = `check-item ${status}`;
    item.style.animationDelay = `${i*60}ms`;
    const icon = status==='pass'?'✓':status==='warn'?'!':'✗';
    item.innerHTML = `
      <div class="check-status status-${status}">${icon}</div>
      <div class="check-content">
        <div class="check-name">${c.name}</div>
        <div class="check-detail">${c.detail[status]}</div>
        ${status!=='pass'?`<div class="check-fix">→ Fix: ${c.fix}</div>`:''}
      </div>`;
    container.appendChild(item);
  });

  const total=checks.length, pct=Math.round((pass/total)*100);
  const color=pct>=85?'var(--green)':pct>=57?'var(--amber)':'var(--red)';
  setTimeout(()=>{
    document.getElementById('ring-fill').style.strokeDashoffset=188.5-(pct/100)*188.5;
    document.getElementById('ring-fill').style.stroke=color;
    document.getElementById('score-num').textContent=`${pass}/${total}`;
    document.getElementById('score-num').style.color=color;
  },100);
  document.getElementById('score-label').textContent=pct>=85?'Looking Good':pct>=57?'Needs Attention':'High Risk of Rejection';
  document.getElementById('score-sub').textContent=`${pass} passed · ${warn} warnings · ${fail} failed`;

  const bar=document.getElementById('score-bar');
  bar.innerHTML='';
  checkResults.forEach(c=>{
    const pip=document.createElement('div');
    pip.className='score-pip';
    pip.style.background=c.status==='pass'?'var(--green)':c.status==='warn'?'var(--amber)':'var(--red)';
    bar.appendChild(pip);
  });
}

// ── TERMINAL ──────────────────────────────────────────────────────
function resetTerminal() {
  document.getElementById('terminal-output').innerHTML=`
    <div class="term-line"><span class="term-prompt">$ </span><span class="term-output">phoenix4-diagnostics --mode ai-analysis</span></div>
    <div class="term-line"><span class="term-output">Engine ready. Click "Run AI Diagnosis" to begin.</span></div>
    <div class="term-line"><span class="term-cursor"></span></div>`;
}

function termPrint(html, delay=0) {
  return new Promise(resolve=>{
    setTimeout(()=>{
      const out=document.getElementById('terminal-output');
      const cursor=out.querySelector('.term-cursor');
      const line=document.createElement('div');
      line.className='term-line'; line.innerHTML=html;
      if(cursor) out.insertBefore(line,cursor); else out.appendChild(line);
      resolve();
    }, delay);
  });
}

// ── AI ANALYSIS ───────────────────────────────────────────────────
async function runAIDiagnosis() {
  if (!apiKey) { openApiModal(); return; }
  const btn=document.getElementById('run-ai-btn');
  btn.disabled=true; btn.textContent='Analyzing...';

  const out=document.getElementById('terminal-output');
  out.innerHTML='';

  const v=getValues();
  const issues=checkResults.filter(c=>c.status!=='pass').map(c=>`- ${c.name}: ${c.status.toUpperCase()}`).join('\n');
  const passed=checkResults.filter(c=>c.status==='pass').map(c=>c.name).join(', ');

  await termPrint(`<span class="term-prompt">$ </span><span class="term-output">Connecting to Gemini AI engine...</span>`);
  await termPrint(`<span class="term-prompt">$ </span><span class="term-output">Sending replica details for analysis...</span>`,400);
  await termPrint(`<span class="term-info">→ Model: gemini-2.0-flash</span>`,700);

  const typingEl=document.createElement('div');
  typingEl.className='typing-indicator';
  typingEl.innerHTML=`<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div><span>Gemini is analyzing...</span>`;
  out.appendChild(typingEl);

  const prompt=`You are a Tavus Phoenix-4 replica training expert and support engineer.

Customer submission details:
- Consent: ${v.consent||'not provided'}
- Talking segment: ${v.talkDur||'not specified'}
- Silence segment: ${v.silence||'not specified'}
- File size: ${v.fileSize||'not specified'}
- Codec: ${v.codec||'not specified'}
- Source: ${v.source||'not specified'}
- Lip movement: ${v.lips||'not specified'}
- Resolution: ${v.resolution||'not specified'}
- Notes: ${v.notes||'none'}

Checklist — Passed: ${passed||'none'}
Issues: ${issues||'None'}

Write a diagnostic report with these exact sections:
1. REJECTION RISK LEVEL: (High/Medium/Low) + brief verdict
2. PRIMARY REJECTION CAUSES: Top 1-3 critical issues that cause rejection
3. SECONDARY CONCERNS: Lower priority items affecting quality
4. STEP-BY-STEP FIX PLAN: Numbered actionable steps to resubmit successfully
5. APPROVAL ESTIMATE: % chance of approval after fixes applied

Be specific, technical, and practical. Address the customer directly.`;

  try {
    const response=await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          contents:[{parts:[{text:prompt}]}],
          generationConfig:{temperature:0.4,maxOutputTokens:1000}
        }),
      }
    );

    typingEl.remove();

    if(!response.ok){
      const err=await response.json().catch(()=>({}));
      const msg=err.error?.message||response.statusText;
      await termPrint(`<span class="term-error">✗ Gemini API Error: ${msg}</span>`,100);
      if(msg.includes('API_KEY_INVALID')||msg.includes('API key not valid')){
        await termPrint(`<span class="term-warn">→ Check your API key at aistudio.google.com</span>`,200);
      }
      await termPrint(`<span class="term-warn">→ Using offline checklist analysis...</span>`,400);
      aiDiagnosis=buildOfflineAnalysis();
      setTimeout(()=>goToStep(3),600);
      return;
    }

    const data=await response.json();
    aiDiagnosis=data.candidates?.[0]?.content?.parts?.[0]?.text||'';
    await termPrint(`<span class="term-success">✓ Analysis complete</span>`);
    await termPrint(`<span class="term-output">Rendering results...</span>`,300);
    setTimeout(()=>goToStep(3),600);

  } catch(err) {
    typingEl.remove();
    await termPrint(`<span class="term-error">✗ ${err.message}</span>`,100);
    await termPrint(`<span class="term-warn">→ Using offline checklist analysis...</span>`,300);
    aiDiagnosis=buildOfflineAnalysis();
    setTimeout(()=>goToStep(3),800);
  } finally {
    btn.disabled=false; btn.textContent='🔍 Run AI Diagnosis';
  }
}

function buildOfflineAnalysis() {
  const issues=checkResults.filter(c=>c.status==='fail');
  const warns=checkResults.filter(c=>c.status==='warn');
  let out=`REJECTION RISK LEVEL: ${issues.length>2?'HIGH':issues.length>0?'MEDIUM':'LOW'}\n\n`;
  if(issues.length){
    out+=`PRIMARY REJECTION CAUSES:\n`;
    issues.forEach((c,i)=>out+=`${i+1}. ${c.name}\n   Issue: ${c.detail.fail}\n   Fix  : ${c.fix}\n\n`);
  }
  if(warns.length){
    out+=`SECONDARY CONCERNS:\n`;
    warns.forEach((c,i)=>out+=`${i+1}. ${c.name} — ${c.detail.warn}\n\n`);
  }
  const pct=Math.round((checkResults.filter(c=>c.status==='pass').length/checkResults.length)*100);
  out+=`APPROVAL ESTIMATE AFTER FIXES: ${Math.min(95,pct+30)}%`;
  return out;
}

// ── RESULTS ───────────────────────────────────────────────────────
function buildResults() {
  const criticals=checkResults.filter(c=>c.status==='fail');
  const warnings=checkResults.filter(c=>c.status==='warn');
  const pct=checkResults.filter(c=>c.status==='pass').length/checkResults.length;
  const approvalPct=Math.min(95,Math.round(pct*100)+(criticals.length===0?10:0));
  const meterColor=approvalPct>=70?'#4ade80':approvalPct>=45?'#fbbf24':'#f87171';

  setTimeout(()=>{
    document.getElementById('meter-fill').style.width=`${approvalPct}%`;
    document.getElementById('meter-fill').style.background=meterColor;
  },200);
  document.getElementById('approval-pct').textContent=`${approvalPct}%`;
  document.getElementById('approval-pct').style.color=meterColor;

  const critEl=document.getElementById('critical-issues');
  critEl.innerHTML='';
  if(!criticals.length){
    critEl.innerHTML=`<div class="issue-card info"><div class="issue-body"><div class="issue-title" style="color:var(--green)">✓ No critical issues detected</div><div class="issue-desc">All required checks passed.</div></div></div>`;
  } else {
    criticals.forEach((c,i)=>{
      const el=document.createElement('div'); el.className='issue-card critical';
      el.innerHTML=`<div class="issue-num num-red">${i+1}</div><div class="issue-body"><div class="issue-title">${c.name}</div><div class="issue-desc">${c.detail.fail}</div><div class="issue-fix"><div class="fix-label">Recommended Fix</div>${c.fix}</div></div>`;
      critEl.appendChild(el);
    });
  }

  const warnEl=document.getElementById('warning-issues');
  warnEl.innerHTML='';
  if(!warnings.length){
    warnEl.innerHTML=`<div class="issue-card info"><div class="issue-body"><div class="issue-title" style="color:var(--text-dim)">No warnings</div></div></div>`;
  } else {
    warnings.forEach((c,i)=>{
      const el=document.createElement('div'); el.className='issue-card warning';
      el.innerHTML=`<div class="issue-num num-amber">${i+1}</div><div class="issue-body"><div class="issue-title">${c.name}</div><div class="issue-desc">${c.detail.warn}</div><div class="issue-fix"><div class="fix-label">Recommendation</div>${c.fix}</div></div>`;
      warnEl.appendChild(el);
    });
  }

  const aiContent=document.getElementById('ai-result-content');
  if(aiDiagnosis){
    aiContent.innerHTML=`<div class="term-line"><span class="term-prompt">$ </span><span class="term-success">Analysis complete</span></div><div class="ai-content" style="margin-top:12px">${formatAIOutput(aiDiagnosis)}</div>`;
  } else {
    aiContent.innerHTML=`<div class="term-line"><span class="term-output">Run AI Analysis (Step 3) to get detailed recommendations.</span></div>`;
  }
}

function formatAIOutput(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
    .replace(/^(\d+\.\s)/gm,'<span style="color:var(--teal)">$1</span>')
    .replace(/(HIGH|CRITICAL)/g,'<span style="color:var(--red)">$1</span>')
    .replace(/(MEDIUM)/g,'<span style="color:var(--amber)">$1</span>')
    .replace(/\b(LOW|PASS)\b/g,'<span style="color:var(--green)">$1</span>');
}

// ── COPY REPORT ───────────────────────────────────────────────────
function copyReport() {
  const criticals=checkResults.filter(c=>c.status==='fail').map(c=>`❌ ${c.name}\n   ${c.detail.fail}\n   Fix: ${c.fix}`).join('\n\n');
  const warnings=checkResults.filter(c=>c.status==='warn').map(c=>`⚠️  ${c.name}\n   ${c.detail.warn}`).join('\n\n');
  const report=[
    'Phoenix-4 Replica Diagnostic Report','='.repeat(42),'',
    'CRITICAL ISSUES:',criticals||'None','',
    'WARNINGS:',warnings||'None','',
    'AI ANALYSIS:',aiDiagnosis||'Not run','',
    '='.repeat(42),
    'Phoenix-4 Replica Diagnostic Tool · Himanshu Kala · github.com/Hkala402',
  ].join('\n');
  navigator.clipboard.writeText(report)
    .then(()=>alert('Report copied to clipboard!'))
    .catch(()=>alert('Copy failed — please select and copy manually.'));
}
