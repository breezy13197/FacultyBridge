'use strict';

const $=id=>document.getElementById(id);
let examRows=[],brightRows=[],examHeaders=[],brightHeaders=[],matches=[],brightOnlyIndices=[],outputRows=[];
let examCols={},brightCols={},gradeItems=[],activeSavedCourse='',autoUnlocked=false,fileWarnings=[],auditWarnings=[];
let examFilename='',brightFilename='';

function safe(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function normHeader(s){return String(s??'').replace(/^\uFEFF/,'').trim().toLowerCase().replace(/[^a-z0-9%]+/g,'')}
function stripDiacritics(s){return String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')}
function normName(s){return stripDiacritics(s).toLowerCase().trim().replace(/[.,]/g,'').replace(/\s*-\s*/g,'-').replace(/\s+/g,' ')}
function normLastLoose(s){return normName(s).replace(/-/g,' ').replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/\s+/g,' ').trim()}
function blank(v){return String(v??'').trim()===''}
function num(v){if(blank(v))return NaN;const n=Number(String(v).replace(/[%,$]/g,'').trim());return Number.isFinite(n)?n:NaN}
function esc(v){const s=String(v??'');return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
function setSteps(n){[1,2,3].forEach(i=>{const el=$('step'+i);el.classList.remove('active','done');if(i<n)el.classList.add('done');else if(i===n)el.classList.add('active')})}
function resetDownstream(){matches=[];brightOnlyIndices=[];outputRows=[];$('preflightCard').classList.add('hidden');$('reviewCard').classList.add('hidden');$('auditCard').classList.add('hidden');setSteps(1)}
function visibleError(msg,target='reviewStatus'){const el=$(target);if(el)el.innerHTML=`<div class="status bad"><strong>GradeBridge could not continue.</strong><br>${safe(msg)}</div>`}

window.addEventListener('error',e=>{console.error(e.error||e.message);const target=$('reviewCard').classList.contains('hidden')?'preflightAlerts':'reviewStatus';visibleError('An unexpected error occurred. Your source files were not changed. Try reloading GradeBridge and uploading the original CSV files again.',target)});

function parseCSV(text){
  const rows=[];let row=[],field='',q=false;
  for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1];
    if(q){if(c==='"'&&n==='"'){field+='"';i++}else if(c==='"')q=false;else field+=c}
    else{if(c==='"')q=true;else if(c===','){row.push(field);field=''}else if(c==='\n'||(c==='\r'&&n!=='\n')){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field=''}else field+=c}}
  if(field.length||row.length){row.push(field.replace(/\r$/,''));rows.push(row)}
  return rows;
}
function findHeaderRow(matrix,type){
  const limit=Math.min(matrix.length,20);
  for(let i=0;i<limit;i++){
    const hs=matrix[i].map(normHeader);
    const hasFirst=hs.some(h=>['firstname','first'].includes(h));
    const hasLast=hs.some(h=>['lastname','last'].includes(h));
    if(type==='exam'){
      const hasId=hs.some(h=>['studentid','examtakerid','id'].includes(h));
      const hasPts=hs.some(h=>['pts','points','rawscore','score','totalscore'].includes(h));
      const hasPct=hs.some(h=>['%','percent','percentage','percentagescore','percentscore'].includes(h));
      if(hasId&&hasFirst&&hasLast&&(hasPts||hasPct))return i;
    }else{
      const hasOrg=hs.some(h=>['orgdefinedid','orgdefinedID'.toLowerCase()].includes(h));
      if(hasOrg&&hasFirst&&hasLast)return i;
    }
  }
  return -1;
}
function matrixToObjects(matrix,headerIndex){
  const headers=matrix[headerIndex].map(h=>String(h).replace(/^\uFEFF/,'').trim());
  const rows=matrix.slice(headerIndex+1).filter(r=>r.some(v=>String(v).trim()!=='')).map(r=>{
    const obj={};headers.forEach((h,i)=>obj[h]=(r[i]??'').trim());return obj
  });
  return {headers,rows};
}
function findCol(headers,cands){const nh=headers.map(normHeader);for(const c of cands){const i=nh.indexOf(normHeader(c));if(i>=0)return headers[i]}return null}
function mapCols(){
  examCols={
    id:findCol(examHeaders,['StudentID','Student ID','ExamTakerID','Exam Taker ID']),
    first:findCol(examHeaders,['First Name','FirstName','First']),
    last:findCol(examHeaders,['Last Name','LastName','Last']),
    pts:findCol(examHeaders,['Pts','Points','Raw Score','Score','Total Score']),
    pct:findCol(examHeaders,['%','Percent','Percentage','Percentage Score','Percent Score'])
  };
  brightCols={
    org:findCol(brightHeaders,['OrgDefinedId','OrgDefinedID']),
    first:findCol(brightHeaders,['First Name','FirstName','First']),
    last:findCol(brightHeaders,['Last Name','LastName','Last'])
  };
}
function inferMax(){
  if(!examCols.pts||!examCols.pct)return null;
  const vals=[];
  examRows.forEach(r=>{const p=num(r[examCols.pts]),pc=num(r[examCols.pct]);if(Number.isFinite(p)&&Number.isFinite(pc)&&pc>0)vals.push(p/(pc/100))});
  if(!vals.length)return null;vals.sort((a,b)=>a-b);let m=vals[Math.floor(vals.length/2)];
  return Math.abs(m-Math.round(m))<.05?Math.round(m):Math.round(m*100)/100;
}
function scientificId(v){return /^[+-]?\d+(?:\.\d+)?e[+-]?\d+$/i.test(String(v??'').trim())}
// Mojibake is a UTF-8 lead byte (A-tilde, A-circumflex) read as Latin-1/cp1252, so it is followed by a continuation-byte character, never a plain letter: a name like "Angela" with a circumflex A is valid.
function encodingLooksBad(text){return text.includes('\uFFFD')||/[\u00C3\u00C2][\u0080-\u00BF\u0152\u0153\u0160\u0161\u0178\u017D\u017E\u0192\u02C6\u02DC\u2013-\u203A\u20AC\u2122]|\u00E2\u20AC/.test(text)}
function existingPointItems(headers){
  return headers.filter(h=>/\sPoints Grade\s*$/i.test(h)).map(h=>h.replace(/\sPoints Grade\s*$/i,'').trim()).filter(Boolean);
}
function sortedBrightIndices(){return brightRows.map((b,i)=>({b,i})).sort((x,y)=>{const l=normName(x.b[brightCols.last]).localeCompare(normName(y.b[brightCols.last]));return l!==0?l:normName(x.b[brightCols.first]).localeCompare(normName(y.b[brightCols.first]))}).map(x=>x.i)}
function courseStore(){try{return JSON.parse(localStorage.getItem('gradebridge_profiles_v6')||'{}')}catch{return {}}}
function saveStore(v){localStorage.setItem('gradebridge_profiles_v6',JSON.stringify(v))}
function migrateLegacyProfiles(){
  try{
    if(localStorage.getItem('gradebridge_profiles_v6'))return;
    const legacy=JSON.parse(localStorage.getItem('gradebridge_profiles')||'{}');
    const names=Object.keys(legacy);
    if(!names.length)return;
    const migrated={};
    names.forEach(name=>{
      const p=legacy[name];
      if(Array.isArray(p.roster)&&p.roster.length){
        migrated[name]={
          savedAt:p.updated||new Date().toISOString(),
          roster:p.roster,
          map:p.map||{},
          gradeItems:p.gradeItems||[]
        };
      }
    });
    if(Object.keys(migrated).length)saveStore(migrated);
  }catch(e){console.warn('Legacy profile migration skipped',e)}
}
function ageDays(iso){if(!iso)return Infinity;return Math.floor((Date.now()-new Date(iso).getTime())/86400000)}
function detectCourseName(filename){return filename.replace(/\.[^.]+$/,'').replace(/_GradesExport.*$/i,'').replace(/[-_]+/g,' ').replace(/\s+/g,' ').trim()||'Course'}
function populateSaved(){
  const store=courseStore(),names=Object.keys(store).sort(),sel=$('savedSelect');
  sel.innerHTML='<option value="">— Select saved course —</option>';
  names.forEach(n=>{const o=document.createElement('option');o.value=n;o.textContent=n;sel.appendChild(o)});
  $('savedPicker').classList.toggle('hidden',names.length===0);
  if(activeSavedCourse&&store[activeSavedCourse])sel.value=activeSavedCourse;
}
function loadSavedProfile(name){
  const p=courseStore()[name];if(!p)return;
  activeSavedCourse=name;
  brightRows=(p.roster||[]).map(r=>({...r}));
  brightHeaders=['OrgDefinedId','First Name','Last Name'];
  brightCols={org:'OrgDefinedId',first:'First Name',last:'Last Name'};
  gradeItems=p.gradeItems||[];
  brightFilename='Saved course profile';
  const days=ageDays(p.savedAt);
  $('savedAgeText').innerHTML=`Saved ${days} day${days===1?'':'s'} ago • ${p.roster?.length||0} students${days>60?' • <strong>Roster is more than 60 days old; consider uploading a fresh Brightspace export.</strong>':''}`;
  $('brightStatus').innerHTML=`<div class="status ${days>60?'warn':'good'}">${days>60?'⚠':'✓'} Using saved roster: <strong>${safe(name)}</strong>${days>60?` (${days} days old)`:''}</div>`;
  if(examRows.length)showPreflight();
}
function clearSavedSelection(){
  activeSavedCourse='';brightRows=[];brightHeaders=[];brightCols={};gradeItems=[];$('savedSelect').value='';$('savedAgeText').textContent='';$('brightStatus').innerHTML='';resetDownstream();
  if(examRows.length)$('examStatus').insertAdjacentHTML('beforeend','<div class="status info">ExamSoft file is still loaded. Upload a Brightspace file or select another saved course.</div>');
}
async function decodeFile(file){
  const buf=await file.arrayBuffer();
  const text=new TextDecoder('utf-8',{fatal:false}).decode(buf);
  return text;
}
async function readSource(file,type){
  try{
    if(!file.name.toLowerCase().endsWith('.csv')){
      const msg=type==='exam'?'ExamSoft must be exported as CSV. Return to ExamSoft, choose the CSV results export, and upload that file directly without opening it in Excel.':'Brightspace must be exported as CSV. Download a fresh grade export and upload it directly without opening it in Excel.';
      throw new Error(msg);
    }
    const text=await decodeFile(file);
    if(encodingLooksBad(text))throw new Error('This CSV appears to use an unsupported text encoding or was altered by another program. Download a fresh CSV and upload it directly. If you must save the file, use UTF-8 CSV.');
    const matrix=parseCSV(text);
    const hi=findHeaderRow(matrix,type);
    if(hi<0){
      const preview=(matrix.slice(0,5).map(r=>r.join(' | ')).join('\n')).slice(0,600);
      throw new Error(`GradeBridge could not find the expected ${type==='exam'?'ExamSoft':'Brightspace'} header row in the first 20 rows. The file may be the wrong report type. First rows found: ${preview}`);
    }
    const obj=matrixToObjects(matrix,hi);
    if(type==='exam'){
      examRows=obj.rows;examHeaders=obj.headers;examFilename=file.name;mapCols();
      if(!examCols.id||!examCols.first||!examCols.last)throw new Error('The ExamSoft file must include StudentID, First Name, and Last Name.');
      if(!examCols.pts){
        if(examCols.pct)throw new Error('This ExamSoft export contains percentages but no raw points. GradeBridge intentionally does not calculate grades from percentages. Re-export the assessment from ExamSoft with the Pts/raw-points column included.');
        throw new Error('The ExamSoft file does not contain a recognizable raw-points column (Pts, Points, Raw Score, Score, or Total Score). Re-export the assessment with raw points included.');
      }
      $('examStatus').innerHTML=`<div class="status good">✓ ${examRows.length} ExamSoft record${examRows.length===1?'':'s'} loaded from <strong>${safe(file.name)}</strong>${hi>0?` • header detected on row ${hi+1}`:''}</div>`;
    }else{
      brightRows=obj.rows;brightHeaders=obj.headers;brightFilename=file.name;activeSavedCourse='';$('savedSelect').value='';mapCols();
      if(!brightCols.org||!brightCols.first||!brightCols.last)throw new Error('The Brightspace file must include OrgDefinedId, First Name, and Last Name.');
      const mangled=brightRows.filter(r=>scientificId(r[brightCols.org]));
      if(mangled.length)throw new Error(`Brightspace student IDs appear to have been changed by Excel. GradeBridge found ${mangled.length} OrgDefinedId value${mangled.length===1?'':'s'} in scientific notation (for example, ${mangled[0][brightCols.org]}). GradeBridge cannot safely reconstruct the original IDs. Return to Brightspace, download a new grade CSV, do not open or save it in Excel, and upload the newly downloaded file directly.`);
      gradeItems=existingPointItems(brightHeaders);
      $('brightStatus').innerHTML=`<div class="status good">✓ ${brightRows.length} Brightspace student${brightRows.length===1?'':'s'} loaded from <strong>${safe(file.name)}</strong>${hi>0?` • header detected on row ${hi+1}`:''}</div>`;
    }
    resetDownstream();
    if(examRows.length&&brightRows.length)showPreflight();
  }catch(err){
    if(type==='exam'){examRows=[];examHeaders=[];examCols={};$('examStatus').innerHTML=`<div class="status bad"><strong>Cannot use this ExamSoft file.</strong><br>${safe(err.message)}</div>`}
    else{brightRows=[];brightHeaders=[];brightCols={};gradeItems=[];$('brightStatus').innerHTML=`<div class="status bad"><strong>Cannot use this Brightspace file.</strong><br>${safe(err.message)}</div>`}
    resetDownstream();
  }
}
function wireDrop(dropId,fileId,type){
  const d=$(dropId),f=$(fileId);
  const choose=()=>f.click();
  d.addEventListener('click',e=>{if(e.target.tagName!=='BUTTON')choose()});d.querySelector('button').addEventListener('click',e=>{e.stopPropagation();choose()});
  d.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose()}});
  f.addEventListener('change',()=>f.files[0]&&readSource(f.files[0],type));
  ['dragenter','dragover'].forEach(ev=>d.addEventListener(ev,e=>{e.preventDefault();d.classList.add('drag')}));
  ['dragleave','drop'].forEach(ev=>d.addEventListener(ev,e=>{e.preventDefault();d.classList.remove('drag')}));
  d.addEventListener('drop',e=>{const file=e.dataTransfer.files[0];if(file)readSource(file,type)});
}
function showPreflight(){
  try{
    mapCols();fileWarnings=[];
    const inferred=inferMax();
    if(inferred!==null){$('maxPoints').value=inferred;$('maxHelp').textContent=`ExamSoft percentages were detected. GradeBridge inferred a ${inferred}-point maximum and will use percentages only as an informational consistency check.`}
    else{$('maxPoints').value='';$('maxHelp').textContent='No usable percentage data was found. Enter the assessment maximum points manually; GradeBridge will still import the raw ExamSoft points.'}
    $('pfExam').textContent=examRows.length;$('pfBright').textContent=brightRows.length;$('pfMax').textContent=inferred??'Enter manually';$('pfItems').textContent=gradeItems.length;
    const sel=$('gradeItemSelect');sel.innerHTML='<option value="">— Select grade item —</option>';
    gradeItems.slice().sort((a,b)=>a.localeCompare(b)).forEach(g=>{const o=document.createElement('option');o.value=g;o.textContent=g;sel.appendChild(o)});
    const other=document.createElement('option');other.value='__manual__';other.textContent='Enter another grade item…';sel.appendChild(other);
    $('manualGradeWrap').classList.add('hidden');$('manualGradeName').value='';
    const alerts=[];
    const ids=brightRows.map(r=>String(r[brightCols.org]??'').trim()).filter(Boolean);
    const lens=[...new Set(ids.filter(x=>!scientificId(x)).map(x=>x.length))];
    if(lens.length>3)alerts.push('Brightspace OrgDefinedId values have several different lengths. This may be legitimate, but review the file if you recently opened it in Excel.');
    const duplicateIds=examRows.reduce((m,r)=>{const id=String(r[examCols.id]??'').trim();m[id]=(m[id]||0)+1;return m},{});
    const dupCount=Object.values(duplicateIds).filter(n=>n>1).length;
    if(dupCount)alerts.push(`${dupCount} ExamSoft student ID${dupCount===1?' has':'s have'} multiple rows. GradeBridge will ask you to choose which attempt to import.`);
    $('preflightAlerts').innerHTML=alerts.map(a=>`<div class="status warn">⚠ ${safe(a)}</div>`).join('')||'<div class="status good">✓ Required file structure and student identifiers passed preflight checks.</div>';
    $('preflightCard').classList.remove('hidden');setSteps(1);$('preflightCard').scrollIntoView({behavior:'smooth',block:'start'});
  }catch(err){visibleError(err.message,'preflightAlerts')}
}
function selectedGradeName(){return $('gradeItemSelect').value==='__manual__'?$('manualGradeName').value.trim():$('gradeItemSelect').value.trim()}
function buildMatches(){
  const byExact=new Map();brightRows.forEach((b,i)=>{const k=normName(b[brightCols.first])+'|'+normLastLoose(b[brightCols.last]);if(!byExact.has(k))byExact.set(k,[]);byExact.get(k).push(i)});
  const byLast=new Map();brightRows.forEach((b,i)=>{const k=normLastLoose(b[brightCols.last]);if(!byLast.has(k))byLast.set(k,[]);byLast.get(k).push(i)});
  const store=courseStore(),saved=activeSavedCourse&&store[activeSavedCourse]?store[activeSavedCourse].map||{}:{};
  const idGroups={};examRows.forEach((e,i)=>{const id=String(e[examCols.id]??'').trim();if(!idGroups[id])idGroups[id]=[];idGroups[id].push(i)});
  const duplicateSet=new Set(Object.values(idGroups).filter(a=>a.length>1).flat());

  matches=examRows.map((e,ei)=>{
    const sid=String(e[examCols.id]??'').trim(),score=num(e[examCols.pts]),missingScore=!Number.isFinite(score);
    const base={e,ei,bi:null,matchStatus:'unmatched',matchConfirmed:false,excluded:false,scoreStatus:missingScore?'missing':'valid',scoreValue:missingScore?null:score,duplicateGroup:duplicateSet.has(ei)?sid:null,suggestionReason:''};
    if(duplicateSet.has(ei))return {...base,matchStatus:'duplicate',suggestionReason:'Multiple ExamSoft rows share this StudentID.'};
    if(saved[sid]){
      const bi=brightRows.findIndex(b=>String(b[brightCols.org])===String(saved[sid]));
      if(bi>=0)return {...base,bi,matchStatus:'saved',matchConfirmed:true};
    }
    const key=normName(e[examCols.first])+'|'+normLastLoose(e[examCols.last]),exact=byExact.get(key)||[];
    if(exact.length===1)return {...base,bi:exact[0],matchStatus:'exact',matchConfirmed:true};
    if(exact.length>1)return {...base,matchStatus:'review',suggestionReason:'Multiple Brightspace students share this normalized name.'};
    const lastKey=normLastLoose(e[examCols.last]),lastMatches=byLast.get(lastKey)||[];
    if(lastMatches.length===1)return {...base,matchStatus:'review',suggested:lastMatches[0],suggestionReason:'Unique matching last name; faculty confirmation required.'};
    return base;
  });

  const examNameKeys=new Set(examRows.map(e=>normName(e[examCols.first])+'|'+normLastLoose(e[examCols.last])));
  brightOnlyIndices=brightRows.map((_,i)=>i).filter(i=>{
    const b=brightRows[i];
    return !examNameKeys.has(normName(b[brightCols.first])+'|'+normLastLoose(b[brightCols.last]));
  });
  renderReview();
}
function needsAttention(m){return !m.excluded && (m.matchStatus==='duplicate'||!m.matchConfirmed||m.scoreStatus==='missing')}
function renderReview(){
  renderAttention();renderAuto();renderBrightOnly();refreshMetrics();
  $('reviewCard').classList.remove('hidden');$('auditCard').classList.add('hidden');setSteps(2);
  const n=matches.filter(needsAttention).length;
  $('reviewStatus').innerHTML=n?`<div class="status warn"><strong>${n} record${n===1?' needs':'s need'} faculty attention.</strong> Resolve each record before preparing the final audit.</div>`:'<div class="status good"><strong>✓ Every ExamSoft record has a safe disposition.</strong> You can review automatic matches or continue to the final audit.</div>';
}
function studentName(m){return `${m.e[examCols.last]}, ${m.e[examCols.first]}`}
function brightLabel(i){const b=brightRows[i];return `${b[brightCols.last]}, ${b[brightCols.first]} (${b[brightCols.org]})`}
function makeBrightSelect(m,idx){
  const s=document.createElement('select');const blankOpt=document.createElement('option');blankOpt.value='';blankOpt.textContent='— Select Brightspace student —';s.appendChild(blankOpt);
  sortedBrightIndices().forEach(i=>{const o=document.createElement('option');o.value=i;o.textContent=(m.suggested===i?'Suggested: ':'')+brightLabel(i);s.appendChild(o)});
  if(m.bi!=null)s.value=m.bi;else if(m.suggested!=null)s.value=m.suggested;
  return s;
}
function duplicateRows(group){return matches.filter(m=>m.duplicateGroup===group)}
function useDuplicateAttempt(idx){
  const chosen=matches[idx],group=chosen.duplicateGroup;
  duplicateRows(group).forEach(m=>{if(m===chosen){m.duplicateGroup=null;m.matchStatus='unmatched';m.excluded=false;m.matchConfirmed=false}else{m.excluded=true;m.matchConfirmed=true;m.matchStatus='excluded-duplicate'}});
  // Re-run matching for the chosen record only using current roster.
  const e=chosen.e;
  const exact=brightRows.map((b,i)=>({b,i})).filter(x=>normName(x.b[brightCols.first])===normName(e[examCols.first])&&normLastLoose(x.b[brightCols.last])===normLastLoose(e[examCols.last]));
  if(exact.length===1){chosen.bi=exact[0].i;chosen.matchStatus='exact';chosen.matchConfirmed=true}
  else{
    const last=brightRows.map((b,i)=>({b,i})).filter(x=>normLastLoose(x.b[brightCols.last])===normLastLoose(e[examCols.last]));
    if(last.length===1){chosen.suggested=last[0].i;chosen.matchStatus='review';chosen.suggestionReason='Unique matching last name; faculty confirmation required.'}
  }
  renderReview();
}
function confirmManual(idx,bi){
  const m=matches[idx];
  if(bi==null||bi===''){alert('Choose a Brightspace student first.');return}
  bi=Number(bi);
  const dup=matches.find((x,j)=>j!==idx&&!x.excluded&&x.matchConfirmed&&x.bi===bi);
  if(dup){alert(`That Brightspace student is already assigned to ${studentName(dup)}. Change or exclude that record first.`);return}
  m.bi=bi;m.matchConfirmed=true;m.matchStatus=(m.matchStatus==='exact'||m.matchStatus==='saved')?'corrected':'manual';renderReview();
}
function excludeRecord(idx,reason='Excluded by faculty'){
  const m=matches[idx];if(!confirm(`Exclude ${studentName(m)} from this Brightspace import? The ExamSoft record will remain unchanged; it will simply be omitted from the generated CSV.`))return;
  m.excluded=true;m.matchConfirmed=true;m.bi=null;m.matchStatus='excluded';m.excludeReason=reason;renderReview();
}
function enterZero(idx){
  const m=matches[idx];if(!confirm(`Enter a score of 0 for ${studentName(m)}? Use this only when zero is the intended grade, not merely because the ExamSoft score is blank.`))return;
  m.scoreValue=0;m.scoreStatus='zero-entered';renderReview();
}
function renderAttention(){
  const rows=matches.map((m,i)=>({m,i})).filter(x=>needsAttention(x.m));
  $('attentionSection').classList.toggle('hidden',rows.length===0);const t=$('attentionTable');t.innerHTML='';
  if(!rows.length)return;
  t.innerHTML='<thead><tr><th>ExamSoft student</th><th>Issue</th><th>Brightspace match / attempt</th><th>Action</th></tr></thead>';const tb=document.createElement('tbody');
  rows.forEach(({m,i})=>{
    const tr=document.createElement('tr');
    const issues=[];
    if(m.matchStatus==='duplicate')issues.push('Multiple ExamSoft attempts');
    else if(!m.matchConfirmed)issues.push(m.suggestionReason||'No confirmed Brightspace match');
    if(m.scoreStatus==='missing')issues.push('No score in ExamSoft');
    const td1=document.createElement('td');td1.innerHTML=`<strong>${safe(studentName(m))}</strong><br><span class="small-note">${safe(m.e[examCols.id])}</span>`;tr.appendChild(td1);
    const td2=document.createElement('td');td2.innerHTML=issues.map(x=>`<span class="badge badge-warn">${safe(x)}</span>`).join(' ');tr.appendChild(td2);
    const td3=document.createElement('td');
    let sel=null;
    if(m.matchStatus==='duplicate'){
      td3.innerHTML=`Attempt score: <strong>${blank(m.e[examCols.pts])?'blank':safe(m.e[examCols.pts])}</strong>`;
    }else if(!m.matchConfirmed){sel=makeBrightSelect(m,i);td3.appendChild(sel)}
    else td3.textContent=brightLabel(m.bi);
    tr.appendChild(td3);
    const td4=document.createElement('td');td4.className='row-actions';
    if(m.matchStatus==='duplicate'){const b=document.createElement('button');b.className='mini mini-primary';b.textContent='Use this attempt';b.onclick=()=>useDuplicateAttempt(i);td4.appendChild(b)}
    else if(!m.matchConfirmed){const b=document.createElement('button');b.className='mini mini-primary';b.textContent='Confirm match';b.onclick=()=>confirmManual(i,sel.value);td4.appendChild(b)}
    if(m.scoreStatus==='missing'){const z=document.createElement('button');z.className='mini mini-secondary';z.textContent='Enter 0';z.onclick=()=>enterZero(i);td4.appendChild(z)}
    const ex=document.createElement('button');ex.className='mini mini-danger';ex.textContent='Exclude from import';ex.onclick=()=>excludeRecord(i,m.scoreStatus==='missing'?'No score in ExamSoft':'Excluded by faculty');td4.appendChild(ex);
    tr.appendChild(td4);tb.appendChild(tr);
  });t.appendChild(tb);
}
function renderAuto(){
  const rows=matches.map((m,i)=>({m,i})).filter(x=>!x.m.excluded&&x.m.matchConfirmed&&x.m.bi!=null&&!needsAttention(x.m));
  const t=$('autoTable');t.innerHTML='<thead><tr><th>ExamSoft student</th><th>Brightspace student</th><th>Status</th><th>Action</th></tr></thead>';const tb=document.createElement('tbody');
  rows.forEach(({m,i})=>{
    const tr=document.createElement('tr');tr.innerHTML=`<td>${safe(studentName(m))}</td>`;
    const td2=document.createElement('td');
    if(autoUnlocked){const s=makeBrightSelect(m,i);s.value=m.bi;td2.appendChild(s);m._edit=s}else td2.textContent=brightLabel(m.bi);
    tr.appendChild(td2);
    const td3=document.createElement('td');let label=m.matchStatus==='saved'?'Saved ID match':m.matchStatus==='manual'?'Manually matched by faculty':m.matchStatus==='corrected'?'Manually corrected by faculty':'Exact name match';td3.innerHTML=`<span class="badge ${['manual','corrected'].includes(m.matchStatus)?'badge-warn':'badge-good'}">${label}</span>`;tr.appendChild(td3);
    const td4=document.createElement('td');if(autoUnlocked){const b=document.createElement('button');b.className='mini mini-primary';b.textContent='Save change';b.onclick=()=>confirmManual(i,m._edit.value);td4.appendChild(b)}else td4.innerHTML='<span class="badge badge-muted">Locked</span>';tr.appendChild(td4);tb.appendChild(tr)
  });t.appendChild(tb);
}
function renderBrightOnly(){
  const rel=brightOnlyIndices.map(i=>({i,b:brightRows[i]}));$('brightOnlyDetails').classList.toggle('hidden',rel.length===0);$('mBrightOnly').textContent=rel.filter(x=>!matches.some(m=>!m.excluded&&m.matchConfirmed&&m.bi===x.i)).length;
  if(!rel.length)return;
  const manualTargets=new Set(matches.filter(m=>!m.excluded&&m.matchConfirmed&&m.bi!=null&&['manual','corrected'].includes(m.matchStatus)).map(m=>m.bi));
  const still=rel.filter(x=>!matches.some(m=>!m.excluded&&m.matchConfirmed&&m.bi===x.i)).length;
  $('brightOnlyNotice').innerHTML=`${rel.length} Brightspace student${rel.length===1?' has':'s have'} no same-name ExamSoft record. <strong>${still} currently remain without an ExamSoft assignment.</strong>`;
  const t=$('brightOnlyTable');t.innerHTML='<thead><tr><th>Brightspace student</th><th>OrgDefinedId</th><th>Action</th></tr></thead>';const tb=document.createElement('tbody');
  rel.sort((x,y)=>normName(x.b[brightCols.last]).localeCompare(normName(y.b[brightCols.last]))||normName(x.b[brightCols.first]).localeCompare(normName(y.b[brightCols.first]))).forEach(({i,b})=>{
    const matched=manualTargets.has(i),tr=document.createElement('tr');tr.innerHTML=`<td>${safe(b[brightCols.last]+', '+b[brightCols.first])}</td><td>${safe(b[brightCols.org])}</td><td>${matched?'<span class="badge badge-warn">Record manually matched by faculty</span>':'<span class="badge badge-muted">No ExamSoft record</span>'}</td>`;tb.appendChild(tr)
  });t.appendChild(tb)
}
function refreshMetrics(){
  $('mResolved').textContent=matches.filter(m=>!needsAttention(m)).length;$('mAttention').textContent=matches.filter(needsAttention).length;$('mExcluded').textContent=matches.filter(m=>m.excluded).length;
}
function percentageWarnings(max){
  const warnings=[];if(!examCols.pct)return warnings;
  let normal=0,substantial=0;const tol=Math.max(.25,(.5/max)*100);
  matches.filter(m=>!m.excluded&&m.scoreStatus!=='missing').forEach(m=>{
    const pc=num(m.e[examCols.pct]),p=m.scoreValue;if(!Number.isFinite(pc)||!Number.isFinite(p))return;
    const diff=Math.abs((p/max*100)-pc);if(diff>tol){normal++;if(diff>Math.max(2,tol*3))substantial++}
  });
  if(normal)warnings.push(`${normal} imported row${normal===1?' has':'s have'} an ExamSoft percentage that differs from the percentage calculated from raw points by more than the rounding tolerance (${tol.toFixed(2)} percentage points). ${substantial?`${substantial} difference${substantial===1?' is':'s are'} substantial. `:''}Raw points remain the imported value.`);
  return warnings;
}
function bonusWarnings(max){
  return matches.filter(m=>!m.excluded&&Number.isFinite(m.scoreValue)&&m.scoreValue>max).map(m=>`${studentName(m)}: ${m.scoreValue}/${max} (bonus/over-maximum score)`);
}
function prepareAudit(){
  try{
    const grade=selectedGradeName(),max=num($('maxPoints').value),errors=[];
    if(!grade)errors.push('Select or enter the Brightspace grade item name.');
    if(!Number.isFinite(max)||max<=0)errors.push('Enter the assessment maximum points.');
    const unresolved=matches.filter(needsAttention);if(unresolved.length)errors.push(`${unresolved.length} ExamSoft record${unresolved.length===1?' still needs':'s still need'} resolution.`);
    const seen=new Set();matches.filter(m=>!m.excluded&&m.matchConfirmed).forEach(m=>{if(m.bi==null)errors.push(`${studentName(m)} has no Brightspace assignment.`);else{const id=brightRows[m.bi][brightCols.org];if(seen.has(id))errors.push(`Brightspace student ${id} is assigned more than once.`);seen.add(id)}});
    if(errors.length){$('reviewStatus').innerHTML=`<div class="status bad"><strong>Cannot prepare final audit.</strong><br>${errors.map(safe).join('<br>')}</div>`;return}
    if($('saveProfile').checked){
      const name=$('profileName').value.trim();if(!name){$('reviewStatus').innerHTML='<div class="status bad">Enter a saved-course profile name that includes the course and academic term, or turn off saving.</div>';return}
      const store=courseStore();if(store[name]&&!confirm(`A saved course named "${name}" already exists. Replace it with the current roster and mappings?`))return;
      const map={};matches.filter(m=>!m.excluded&&m.matchConfirmed&&m.bi!=null).forEach(m=>map[m.e[examCols.id]]=brightRows[m.bi][brightCols.org]);
      store[name]={savedAt:new Date().toISOString(),roster:brightRows.map(b=>({OrgDefinedId:b[brightCols.org],'First Name':b[brightCols.first],'Last Name':b[brightCols.last]})),map,gradeItems:[...new Set(gradeItems.concat([grade]))]};
      saveStore(store);activeSavedCourse=name;populateSaved();
    }
    const included=matches.filter(m=>!m.excluded&&m.matchConfirmed&&m.bi!=null);
    outputRows=[['OrgDefinedId',`${grade} Points Grade`,'End-of-Line Indicator'],...included.map(m=>[brightRows[m.bi][brightCols.org],m.scoreValue,'#'])];
    auditWarnings=[...percentageWarnings(max)];
    const bonus=bonusWarnings(max);if(bonus.length)auditWarnings.push(`Bonus/over-maximum scores detected: ${bonus.join('; ')}. GradeBridge will preserve these raw ExamSoft points.`);
    const old=activeSavedCourse?ageDays(courseStore()[activeSavedCourse]?.savedAt):0;if(activeSavedCourse&&old>60)auditWarnings.push(`The saved Brightspace roster is ${old} days old. Consider uploading a fresh Brightspace export before importing grades.`);
    renderAudit(grade,max,included);
  }catch(err){visibleError(err.message)}
}
function renderAudit(grade,max,included){
  const auto=matches.filter(m=>!m.excluded&&['exact','saved'].includes(m.matchStatus)).length,manual=matches.filter(m=>!m.excluded&&['manual','corrected'].includes(m.matchStatus)).length,excluded=matches.filter(m=>m.excluded),brightUnchanged=brightOnlyIndices.filter(i=>!matches.some(m=>!m.excluded&&m.matchConfirmed&&m.bi===i)).length;
  $('aAuto').textContent=auto;$('aManual').textContent=manual;$('aExcluded').textContent=excluded.length;$('aBrightOnly').textContent=brightUnchanged;
  $('auditHeadline').innerHTML=`<strong>${safe(grade)}</strong> • raw points out of <strong>${max}</strong> • ${included.length} grade${included.length===1?'':'s'} ready for import.`;
  $('auditWarnings').innerHTML=auditWarnings.map(w=>`<div class="status warn">⚠ ${safe(w)}</div>`).join('');
  $('excludedBox').classList.toggle('hidden',excluded.length===0);$('excludedList').innerHTML=excluded.map(m=>`<li><strong>${safe(studentName(m))}</strong> — ${safe(m.excludeReason||'Excluded by faculty')}</li>`).join('');
  $('maxConfirmMessage').innerHTML=`GradeBridge will import <strong>raw points out of ${max}</strong> into <strong>${safe(grade)}</strong>. Before downloading, confirm that the Brightspace grade item is also configured for <strong>${max} points</strong>. If it is not, every student's displayed percentage will be wrong.`;
  $('maxConfirmLabel').innerHTML=`I confirm that <strong>${safe(grade)}</strong> in Brightspace is worth <strong>${max} points</strong>.`;
  $('maxConfirm').checked=false;$('downloadBtn').disabled=true;
  const t=$('previewTable');t.innerHTML='<thead><tr>'+outputRows[0].map(h=>`<th>${safe(h)}</th>`).join('')+'</tr></thead>';const tb=document.createElement('tbody');outputRows.slice(1,21).forEach(r=>{const tr=document.createElement('tr');tr.innerHTML=r.map(v=>`<td>${safe(v)}</td>`).join('');tb.appendChild(tr)});t.appendChild(tb);
  $('filePill').textContent=`Brightspace_${grade.replace(/[^\w.-]+/g,'_')}.csv`;$('auditCard').classList.remove('hidden');setSteps(3);$('auditCard').scrollIntoView({behavior:'smooth',block:'start'});
}
function renderSavedModal(){
  const store=courseStore(),names=Object.keys(store).sort(),box=$('savedList');box.innerHTML='';
  if(!names.length){box.innerHTML='<div class="status info">No saved course data exists in this browser.</div>';return}
  names.forEach(name=>{const p=store[name],days=ageDays(p.savedAt),row=document.createElement('div');row.className='course-row';
    const info=document.createElement('div');info.innerHTML=`<strong>${safe(name)}</strong><small>${p.roster?.length||0} students • saved ${days} day${days===1?'':'s'} ago${days>60?' • roster age warning':''}</small>`;
    const acts=document.createElement('div');acts.className='row-actions';const use=document.createElement('button');use.className='mini mini-primary';use.textContent='Use';use.onclick=()=>{$('savedModal').classList.add('hidden');$('savedSelect').value=name;loadSavedProfile(name)};
    const del=document.createElement('button');del.className='mini mini-danger';del.textContent='Delete';del.onclick=()=>{if(confirm(`Delete the saved course "${name}" from this browser?`)){const s=courseStore();delete s[name];saveStore(s);if(activeSavedCourse===name)clearSavedSelection();populateSaved();renderSavedModal()}};
    acts.append(use,del);row.append(info,acts);box.appendChild(row)
  })
}
function applyTheme(t){document.documentElement.dataset.ftTheme=t;document.body.classList.toggle('dark',t==='dark');$('themeToggle').textContent=t==='dark'?'☀️ Light':'🌙 Dark';localStorage.setItem('ft-theme',t)}

wireDrop('examDrop','examFile','exam');wireDrop('brightDrop','brightFile','bright');
$('savedSelect').addEventListener('change',e=>{if(e.target.value)loadSavedProfile(e.target.value);else clearSavedSelection()});
$('clearSavedSelection').onclick=clearSavedSelection;
$('gradeItemSelect').addEventListener('change',()=>{$('manualGradeWrap').classList.toggle('hidden',$('gradeItemSelect').value!=='__manual__')});
$('continueBtn').onclick=()=>{try{const max=num($('maxPoints').value);if(!Number.isFinite(max)||max<=0){$('preflightAlerts').innerHTML='<div class="status bad">Enter the assessment maximum points before continuing.</div>';return}if(!selectedGradeName()){$('preflightAlerts').innerHTML='<div class="status bad">Select an existing Brightspace grade item or enter another grade item name before continuing.</div>';return}buildMatches();$('reviewCard').scrollIntoView({behavior:'smooth',block:'start'})}catch(err){visibleError(err.message,'preflightAlerts')}};
$('unlockBtn').onclick=()=>{autoUnlocked=!autoUnlocked;$('unlockBtn').textContent=autoUnlocked?'Lock matching':'Unlock matching';renderAuto()};
$('saveProfile').addEventListener('change',()=>{$('profileWrap').classList.toggle('hidden',!$('saveProfile').checked);if($('saveProfile').checked&&!$('profileName').value)$('profileName').value=(activeSavedCourse||detectCourseName(brightFilename))+' – '+new Date().getFullYear()});
$('prepareBtn').onclick=prepareAudit;
$('maxConfirm').addEventListener('change',()=>{$('downloadBtn').disabled=!$('maxConfirm').checked});
$('downloadBtn').onclick=()=>{if(!$('maxConfirm').checked)return;const csv=outputRows.map(r=>r.map(esc).join(',')).join('\r\n')+'\r\n';const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=$('filePill').textContent;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url)};
$('resetBtn').onclick=()=>location.reload();
$('themeToggle').onclick=()=>applyTheme(document.body.classList.contains('dark')?'light':'dark');
$('helpBtn').onclick=()=>{$('helpModal').classList.remove('hidden');$('closeHelp').focus()};
$('closeHelp').onclick=()=>{$('helpModal').classList.add('hidden');$('helpBtn').focus()};
$('savedBtn').onclick=()=>{renderSavedModal();$('savedModal').classList.remove('hidden');$('closeSaved').focus()};
$('closeSaved').onclick=()=>{$('savedModal').classList.add('hidden');$('savedBtn').focus()};
$('deleteAllBtn').onclick=()=>{if(confirm('Delete every saved GradeBridge course profile and student mapping from this browser?')){localStorage.removeItem('gradebridge_profiles_v6');activeSavedCourse='';brightRows=[];brightHeaders=[];brightCols={};populateSaved();renderSavedModal();clearSavedSelection()}};
[$('helpModal'),$('savedModal')].forEach(m=>m.addEventListener('click',e=>{if(e.target===m)m.classList.add('hidden')}));
document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('helpModal').classList.add('hidden');$('savedModal').classList.add('hidden')}});

migrateLegacyProfiles();applyTheme(localStorage.getItem('ft-theme')||'light');populateSaved();
