(() => {
  'use strict';

  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const state = { exam:null, filter:'all', facultyFilter:'all', exceptions:{} };
  const ITEM_TYPES = Object.freeze({ MCQ:'MCQ', MULTIPLE:'Multiple response', MATCHING:'Matching', FITB:'Fill in the blank', OTHER:'Other', KTYPE:'K-type', HOTSPOT:'Hot spot' });


  const root = document.documentElement;
  const savedTheme = localStorage.getItem('ft-theme');
  if (savedTheme === 'dark') root.dataset.ftTheme = 'dark';
  $('#themeToggle').addEventListener('click', () => {
    const dark = root.dataset.ftTheme === 'dark';
    root.dataset.ftTheme = dark ? 'light' : 'dark';
    localStorage.setItem('ft-theme', dark ? 'light' : 'dark');
  });

  const dropZone = $('#dropZone');
  const fileInput = $('#fileInput');
  $('#chooseBtn').addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
  ['dragenter','dragover'].forEach(t => dropZone.addEventListener(t, e => { e.preventDefault(); dropZone.classList.add('is-dragging'); }));
  ['dragleave','drop'].forEach(t => dropZone.addEventListener(t, e => { e.preventDefault(); dropZone.classList.remove('is-dragging'); }));
  dropZone.addEventListener('drop', e => { const f=e.dataTransfer.files?.[0]; if(f) loadFile(f); });
  fileInput.addEventListener('change', () => { if(fileInput.files?.[0]) loadFile(fileInput.files[0]); });
  $('#changeFileBtn').addEventListener('click', () => requestReset());
  $('#printBtn').addEventListener('click', openReportModal);
  $('#generateReportBtn').addEventListener('click', () => {
    const scope=$('#reportFaculty').value;
    const selected=new Set($$('[data-report-finding]:checked',$('#reportFindingOptions')).map(x=>x.dataset.reportFinding));
    const includePassed=$('#reportIncludePassed').checked;
    buildReport(scope,selected,includePassed);
    closeReportModal();
    updateSteps('report');
    setTimeout(()=>window.print(),80);
  });

  $$('.ft-step[data-step]').forEach(btn=>btn.addEventListener('click',()=>{
    const step=btn.dataset.step;
    if(step==='upload'){ if(state.exam) requestReset(); return; }
    if(!state.exam) return;
    if(step==='review'){
      updateSteps('review');
      $('#resultsView').scrollIntoView({behavior:'smooth',block:'start'});
    } else if(step==='report') openReportModal();
  }));
  $('#reportNotes').addEventListener('input', saveSession);

  $$('.eb-sidebar button[data-section]').forEach(btn => btn.addEventListener('click', () => {
    $$('.eb-sidebar button[data-section]').forEach(b => {
      b.classList.remove('is-active');
      b.removeAttribute('aria-current');
    });
    btn.classList.add('is-active');
    btn.setAttribute('aria-current','true');
    document.getElementById(btn.dataset.section).scrollIntoView({behavior:'smooth', block:'start'});
  }));

  function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('is-visible'); setTimeout(()=>t.classList.remove('is-visible'),2200); }
  function esc(v=''){ return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function pct(n,d){ return d ? (100*n/d).toFixed(1)+'%' : '0.0%'; }
  function normalizeSpace(s=''){ return s.replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim(); }

  async function loadFile(file){
    hideUploadError();
    if(!/\.(doc|rtf)$/i.test(file.name)) return showUploadError('Please choose an ExamSoft Word export ending in .doc or .rtf.');
    try {
      const buf = await file.arrayBuffer();
      let raw;
      try { raw = new TextDecoder('windows-1252').decode(buf); } catch { raw = new TextDecoder().decode(buf); }
      if(!raw.trimStart().startsWith('{\\rtf')) throw new Error('This .doc file is not an RTF-based ExamSoft export. In ExamSoft, export/print the exam to Word and try that file.');
      const text = rtfToText(raw);
      const exam = parseExam(text, file.name);
      if(exam.questions.length === 0) throw new Error('ExamBridge could not find any questions. Confirm this is an ExamSoft exam export containing “Question #:” sections.');
      state.exam = evaluateExam(exam);
      state.exceptions = {};
      render();
      restoreSession();
      $('#uploadView').classList.add('eb-hidden');
      $('#resultsView').classList.remove('eb-hidden');
      updateSteps('review');
      window.scrollTo({top:0,behavior:'smooth'});
      toast(`${state.exam.questions.length} questions parsed`);
    } catch(err){ showUploadError(err.message || 'ExamBridge could not read this file.'); }
  }

  function sessionKey(){
    if(!state.exam) return '';
    const m=state.exam.metadata||{};
    const id=m.examUid || [m.detectedCourseCode,m.examId,state.exam.fileName].filter(Boolean).join('|');
    return `exambridge:v1.7.1:${id}`;
  }
  function saveSession(){
    const key=sessionKey(); if(!key) return;
    const notes=$('#reportNotes')?.value || '';
    try { localStorage.setItem(key, JSON.stringify({exceptions:state.exceptions,notes,updatedAt:new Date().toISOString()})); } catch {}
  }
  function restoreSession(){
    const key=sessionKey(); if(!key) return;
    try {
      const saved=JSON.parse(localStorage.getItem(key)||'null');
      if(!saved) return;
      state.exceptions=saved.exceptions||{};
      if($('#reportNotes')) $('#reportNotes').value=saved.notes||'';
      render();
    } catch {}
  }
  async function requestReset(){
    if(state.exam){
      saveSession();
      const hasWork=Object.keys(state.exceptions).length>0 || !!($('#reportNotes')?.value||'').trim();
      const msg=hasWork
        ? 'Your exceptions and report notes are saved for this exam.'
        : 'The results for the current exam will be cleared from the screen.';
      if(!await FTDialog.confirm(msg,{title:'Choose another exam?',confirmLabel:'Choose another exam'})) return;
    }
    resetApp();
  }
  function resetApp(){
    state.exam=null; state.filter='all'; state.facultyFilter='all'; state.exceptions={}; fileInput.value='';
    if($('#reportNotes')) $('#reportNotes').value='';
    $('#resultsView').classList.add('eb-hidden'); $('#uploadView').classList.remove('eb-hidden');
    updateSteps('upload'); window.scrollTo({top:0,behavior:'smooth'});
  }
  function showUploadError(msg){ const e=$('#uploadError'); e.textContent=msg; e.classList.remove('eb-hidden'); }
  function hideUploadError(){ $('#uploadError').classList.add('eb-hidden'); }
  function updateSteps(step){
    const order=['upload','review','report'];
    const idx=order.indexOf(step);
    $$('.ft-step[data-step]').forEach((b,i)=>{
      const active=i===idx;
      b.classList.toggle('is-active',active);
      b.classList.toggle('is-done',i<idx);
      if(active) b.setAttribute('aria-current','step');
      else b.removeAttribute('aria-current');
    });
  }

  // Minimal RTF reader for ExamSoft exports. It keeps textual content, Unicode, tabs,
  // table cells, and paragraph breaks while discarding fonts, styles, and embedded image data.
  function rtfToText(rtf){
    let out='', i=0, ucSkip=1, pendingSkip=0;
    const stack=[];
    let skip=false, ignorable=false;
    const destinations = new Set(['fonttbl','colortbl','stylesheet','info','listtable','listoverridetable','pict','shppict','nonshppict','object','objdata','themedata','colorschememapping','datastore','xmlnstbl','generator']);
    const cp1252 = b => {
      const map={0x80:'€',0x82:'‚',0x83:'ƒ',0x84:'„',0x85:'…',0x86:'†',0x87:'‡',0x88:'ˆ',0x89:'‰',0x8a:'Š',0x8b:'‹',0x8c:'Œ',0x8e:'Ž',0x91:'‘',0x92:'’',0x93:'“',0x94:'”',0x95:'•',0x96:'–',0x97:'—',0x98:'˜',0x99:'™',0x9a:'š',0x9b:'›',0x9c:'œ',0x9e:'ž',0x9f:'Ÿ'};
      return map[b] || String.fromCharCode(b);
    };
    while(i<rtf.length){
      const ch=rtf[i];
      if(ch==='{'){ stack.push({skip,ignorable,ucSkip}); i++; continue; }
      if(ch==='}'){ const s=stack.pop(); if(s){skip=s.skip;ignorable=s.ignorable;ucSkip=s.ucSkip;} i++; continue; }
      if(ch!=='\\'){
        if(pendingSkip>0){ pendingSkip--; i++; continue; }
        if(!skip && ch!=='\r' && ch!=='\n') out+=ch;
        i++; continue;
      }
      i++;
      if(i>=rtf.length) break;
      const sym=rtf[i];
      if(sym==='\\'||sym==='{'||sym==='}'){ if(!skip) out+=sym; i++; continue; }
      if(sym==="'"){
        const hex=rtf.slice(i+1,i+3); if(/^[0-9a-fA-F]{2}$/.test(hex) && !skip) out+=cp1252(parseInt(hex,16)); i+=3; continue;
      }
      if(sym==='*'){ ignorable=true; i++; continue; }
      if(sym==='~'){ if(!skip) out+=' '; i++; continue; }
      if(sym==='-'){ if(!skip) out+='\u00ad'; i++; continue; }
      if(sym==='_'){ if(!skip) out+='‑'; i++; continue; }
      const m=rtf.slice(i).match(/^([a-zA-Z]+)(-?\d+)? ?/);
      if(!m){ i++; continue; }
      const word=m[1], num=m[2]!==undefined?parseInt(m[2],10):null;
      i += m[0].length;
      // Binary payloads must always be consumed even inside an ignorable group;
      // otherwise their raw bytes can leak into the parsed exam text.
      if(word==='bin' && num!==null){ i += Math.max(0,num); continue; }
      // RTF groups introduced with \* are ignorable destinations by definition.
      // Skip them by default instead of maintaining a fragile deny-list.
      if(ignorable){ skip=true; continue; }
      if(destinations.has(word) && ['fonttbl','colortbl','stylesheet','info','listtable','listoverridetable','pict','shppict','object'].includes(word)){ skip=true; continue; }
      if(word==='uc' && num!==null){ ucSkip=num; continue; }
      if(word==='u' && num!==null){
        if(!skip){ let code=num<0?num+65536:num; out+=String.fromCharCode(code); }
        pendingSkip=ucSkip; continue;
      }
      if(skip) continue;
      if(word==='par'||word==='line') out+='\n';
      else if(word==='tab'||word==='cell') out+='\t';
      else if(word==='row') out+='\n';
      else if(word==='emdash') out+='—';
      else if(word==='endash') out+='–';
      else if(word==='bullet') out+='•';
      else if(word==='lquote') out+='‘';
      else if(word==='rquote') out+='’';
      else if(word==='ldblquote') out+='“';
      else if(word==='rdblquote') out+='”';
    }
    return out.replace(/\r/g,'').replace(/[ \t]+\n/g,'\n').replace(/\n{4,}/g,'\n\n\n');
  }

  function parseExam(text, fileName){
    const qStart = text.search(/^\s*Question\s*#:\s*\d+/im);
    const header = qStart>=0 ? text.slice(0,qStart) : text;
    const metadata = {
      title: normalizeSpace((header.match(/^\s*([^\n]+?Confidential)\s*$/mi)||[])[1]||fileName),
      examId: val(header,/Exam ID:\s*([^\n\t]+)/i),
      courseName: val(header,/Course Name:\s*([^\n\t]+)/i),
      questionCount: +(val(header,/# of Questions:\s*(\d+)/i)||0),
      examCreator: val(header,/Exam Creator:\s*([^\n\t]+)/i),
      examFolder: val(header,/Exam Folder:\s*([^\n]+)/i),
      totalPoints: +(val(header,/Total Exam Points:\s*([\d.]+)/i)||0),
      examUid: val(header,/Exam UID:\s*([^\n\t]+)/i),
      creationDate: val(header,/Date and Time of Exam Creation:\s*([^\n]+)/i),
      itemDescription: val(header,/Item Description:\s*([^\n]+)/i)
    };
    metadata.examTakers = parseExamTakers(header);
    metadata.appearsAdministered = metadata.examTakers > 0;
    metadata.categoryRoster = parseCategoryRoster(header);
    metadata.detectedCourseCode = detectCourseCode(metadata.examFolder) || detectCourseCode(header);
    metadata.detectedCourseName = detectCourseName(metadata.examFolder, metadata.detectedCourseCode);

    const matches=[...text.matchAll(/^\s*Question\s*#:\s*(\d+)/gim)];
    const questions=[];
    for(let x=0;x<matches.length;x++){
      const start=matches[x].index, end=x+1<matches.length?matches[x+1].index:text.length;
      const chunk=text.slice(start,end);
      questions.push(parseQuestion(chunk, +matches[x][1], metadata));
    }
    return { fileName, metadata, questions, rawText:text };
  }

  function val(s,re){ const m=s.match(re); return m?normalizeSpace(m[1]):''; }
  function detectCourseCode(s=''){ const m=String(s||'').match(/\b(PHA)\s*[- ]?\s*(\d{3,4})\b/i); return m ? `${m[1].toUpperCase()}${m[2]}` : ''; }
  function detectCourseName(folder='',code=''){
    if(!folder) return '';
    const parts=folder.split(/\\|\//).map(normalizeSpace);
    const p=parts.find(x => code && x.replace(/\s/g,'').toUpperCase().startsWith(code));
    return p || '';
  }

  function parseExamTakers(header=''){
    const block=(String(header).match(/Grading Scale:\s*([\s\S]*?)(?=Question\s*#:\s*\d+|$)/i)||[])[1]||'';
    const explicit=block.match(/#\s*of\s*Exam\s*Takers\s*:?\s*(\d+)/i);
    if(explicit) return +explicit[1];
    // In the table form, sum the taker-count column only when a grading-scale block exists.
    if(!block) return 0;
    const counts=[];
    for(const line of block.split('\n')){
      const nums=[...line.matchAll(/(?:^|\t|\s{2,})(\d+)\s*$/g)];
      if(nums.length) counts.push(+nums.at(-1)[1]);
    }
    return counts.reduce((a,b)=>a+b,0);
  }

  function parseCategoryRoster(header=''){
    const m=String(header).match(/Categories Used in Exam:?\s*([\s\S]*?)(?=Grading Scale:|Question\s*#:\s*\d+|$)/i);
    if(!m) return [];
    const rows=[];
    for(const line of m[1].split('\n').map(x=>x.trim()).filter(Boolean)){
      const parts=line.split('\t').map(normalizeSpace).filter(Boolean);
      if(parts.length<3) continue;
      const ids=[...parts.slice(2).join(',').matchAll(/\b\d{4,}\b/g)].map(x=>x[0]);
      if(ids.length<1) continue;
      rows.push({name:parts[0],raw:line,itemIds:ids});
    }
    return rows;
  }

  function parseQuestion(chunk, number, meta){
    const afterNum = chunk.replace(/^\s*Question\s*#:\s*\d+\s*/i,'');
    const itemPos = afterNum.search(/\n\s*Item ID:/i);
    const content = itemPos>=0 ? afterNum.slice(0,itemPos) : afterNum;
    const metadataText = itemPos>=0 ? afterNum.slice(itemPos) : '';

    // Attachment data is metadata, not student-visible stem text. Always separate
    // the Attachment block before parsing the prompt/response structure so image
    // filenames cannot leak into q.stem.
    const attachmentMatch=content.match(/\n\s*Attachment:\s*\n?\s*([^\n]+)/i);
    let attachment=attachmentMatch ? normalizeSpace(attachmentMatch[1]) : '';
    const rationaleMatch=content.match(/(?:^|\n)\s*Rationale:\s*([\s\S]*?)(?=\n\s*Attachment:|$)/i);
    const rationale=rationaleMatch ? normalizeSpace(rationaleMatch[1]) : '';
    const visibleContent=content.split(/\n\s*Attachment:/i)[0];

    const studentContent=visibleContent.split(/\n\s*Rationale:/i)[0];
    const rawLines=studentContent.split('\n');
    const lines=rawLines.map(l=>l.trim()).filter(Boolean);
    const answerPattern=/^(✓|ü)?\s*([A-H])\.\s*(.+)$/i;
    const answerLines=[];
    lines.forEach((line,idx)=>{ const m=line.match(answerPattern); if(m) answerLines.push({idx,correct:!!m[1],label:m[2].toUpperCase(),text:normalizeSpace(m[3])}); });

    // ExamSoft FITB exports use several response layouts. High-confidence signals
    // include "Please type", pipe-delimited keyed responses, or a simple numbered
    // response placeholder followed by a numbered key (as in PHA3129 Q24).
    const explicitMatching=/\b(?:please\s+match|match\s+the\s+term|match\s+the\s+following)\b/i.test(studentContent);
    const hasFitbInstruction=/\bplease\s+type\b/i.test(studentContent);
    const hasPipeKey=/(?:^|\n)\s*\d+\.\s*[^\n|]+\|[^\n]*\|/mi.test(studentContent);
    const hasSimpleNumberedFitb=/(?:^|\n)\s*\d+\s*(?:\n|$)[\s\S]*?(?:^|\n)\s*\d+\.\s*\S+/mi.test(studentContent) && answerLines.length===0;
    const hasInlineNumberedFitb=answerLines.length===0 &&
      /[^\n]\s{3,}\d+\s{3,}[^\n]/m.test(studentContent) &&
      /(?:^|\n)\s*\d+\.\s*\S+/m.test(studentContent);
    const fitb=!explicitMatching && (hasFitbInstruction || hasPipeKey || hasSimpleNumberedFitb || hasInlineNumberedFitb);

    let stem='';
    let options=[];
    let responseText='';

    if(fitb){
      // Locate the first ExamSoft response-structure row. Keep the complete
      // faculty-written prompt (including "Please type..." instructions) but
      // exclude response placeholders, answer banks, and keyed answers.
      const nonempty=rawLines.map((text,idx)=>({text,idx,trim:text.trim()})).filter(x=>x.trim);
      let responseStart=-1;
      for(let k=1;k<nonempty.length;k++){
        const t=nonempty[k].trim;
        const structured =
          /^\s*\d+\s+\d+(?:\s+|$)/.test(t) ||                    // 1  1  A. Pyridine
          /^\s*[A-Z]\.?\s+\d+(?:\s+|$)/i.test(t) ||             // A  1 / A. 1
          /^\s*[A-Z]\s+\d+\s+\d+\./i.test(t) ||                 // A 1 1. Ester
          /^\s*\d+\s*$/.test(t);                                // simple blank placeholder
        if(structured){ responseStart=nonempty[k].idx; break; }
      }
      if(responseStart<0){
        // Pipe-key FITB items may present only keyed rows after the prompt.
        const k=nonempty.findIndex((x,idx)=>idx>0 && /^\s*\d+\.\s*[^\n|]+\|/.test(x.trim));
        if(k>=0) responseStart=nonempty[k].idx;
      }
      if(responseStart<0 && hasInlineNumberedFitb){
        const k=nonempty.findIndex((x,idx)=>idx>0 && /^\s*\d+\.\s*\S+/.test(x.trim));
        if(k>=0) responseStart=nonempty[k].idx;
      }
      const stemLines=(responseStart>=0?rawLines.slice(0,responseStart):rawLines)
        .map(l=>l.replace(/\s{3,}\d+\s{3,}/g,' ____ ').replace(/\s{3,}\d+\s*/g,' ').trim()).filter(Boolean);
      stem=normalizeSpace(stemLines.join(' '));
      responseText=responseStart>=0 ? normalizeSpace(rawLines.slice(responseStart).join(' ')) : '';
      options=[]; // FITB response banks are not conventional A–H answer choices.
    } else {
      const firstAns=answerLines.length?answerLines[0].idx:-1;
      let stemLines=firstAns>=0?lines.slice(0,firstAns):lines.slice();
      stemLines=stemLines.filter(l=>!/^Rationale:/i.test(l));
      stem=normalizeSpace(stemLines.join(' '));
      options=answerLines.map(a=>({label:a.label,text:a.text,correct:a.correct}));
    }

    // Some older hot-spot exports use a bare trailing filename without an
    // Attachment label. Preserve the prior fallback while keeping it out of stem.
    if(!attachment && !fitb && options.length===0){
      const bare=stem.match(/(?:^|\s)([^\s]+\.(?:png|jpe?g|gif|bmp|tiff?))\s*$/i);
      if(bare){ attachment=bare[1]; stem=normalizeSpace(stem.slice(0,bare.index)); }
    }

    const itemId=val(metadataText,/Item ID:\s*(\d+)/i);
    const itemVersion=val(metadataText,/Item ID:\s*\d+\s*\/\s*(\d+)/i);
    const weight=+(val(metadataText,/Item Weight:\s*([\d.]+)/i)||1);
    const creator=val(metadataText,/Item Creator:\s*([^\n\t]+)/i);
    const categories=parseCategories(metadataText);
    const correctCount=options.filter(o=>o.correct).length;
    const stemLower=stem.toLowerCase();
    let type=fitb?ITEM_TYPES.FITB:ITEM_TYPES.MCQ;
    if(!fitb){
      if(correctCount>1 || /select\s+all\s+that\s+apply|select\s+the\s+(two|three|four)|select\s+(two|three|four)\b/.test(stemLower)) type=ITEM_TYPES.MULTIPLE;
      if(/match\s+the\s+term\b|please\s+match\b|match\s+the\s+following\b/i.test(stem)) type=ITEM_TYPES.MATCHING;
      else if(options.length===0 && type!==ITEM_TYPES.MULTIPLE){
        if(/select\s*\(put your pointer on\)|hot\s*spot/i.test(stem)) type=ITEM_TYPES.HOTSPOT;
        else type=ITEM_TYPES.OTHER;
      }
    }
    const kType=!fitb && isKType(stem,options);
    if(kType) type=ITEM_TYPES.KTYPE;
    const visibleWeight=weightShownInStem(stem,weight);
    const figureReference=referencesFigure(stem);
    const tags=classifyTags(categories,meta.detectedCourseCode);
    return {number,itemId,itemVersion,weight,creator,attachment,rationale,stem,options,responseText,categories,correctCount,type,kType,visibleWeight,figureReference,tags,findings:[],status:'pass'};
  }

  function parseCategories(text){
    const m=text.match(/Item Categories:\s*([\s\S]*?)(?=\n\s*Item Creator:|$)/i);
    if(!m) return [];
    let lines=m[1].split('\n').map(l=>l.trim()).filter(Boolean);
    lines=lines.filter(l=>!/^Category (Name|Path)$/i.test(l));
    const cats=[];
    for(let i=0;i<lines.length;){
      if(lines[i].includes('\t')){
        const parts=lines[i].split('\t').map(normalizeSpace).filter(Boolean);
        if(parts.length>=2) cats.push({name:parts[0],path:parts.slice(1).join('\\')});
        i++;
      } else {
        const name=normalizeSpace(lines[i]||''), path=normalizeSpace(lines[i+1]||'');
        if(name && path) cats.push({name,path});
        i+=2;
      }
    }
    return cats;
  }

  function classifyTags(cats, examCourse){
    const faculty=cats.filter(c=>/(^|\\)2\. Faculty(\\|$)/i.test(c.path) && !/\\AI(?:\\|$)/i.test(c.path));
    const ai=cats.filter(c=>/(^|\\)2\. Faculty(\\|$)/i.test(c.path) && /(?:^|\\)AI(?:\\|$)/i.test(c.path));
    const pslo=cats.filter(c=>/PSLO/i.test(c.path));
    const bloom=cats.filter(c=>/Blooms Taxonomy Abbreviated/i.test(c.path));

    // Course and outcome are independent dimensions in the local ExamSoft taxonomy:
    // a CLO category can have the course as an intermediate path segment. Preserve the
    // CLO while also deriving a synthetic course tag from the matching path segment.
    const course=[];
    const seenCourse=new Set();
    cats.forEach(c=>{
      const segments=String(c.path||'').split(/\\|\//).map(normalizeSpace).filter(Boolean);
      const candidates=[...segments, c.name].filter(Boolean);
      for(const seg of candidates){
        const code=detectCourseCode(seg);
        if(code){
          const key=code+'|'+seg;
          if(!seenCourse.has(key)){ course.push({name:seg,path:c.path,derived:true}); seenCourse.add(key); }
          break;
        }
      }
    });
    const clo=cats.filter(c=>/^(?:CLO|CO)\s*\d+/i.test(c.name) || /\\(?:CLO|CO)\s*\d+/i.test(c.path));
    const legacy=cats.filter(c=>/OLD Curriculum/i.test(c.path));
    const wrongCourse=clo.filter(c=>{
      const codes=[...String(c.path||'').matchAll(/\bPHA\s*[- ]?\s*(\d{3,4})\b/gi)].map(m=>`PHA${m[1]}`);
      return examCourse && codes.some(code=>code!==examCourse);
    });
    return {faculty,ai,pslo,clo,bloom,course,legacy,wrongCourse};
  }

  function isKType(stem,options){
    if(options.length<3) return false;

    // K-type items use a series of Roman-numeral statements in the stem
    // followed by answer choices that combine those statements (e.g.,
    // "I and II only" or "I, II and III only"). parseQuestion() normalizes
    // stem whitespace, so detect the Roman labels in the flattened stem rather
    // than depending on their original line breaks.
    const normalizedStem=normalizeSpace(String(stem||''));
    const romanStatementMatches=[...normalizedStem.matchAll(/(?:^|\s)(IV|III|II|I|V)[\.)]\s+/g)];
    const distinctStatements=new Set(romanStatementMatches.map(m=>m[1].toUpperCase()));

    // Require at least two distinct statement labels and, to further reduce false
    // positives, expect the usual sequence to begin with I and include II.
    if(distinctStatements.size<3 || !distinctStatements.has('I') || !distinctStatements.has('II') || !distinctStatements.has('III')) return false;

    const romanToken=/\b(?:IV|III|II|I|V)\b/gi;
    const comboChoices=options.filter(o=>{
      const text=normalizeSpace(o.text||'');
      const tokens=[...text.matchAll(romanToken)].map(m=>m[0].toUpperCase());
      // Combination responses can contain two or more Roman numerals, or a single
      // Roman numeral followed by "only" (e.g., "IV only").
      return tokens.length>=2 || (tokens.length===1 && /\bonly\b/i.test(text));
    }).length;
    return comboChoices>=2;
  }
  function weightShownInStem(stem,weight){
    const w=String(weight).replace(/\.0$/,'');
    const num=`${w}(?:\\.0)?`;
    // Favor explicit weight notation rather than any incidental occurrence of the
    // same number near the word “points”.
    const re=new RegExp(`(?:\\(\\s*(?:weight\\s*:\\s*)?${num}\\s*(?:points?|pts?)\\s*\\)|\\[\\s*(?:weight\\s*:\\s*)?${num}\\s*(?:points?|pts?)\\s*\\]|\\bweight\\s*:\\s*${num}\\s*(?:points?|pts?)\\b|\\bworth\\s+${num}\\s*(?:points?|pts?)\\b)`,'i');
    return re.test(stem);
  }

  function referencesFigure(stem=''){
    return /\b(?:see|refer to|use|using|shown in|depicted in)\s+(?:the\s+)?(?:attached\s+)?(?:figure|image|diagram|attachment)\b|\bsee\s+attachment\b|\b(?:figure|image|diagram)\s+(?:below|above|shown|provided|attached)\b|\b(?:structures?|drugs?|compounds?|molecules?)\s+(?:shown|depicted)\b/i.test(stem);
  }


  const WRITING_BASE_WORDS = new Set(`
a an the and or but if then than this that these those is are was were be been being have has had do does did
which what who whom whose where when why how of in on at by for from with without to into over under between
patient patients medication medications drug drugs insulin glucose blood serum plasma renal kidney liver heart
increase increases increased decreasing decrease decreases reduced reduce reducing improves improve treatment therapy
correct incorrect true false following most least appropriate primary secondary mechanism action effect effects
type diabetes mellitus history current include includes including daily weekly twice once before after during
year years old male female presents presented reports report laboratory result normal range recommend recommended
question answer answers select all two three four only
`.trim().split(/\s+/));
  const WRITING_TERMS = new Set(`
metformin glargine chylomicrons heterocycle vldl empagliflozin lispro glimepiride pioglitazone epidermidis glipizide
isoelectric clindamycin terbinafine peptidoglycan enantiomers diastereomers lisinopril phospholipase
ldl hdl idl bmi egfr mbc wnl pka cyp dpp glp sglt atp adme moa sar ascvd hba1c fbg tdd
lantus afrezza apidra novolin humalog levemir tresiba toujeo jardiance mounjaro januvia glucophage amaryl invokana
trulicity qsymia contrave xenical saxenda tradjenta onglyza nesina bydureon farxiga
semaglutide tirzepatide dulaglutide liraglutide canagliflozin dapagliflozin sitagliptin saxagliptin alogliptin
rosiglitazone repaglinide acarbose exenatide pramlintide topiramate phentermine naltrexone bupropion orlistat
glipizide glyburide telmisartan rosuvastatin celexa hydrocodone lisinopril
`.trim().split(/\s+/));
  const DRUG_SUFFIX = /(?:afil|tinib|prazole|statin|glitazone|gliptin|gliflozin|sartan|mab|parin)$/i;
  function writingWords(s=''){
    return [...String(s).matchAll(/\b[A-Za-z][A-Za-z’'-]*\b/g)].map(m=>({raw:m[0],word:m[0].toLowerCase().replace(/[’']/g,"'")}));
  }
  function recognizedWritingWord(w){
    const clean=w.toLowerCase().replace(/^-|-$/g,'');
    if(clean.length<=2 || WRITING_BASE_WORDS.has(clean) || WRITING_TERMS.has(clean) || DRUG_SUFFIX.test(clean)) return true;
    if(/^[a-z]+-[a-z]+$/i.test(clean)) return clean.split('-').every(recognizedWritingWord);
    if(/^[A-Z]{2,}$/i.test(w) || /\d/.test(w)) return true;
    return false;
  }
  function likelySpellingIssues(text=''){
    const typoMap={phospholiase:'phospholipase',symtpoms:'symptoms',tirzapatide:'tirzepatide',medulary:'medullary',hypoglycmeia:'hypoglycemia',hyperglyemia:'hyperglycemia',slimepiride:'glimepiride'};
    const out=[];
    writingWords(text).forEach(({raw,word})=>{
      if(typoMap[word]) out.push({term:raw,suggestion:typoMap[word]});
    });
    return out;
  }
  function writingReview(q){
    const raw=[];
    const locations=[{name:'stem',text:q.stem||''},...q.options.map(o=>({name:`option ${o.label}`,text:o.text||''}))];

    locations.forEach(loc=>{
      likelySpellingIssues(loc.text).forEach(x=>raw.push({
        key:`spelling|${x.term.toLowerCase()}|${x.suggestion.toLowerCase()}`,
        kind:'writing-spelling', issue:`“${x.term}” is not a recognized term. Did you mean “${x.suggestion}”?`, location:loc.name
      }));
      const doubled=loc.text.match(/\b([A-Za-z]{2,})\s+\1\b/i);
      if(doubled) raw.push({
        key:`double|${doubled[1].toLowerCase()}`,
        kind:'writing-mechanics', issue:`repeated word “${doubled[0]}” detected.`, location:loc.name
      });
      const pairs=[['(',')'],['[',']'],['{','}']];
      pairs.forEach(([a,b])=>{
        if((loc.text.split(a).length-1)!==(loc.text.split(b).length-1)) raw.push({
          key:`unbalanced|${a}${b}`,
          kind:'writing-mechanics', issue:`unbalanced ${a}${b} punctuation detected.`, location:loc.name
        });
      });
    });

    const s=q.stem||'';
    // Article-option cueing: only when the blank/article is the task immediately before the choices.
    const art=(s.match(/\b(an?)\s+_{2,}\s*(?:[?.]|$)/i)||[])[1];
    if(art && q.options.length>=3){
      const vowel=q.options.filter(o=>/^[aeiou]/i.test((o.text||'').trim())).length;
      if((art.toLowerCase()==='an' && vowel>0 && vowel<q.options.length) || (art.toLowerCase()==='a' && vowel>0 && vowel<q.options.length))
        raw.push({
          key:`article|${art.toLowerCase()}`,
          kind:'writing-cue',
          issue:`“${art} ___” can grammatically cue answer choices. Rewrite the stem so article agreement cannot eliminate options.`,
          location:'stem/options'
        });
    }

    const grouped=new Map();
    raw.forEach(f=>{
      if(!grouped.has(f.key)) grouped.set(f.key,{kind:f.kind,issue:f.issue,locations:[]});
      const g=grouped.get(f.key);
      if(!g.locations.includes(f.location)) g.locations.push(f.location);
    });
    return [...grouped.values()].map(g=>({
      kind:g.kind,
      location:g.locations.join(', '),
      text:`${g.locations.join(', ')}: ${g.issue}`
    }));
  }


  const STEM_KEY_STOPWORDS=new Set(`
a an and are as at be been being by can could did do does for from had has have how in into is it its may might
most of on or should that the their them then there these they this those to was were what when where which who
with would you your following answer answers choice choices correct best appropriate select
`.trim().split(/\s+/));

  function stemKeyOverlapCheck(q){
    if(q.type!==ITEM_TYPES.MCQ || q.correctCount!==1 || q.options.length<3) return null;
    const key=q.options.find(o=>o.correct);
    if(!key) return null;
    const tokens=s=>[...String(s||'').toLowerCase().matchAll(/\b[a-z][a-z'-]*\b/g)]
      .map(m=>m[0].replace(/^[-']+|[-']+$/g,''))
      .filter(w=>w.length>=5 && !STEM_KEY_STOPWORDS.has(w));
    const stemSet=new Set(tokens(q.stem));
    const distractorSets=q.options.filter(o=>!o.correct).map(o=>new Set(tokens(o.text)));
    const overlap=[...new Set(tokens(key.text))].filter(w=>
      stemSet.has(w) && !distractorSets.some(set=>set.has(w))
    );
    if(!overlap.length) return null;
    return `The stem repeats distinctive word${overlap.length===1?'':'s'} found only in the keyed answer (${overlap.join(', ')}). This may cue the correct response; consider moving shared wording into the stem or revising the choices.`;
  }

  function wordingReview(q){
    const locations=[{name:'stem',text:q.stem||''},...q.options.map(o=>({name:`option ${o.label}`,text:o.text||''}))];
    const findings=[];
    const collect=(re,category)=>{
      const hits=[];
      locations.forEach(loc=>{
        let text=loc.text;
        if(category==='absolute'){
          text=text
            .replace(/\bselect\s+all\s+that\s+apply\b/ig,'')
            .replace(/\ball\s+of\s+the\s+above\b/ig,'');
          if(q.kType && /^option\s+/i.test(loc.name)) text=text.replace(/\bonly\b/ig,'');
        }
        const terms=[...text.matchAll(re)].map(m=>m[0]);
        if(terms.length) hits.push({location:loc.name,terms:[...new Set(terms.map(t=>t.toLowerCase()))]});
      });
      return hits;
    };
    const absolute=collect(/\b(?:always|never|only|all)\b/gi,'absolute');
    const vague=collect(/\b(?:frequently|occasionally|usually|commonly)\b/gi,'vague');
    const negative=collect(/\b(?:not|except|incorrect)\b/gi,'negative');
    const allAbove=collect(/\ball\s+of\s+the\s+above\b/gi,'meta');
    const noneAbove=collect(/\bnone\s+of\s+the\s+above\b/gi,'meta');
    const describe=hits=>hits.map(h=>`${h.location}: ${h.terms.join(', ')}`).join(' · ');
    if(absolute.length) findings.push({kind:'wording',text:`Absolute term(s) detected — ${describe(absolute)}. Faculty guidelines recommend reviewing absolute wording such as “always,” “never,” “only,” and “all.”`});
    if(vague.length) findings.push({kind:'wording',text:`Vague term(s) detected — ${describe(vague)}. Consider replacing terms such as “frequently,” “occasionally,” “usually,” or “commonly” with more precise wording when possible.`});
    if(negative.length) findings.push({kind:'wording',text:`Negative term(s) detected — ${describe(negative)}. Faculty guidelines call for positively worded stems; rewrite negative tasks such as NOT, EXCEPT, or INCORRECT when possible.`});
    if(allAbove.length) findings.push({kind:'wording',text:`“All of the Above” detected — ${describe(allAbove)}. Faculty question-writing guidelines recommend avoiding this response format.`});
    if(noneAbove.length) findings.push({kind:'wording',text:`“None of the Above” detected — ${describe(noneAbove)}. Faculty question-writing guidelines recommend avoiding this response format.`});
    return findings;
  }

  function answerChoiceLengthCheck(q){
    // Advisory cueing check: only conventional, single-key MCQs are eligible.
    // The concern is not cosmetic uniformity; it is a keyed answer that is
    // conspicuously longer and more qualified than its distractors.
    if(q.kType || q.type!==ITEM_TYPES.MCQ || q.correctCount!==1 || !q.options || q.options.length<3) return null;
    const metaOption=/\b(?:all|none|both)\s+of\s+the\s+above\b/i;
    const rows=q.options.map(o=>{
      const text=normalizeSpace(o.text||'');
      const words=(text.match(/\b[\w’'-]+\b/g)||[]).length;
      return {label:o.label,text,words,correct:o.correct,meta:metaOption.test(text)};
    });
    const eligible=rows.filter(r=>!r.meta && r.words>0);
    if(eligible.length<3) return null;
    const key=eligible.find(r=>r.correct);
    if(!key) return null; // keyed answer was a meta-option; do not evaluate.
    const sorted=eligible.map(r=>r.words).sort((a,b)=>a-b);
    const mid=Math.floor(sorted.length/2);
    const median=sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
    if(median<4) return null; // short noun/drug lists produce meaningless ratios.
    const max=Math.max(...eligible.map(r=>r.words));
    const uniqueLongest=eligible.filter(r=>r.words===max).length===1 && key.words===max;
    if(!uniqueLongest || key.words<median*2) return null;
    const counts=rows.map(r=>`${r.label}: ${r.words} word${r.words===1?'':'s'}`).join(' · ');
    return {
      counts,
      median,
      text:`Choice ${key.label} is the correct answer and is more than twice as long as the typical answer choice (${key.words} words vs. a ${median}-word median). Students may use answer length as a cue. Consider expanding the distractors or tightening the keyed response. ${counts}`
    };
  }

  function answerChoiceLengthEligible(q){
    if(q.kType || q.type!==ITEM_TYPES.MCQ || q.correctCount!==1 || !q.options || q.options.length<3) return false;
    const metaOption=/\b(?:all|none|both)\s+of\s+the\s+above\b/i;
    const rows=q.options.map(o=>({
      words:(normalizeSpace(o.text||'').match(/\b[\w’'-]+\b/g)||[]).length,
      correct:o.correct,
      meta:metaOption.test(normalizeSpace(o.text||''))
    }));
    const eligible=rows.filter(r=>!r.meta && r.words>0);
    // This is the evaluation denominator, not the finding threshold. Short
    // answer lists are examined and may be deliberately skipped by the rule.
    return eligible.length>=3 && eligible.some(r=>r.correct);
  }

  function evaluateExam(exam){
    const qs=exam.questions, n=qs.length;
    const weights=qs.map(q=>q.weight);
    const weightCounts=new Map();
    weights.forEach(w=>weightCounts.set(w,(weightCounts.get(w)||0)+1));
    const predominantWeight=[...weightCounts.entries()].sort((a,b)=>b[1]-a[1] || a[0]-b[0])[0]?.[0] ?? 1;
    const differentWeightQs=qs.filter(q=>q.weight!==predominantWeight);
    const differentWeightPct=n?differentWeightQs.length/n:0;
    const variableWeights=weightCounts.size>1;
    const multiple=qs.filter(q=>q.type===ITEM_TYPES.MULTIPLE);
    const choiceBased=qs.filter(q=>q.options.length>0 && [ITEM_TYPES.MCQ,ITEM_TYPES.MULTIPLE,ITEM_TYPES.KTYPE].includes(q.type));
    const invalidOptionCount=choiceBased.filter(q=>q.options.length<3 || q.options.length>5);
    const ktypes=qs.filter(q=>q.kType);
    const missingRationale=qs.filter(q=>!normalizeSpace(q.rationale||''));
    const stemKeyEligible=qs.filter(q=>q.type===ITEM_TYPES.MCQ && q.correctCount===1 && q.options.length>=3);
    const weightNeeds=qs.filter(q=>(q.weight>2 || q.weight!==predominantWeight) && !q.visibleWeight);
    const missingAttachment=qs.filter(q=>q.figureReference && !q.attachment);
    const figureIssues=[...missingAttachment];
    const manualQuestions=qs.filter(q=>q.type===ITEM_TYPES.MATCHING || q.type===ITEM_TYPES.FITB || q.options.length===0);
    const unkeyedQuestions=qs.filter(q=>q.options.length>0 && q.correctCount===0 && q.type!==ITEM_TYPES.MATCHING);
    const choiceLengthEligible=qs.filter(answerChoiceLengthEligible);

    qs.forEach(q=>{
      const f=[];
      if(q.options.length>0 && [ITEM_TYPES.MCQ,ITEM_TYPES.MULTIPLE,ITEM_TYPES.KTYPE].includes(q.type) && (q.options.length<3 || q.options.length>5))
        f.push(finding('action','options',`${q.options.length} answer choices detected. Conventional choice-based questions should contain 3–5 answer choices.`));
      if(!normalizeSpace(q.rationale||''))
        f.push(finding('review','rationale','No rationale was detected for this question. Faculty guidelines recommend including a rationale, especially when secure exam review is used.'));
      const overlapCheck=stemKeyOverlapCheck(q);
      if(overlapCheck) f.push(finding('review','stem-key-overlap',overlapCheck));
      wordingReview(q).forEach(w=>f.push(finding('review',w.kind,w.text)));
      if((q.weight>2 || q.weight!==predominantWeight) && !q.visibleWeight){
        const reason=q.weight>2
          ? 'this item is worth more than 2 points'
          : `its weight differs from the predominant ${fmtWeight(predominantWeight)} question weight`;
        f.push(finding('action','weight',`Add ${fmtWeight(q.weight)} to the question stem because ${reason}.`));
      }
      if(q.figureReference && !q.attachment) f.push(finding('action','figure','The stem references a figure, image, diagram, or attachment, but no attachment was detected for this question.'));
      if(q.options.length>0 && q.correctCount===0 && q.type!==ITEM_TYPES.MATCHING) f.push(finding('action','answer-key',`Question ${q.number} has answer options but no correct answer is marked.`));
      if(q.type===ITEM_TYPES.MATCHING || q.type===ITEM_TYPES.FITB || q.options.length===0) f.push(finding('manual','composition',`ExamBridge could not fully evaluate conventional option-dependent composition rules for this ${q.type.toLowerCase()} item; confirm it manually.`));
      const lengthCheck=answerChoiceLengthCheck(q);
      if(lengthCheck) f.push(finding('review','choice-length',lengthCheck.text));
      writingReview(q).forEach(w=>f.push(finding('review',w.kind,w.text)));
      if(q.tags.course.length===0) f.push(finding('action','tag','Course Name tag not detected.'));
      if(q.tags.faculty.length===0) f.push(finding('action','tag','Faculty Name tag missing.'));
      if(q.tags.pslo.length===0) f.push(finding('action','tag','PSLO tag missing.'));
      if(q.tags.clo.length===0) f.push(finding('action','tag','CLO tag missing.'));
      if(q.tags.bloom.length===0) f.push(finding('action','tag',"Abbreviated Bloom's level missing."));
      if(q.tags.pslo.length>2) f.push(finding('review','tag',`${q.tags.pslo.length} PSLOs tagged; 1–2 is typical.`));
      if(q.tags.clo.length>2) f.push(finding('review','tag',`${q.tags.clo.length} CLOs tagged; 1–2 is typical.`));
      if(q.tags.legacy.length) f.push(finding('review','tag','Legacy / pre-2022 curriculum tag detected.'));
      if(q.tags.wrongCourse.length) f.push(finding('review','tag',`CLO tag appears to belong to ${detectCourseCode(q.tags.wrongCourse[0].path)}, not ${exam.metadata.detectedCourseCode}.`));
      q.findings=f;
      q.status=f.some(x=>x.level==='action')?'action':f.some(x=>x.level==='review')?'review':f.some(x=>x.level==='manual')?'manual':'pass';
    });

    const parsedPoints=qs.reduce((sum,q)=>sum+q.weight,0);
    const countMismatch=!!exam.metadata.questionCount && exam.metadata.questionCount!==n;
    const pointsMismatch=!!exam.metadata.totalPoints && Math.abs(exam.metadata.totalPoints-parsedPoints)>0.001;
    const rosterCheck=crossCheckCategoryRoster(exam);
    exam.rosterCheck=rosterCheck;
    const parserWarning=countMismatch||pointsMismatch||rosterCheck.mismatches.length>0;
    const mrStatus=multiple.length/n<=.20?'pass':'action';
    const kStatus=ktypes.length<=2?'pass':'action';
    let weightDetail;
    if(weightNeeds.length){
      weightDetail=`${weightNeeds.length} question(s) have a weight that differs from the predominant ${fmtWeight(predominantWeight)} weight or exceed 2 points and do not show that weight in the stem.`;
    } else if(variableWeights){
      weightDetail=`The predominant question weight is ${fmtWeight(predominantWeight)}. All ${differentWeightQs.length} non-predominant-weight question(s) show their weight in the stem.`;
    } else {
      weightDetail='Question weights meet the guideline.';
    }
    const figureLevel=missingAttachment.length?'action':'pass';
    const figureDetail=missingAttachment.length
      ? `${missingAttachment.length} question(s) appear to reference a figure or image without a detected attachment.`
      : 'No question references a missing figure or attachment.';

    const rules={
      parser:{level:parserWarning?'action':'pass',title:'Parser validation',detail:parserWarning?parserValidationDetail(exam,n,parsedPoints,rosterCheck):`Parsed ${n} questions and ${fmtWeight(parsedPoints).replace(' points','')} total points; header counts agree${rosterCheck.checked?'; category roster cross-check agrees':''}.`,questions:[]},
      multiple:{level:mrStatus,title:'Multiple response',detail:`${multiple.length} of ${n} questions (${pct(multiple.length,n)}). Maximum: 20%.`,questions:multiple},
      options:{level:invalidOptionCount.length?'action':'pass',title:'3–5 answer choices',detail:invalidOptionCount.length?`${invalidOptionCount.length} conventional choice-based question(s) fall outside the 3–5 answer-choice guideline.`:`All ${choiceBased.length} conventional choice-based questions contain 3–5 answer choices.`,questions:invalidOptionCount,evaluated:choiceBased.length,total:n},
      rationale:{level:missingRationale.length?'review':'pass',affectsOverall:false,title:'Rationale included',detail:missingRationale.length?`${missingRationale.length} of ${n} questions do not include a detected rationale.`:`All ${n} questions include a detected rationale.`,questions:missingRationale,evaluated:n,total:n},
      stemKeyOverlap:{level:qs.some(q=>q.findings.some(f=>f.kind==='stem-key-overlap'))?'review':'pass',affectsOverall:false,title:'Stem / correct-answer overlap',detail:qs.some(q=>q.findings.some(f=>f.kind==='stem-key-overlap'))?`${qs.filter(q=>q.findings.some(f=>f.kind==='stem-key-overlap')).length} question(s) repeat distinctive keyed-answer wording in the stem.`:'No distinctive stem-to-key wording overlap was detected among eligible single-key MCQs.',questions:qs.filter(q=>q.findings.some(f=>f.kind==='stem-key-overlap')),evaluated:stemKeyEligible.length,total:n},
      wording:{level:qs.some(q=>q.findings.some(f=>f.kind==='wording'))?'review':'pass',affectsOverall:false,title:'Absolute, vague, negative, and All/None wording',detail:qs.some(q=>q.findings.some(f=>f.kind==='wording'))?`${qs.filter(q=>q.findings.some(f=>f.kind==='wording')).length} question(s) contain wording elements identified in the faculty question-writing guidelines.`:'No targeted absolute, vague, negative, All of the Above, or None of the Above wording was detected.',questions:qs.filter(q=>q.findings.some(f=>f.kind==='wording')),evaluated:n,total:n},
      ktype:{level:kStatus,title:'K-type questions',detail:`${ktypes.length} detected. Maximum without approved exception: 2.`,questions:ktypes},
      weights:{level:weightNeeds.length?'action':'pass',title:'Question weights',detail:weightDetail,questions:weightNeeds},
      figures:{level:figureLevel,title:'Missing figures / attachments',detail:figureDetail,questions:figureIssues},
      answerKey:{level:unkeyedQuestions.length?'action':'pass',title:'Correct-answer keys',detail:unkeyedQuestions.length?`${unkeyedQuestions.length} question(s) have answer options but no marked correct answer.`:'All questions with parsed answer options have at least one marked correct answer.',questions:unkeyedQuestions},
      manual:{level:manualQuestions.length?'manual':'pass',title:'Items requiring manual composition check',detail:manualQuestions.length?`${manualQuestions.length} item(s) use a format for which ExamBridge could not evaluate option-dependent composition rules.`:'All item formats were evaluable for option-dependent composition rules.',questions:manualQuestions},
      writing:{level:qs.some(q=>q.findings.some(f=>f.kind.startsWith('writing-')))?'review':'pass',affectsOverall:false,title:'Writing review',detail:(()=>{const hit=qs.filter(q=>q.findings.some(f=>f.kind.startsWith('writing-')));const partial=qs.filter(q=>q.options.length===0);return `${n-partial.length} of ${n} questions fully evaluated; ${partial.length} evaluated in part (answer choices could not be read); ${hit.length} question(s) to review. Student-visible stems and answer choices only.`;})(),questions:qs.filter(q=>q.findings.some(f=>f.kind.startsWith('writing-'))),evaluated:qs.filter(q=>q.options.length>0).length,total:n},
      choiceLength:{level:qs.some(q=>q.findings.some(f=>f.kind==='choice-length'))?'review':'pass',affectsOverall:false,title:'Correct-answer length cueing',detail:qs.some(q=>q.findings.some(f=>f.kind==='choice-length'))?`${qs.filter(q=>q.findings.some(f=>f.kind==='choice-length')).length} eligible question(s) have a keyed answer that is conspicuously longer than the distractors.`:'No keyed-answer length cue was detected among the conventional single-key MCQs examined.',questions:qs.filter(q=>q.findings.some(f=>f.kind==='choice-length')),evaluated:choiceLengthEligible.length,total:n},
      ai:{level:'pass',title:'AI authorship tag',detail:`${qs.filter(q=>q.tags.ai.length).length} of ${n} questions carry an AI authorship tag. Informational only.`,questions:qs.filter(q=>q.tags.ai.length)},
      course:{level:qs.some(q=>q.tags.course.length===0)?'action':'pass',title:'Course Name',detail:completeness(qs,q=>q.tags.course.length>0),questions:qs.filter(q=>q.tags.course.length===0)},
      faculty:{level:qs.some(q=>q.tags.faculty.length===0)?'action':'pass',title:'Faculty Name',detail:completeness(qs,q=>q.tags.faculty.length>0),questions:qs.filter(q=>q.tags.faculty.length===0)},
      pslo:{level:qs.some(q=>q.tags.pslo.length===0)?'action':'pass',title:'PSLO',detail:tagDetail(qs,'pslo'),questions:qs.filter(q=>q.tags.pslo.length===0)},
      clo:{level:qs.some(q=>q.tags.clo.length===0)?'action':'pass',title:'CLO',detail:tagDetail(qs,'clo'),questions:qs.filter(q=>q.tags.clo.length===0)},
      bloom:{level:qs.some(q=>q.tags.bloom.length===0)?'action':'pass',title:"Abbreviated Bloom's",detail:bloomDetail(qs),questions:qs.filter(q=>q.tags.bloom.length===0)},
      tagQuality:{level:qs.some(q=>q.tags.wrongCourse.length||q.tags.legacy.length||q.tags.pslo.length>2||q.tags.clo.length>2)?'review':'pass',title:'Tag quality',detail:qualityDetail(qs),questions:qs.filter(q=>q.tags.wrongCourse.length||q.tags.legacy.length||q.tags.pslo.length>2||q.tags.clo.length>2)}
    };
    // Every rule reports its evaluation denominator so a rule cannot silently
    // present a confident pass after examining zero eligible questions.
    const parsedOptionQuestions=qs.filter(q=>q.options.length>0).length;
    const evaluatedOverrides={answerKey:parsedOptionQuestions,choiceLength:choiceLengthEligible.length};
    Object.entries(rules).forEach(([key,r])=>{
      if(r.evaluated==null) r.evaluated=evaluatedOverrides[key]??n;
      if(r.total==null) r.total=n;
    });
    exam.variableWeights=variableWeights;
    exam.predominantWeight=predominantWeight;
    exam.differentWeightCount=differentWeightQs.length;
    exam.rules=rules;
    exam.actionQuestions=qs.filter(q=>q.status==='action'); exam.reviewQuestions=qs.filter(q=>q.status==='review'); exam.manualQuestions=qs.filter(q=>q.status==='manual');
    exam.actionRules=Object.values(rules).filter(r=>r.level==='action').length;
    exam.reviewRules=Object.values(rules).filter(r=>r.level==='review'&&r.affectsOverall!==false).length; exam.manualRules=Object.values(rules).filter(r=>r.level==='manual').length;
    exam.multipleCount=multiple.length; exam.kTypeCount=ktypes.length;
    return exam;
  }

  function crossCheckCategoryRoster(exam){
    const roster=exam.metadata.categoryRoster||[];
    if(!roster.length) return {checked:false,mismatches:[]};
    const itemMap=new Map();
    exam.questions.forEach(q=>q.categories.forEach(c=>{
      const key=normalizeSpace(c.name).toLowerCase();
      if(!itemMap.has(key)) itemMap.set(key,new Set());
      if(q.itemId) itemMap.get(key).add(String(q.itemId));
    }));
    const mismatches=[];
    roster.forEach(r=>{
      const parsed=itemMap.get(normalizeSpace(r.name).toLowerCase());
      if(!parsed) return;
      const expected=new Set(r.itemIds.map(String));
      if(expected.size && parsed.size!==expected.size) mismatches.push({name:r.name,expected:expected.size,parsed:parsed.size});
    });
    return {checked:true,mismatches};
  }
  function parserValidationDetail(exam,n,parsedPoints,rosterCheck){
    const bits=[];
    if(exam.metadata.questionCount && exam.metadata.questionCount!==n) bits.push(`Header lists ${exam.metadata.questionCount} questions; ExamBridge parsed ${n}.`);
    if(exam.metadata.totalPoints && Math.abs(exam.metadata.totalPoints-parsedPoints)>0.001) bits.push(`Header lists ${exam.metadata.totalPoints} points; parsed item weights total ${parsedPoints}.`);
    if(rosterCheck.mismatches.length) bits.push(`${rosterCheck.mismatches.length} category-roster cross-check(s) disagree with question-level parsing.`);
    return bits.join(' ');
  }

  function finding(level,kind,text){ return {level,kind,text}; }
  function completeness(qs,fn){ const c=qs.filter(fn).length; return `${c} of ${qs.length} questions tagged (${pct(c,qs.length)}).`; }
  function tagDetail(qs,key){
    const c=qs.filter(q=>q.tags[key].length>0).length, over=qs.filter(q=>q.tags[key].length>2).length;
    return `${c} of ${qs.length} questions tagged (${pct(c,qs.length)}).${over?` ${over} question(s) have more than 2.`:''}`;
  }
  function bloomDetail(qs){
    const tagged=qs.filter(q=>q.tags.bloom.length).length;
    const levels={1:0,2:0,3:0};
    qs.forEach(q=>q.tags.bloom.forEach(c=>{ const m=c.name.match(/^\s*([123])\./); if(m) levels[m[1]]++; }));
    return `${tagged} of ${qs.length} tagged. Level 1: ${levels[1]}, Level 2: ${levels[2]}, Level 3: ${levels[3]}.`;
  }
  function qualityDetail(qs){
    const wrongQs=qs.filter(q=>q.tags.wrongCourse.length), legacyQs=qs.filter(q=>q.tags.legacy.length);
    const overlap=qs.filter(q=>q.tags.wrongCourse.some(w=>q.tags.legacy.some(l=>normalizeSpace(l.name)===normalizeSpace(w.name)&&normalizeSpace(l.path)===normalizeSpace(w.path)))).length;
    const broad=qs.filter(q=>q.tags.pslo.length>2||q.tags.clo.length>2).length;
    if(!wrongQs.length&&!legacyQs.length&&!broad) return 'No obvious wrong-course, legacy, or unusually broad tags detected.';
    const overlapText=overlap?` ${overlap} question(s) contain tags that are both cross-course and legacy; those findings overlap and should not be added together.`:'';
    return `${wrongQs.length} question(s) have cross-course CLO tags; ${legacyQs.length} question(s) have legacy tags; ${broad} have unusually broad tagging.${overlapText}`;
  }
  function fmtWeight(w){ return `${Number(w)%1?Number(w):Number(w).toFixed(0)} ${Number(w)===1?'point':'points'}`; }

  function render(){
    const e=state.exam, m=e.metadata;
    $('#fileName').textContent=e.fileName;
    $('#examMeta').textContent=[m.detectedCourseName||m.detectedCourseCode,m.examId?`Exam ID ${m.examId}`:'',`${e.questions.length} questions`,`${m.totalPoints||e.questions.reduce((s,q)=>s+q.weight,0)} points`].filter(Boolean).join(' · ');
    const adminNotice=$('#administrationNotice'); if(adminNotice){ if(m.appearsAdministered){ adminNotice.innerHTML=`<strong>Administration detected:</strong> This export contains results for ${m.examTakers} exam taker(s). ExamBridge can still perform a retrospective quality review.`; adminNotice.classList.remove('eb-hidden'); } else adminNotice.classList.add('eb-hidden'); }
    const unresolvedRules=Object.values(e.rules).filter(r=>r.level==='action'&&!isExceptedRule(r)).length;
    const title=unresolvedRules?'Action needed':e.reviewRules?'Review recommended':e.manualRules?'Manual check needed':'No unresolved guideline issues';
    $('#overallTitle').textContent=title;
    $('#overallDetail').textContent=unresolvedRules?`${unresolvedRules} guideline area(s) require changes or a documented approved exception. ${e.actionQuestions.length} question(s) contain action-level findings.`:e.reviewRules?`${e.reviewRules} review item(s) remain; no action-level guideline violations are unresolved.`:e.manualRules?`${e.manualQuestions.length} question(s) require a manual composition check because their item format could not be fully evaluated.`:'No action, review, or manual-check findings remain.';
    $('#overallBadge').innerHTML=statusBadge(unresolvedRules?'action':e.reviewRules?'review':e.manualRules?'manual':'pass', unresolvedRules?'Action Needed':e.reviewRules?'Needs Review':e.manualRules?'Manual Check':'Ready');
    renderSummary(); renderRules(); renderQuestions(); renderExceptions();
  }

  function renderSummary(){
    const e=state.exam;
    const cards=[
      ['Questions',e.questions.length,`${e.metadata.totalPoints||e.questions.reduce((s,q)=>s+q.weight,0)} total points`,'pass'],
      ['Multiple response',pct(e.multipleCount,e.questions.length),`${e.multipleCount} of ${e.questions.length} · max 20%`,e.rules.multiple.level],
      ['Action needed',e.actionQuestions.length,'questions with one or more required changes',e.actionQuestions.length?'action':'pass'],
      ['Needs review',e.reviewQuestions.length,'questions with advisory findings',e.reviewQuestions.length?'review':'pass']
    ];
    if(e.manualQuestions.length) cards.push(['Manual check',e.manualQuestions.length,'items whose option-dependent composition rules could not be fully evaluated','manual']);
    const aiCount=e.questions.filter(q=>q.tags.ai.length).length;
    if(aiCount) cards.push(['AI authorship tag',aiCount,`${aiCount} of ${e.questions.length} questions · informational only`,'pass']);
    $('#summaryGrid').innerHTML=cards.map(c=>`<div class="ft-card-soft eb-metric"><div class="eb-metric-label">${esc(c[0])}</div><div class="eb-metric-value">${esc(c[1])}</div><div>${statusBadge(c[3],c[3]==='pass'?'Ready':c[3]==='action'?'Action Needed':c[3]==='manual'?'Manual Check':'Needs Review')}</div><div class="eb-metric-detail">${esc(c[2])}</div></div>`).join('');
  }

  function sortedRuleKeys(keys){
    const priority={action:0,review:1,manual:2,pass:3};
    return keys.map((key,index)=>({key,index,level:state.exam.rules[key]?.level||'pass'}))
      .sort((a,b)=>(priority[a.level]??3)-(priority[b.level]??3) || a.index-b.index)
      .map(x=>x.key);
  }
  function renderRules(){
    const e=state.exam;
    $('#compositionRules').innerHTML=sortedRuleKeys(['parser','multiple','options','ktype','weights','figures','answerKey','manual','ai']).map(k=>ruleHTML(k,e.rules[k])).join('');
    $('#itemQualityRules').innerHTML=sortedRuleKeys(['rationale','stemKeyOverlap','wording','choiceLength','writing']).map(k=>ruleHTML(k,e.rules[k])).join('');
    $('#taggingRules').innerHTML=sortedRuleKeys(['course','faculty','pslo','clo','bloom','tagQuality']).map(k=>ruleHTML(k,e.rules[k])).join('');
  }
  function ruleHTML(key,r){
    const excepted=state.exceptions[key]?.approved && r.level==='action';
    const level=excepted?'exception':r.level, icon=level==='pass'?'✓':level==='review'?'!':level==='manual'?'?':level==='exception'?'↗':'×';
    return `<div class="eb-rule"><div class="eb-rule-icon ${level==='exception'?'review':level}">${icon}</div><div><div class="eb-rule-title">${esc(r.title)}</div><div class="eb-rule-detail">${esc(r.detail)}${excepted?' Approved exception recorded.':''}</div><div class="eb-help ft-mt-1">Evaluated ${r.evaluated ?? state.exam.questions.length} of ${r.total ?? state.exam.questions.length} questions.</div>${r.questions.length?`<div class="eb-help ft-mt-2">Questions: ${r.questions.slice(0,16).map(q=>q.number).join(', ')}${r.questions.length>16?'…':''}</div>`:''}</div>${statusBadge(level,level==='pass'?'Pass':level==='review'?'Review':level==='manual'?'Manual Check':level==='exception'?'Approved Exception':'Action Needed')}</div>`;
  }
  function statusBadge(level,label){ return `<span class="eb-status ${level}">${level==='pass'?'✓':level==='review'?'!':level==='manual'?'?':level==='exception'?'✓':'×'} ${esc(label)}</span>`; }
  function isExceptedRule(r){ const key=Object.keys(state.exam.rules).find(k=>state.exam.rules[k]===r); return key&&state.exceptions[key]?.approved; }

  function facultyName(q){
    return q.tags.faculty?.[0]?.name || '';
  }
  function facultyOptions(){
    if(!state.exam) return [];
    const names=[...new Set(state.exam.questions.flatMap(q=>q.tags.faculty.map(c=>c.name)).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    const hasMissing=state.exam.questions.some(q=>q.tags.faculty.length===0);
    return {names,hasMissing};
  }
  function facultySelectHTML(value='all'){
    const {names,hasMissing}=facultyOptions();
    return `<option value="all" ${value==='all'?'selected':''}>All faculty</option>${names.map(n=>`<option value="${esc(n)}" ${value===n?'selected':''}>${esc(n)}</option>`).join('')}${hasMissing?`<option value="__missing__" ${value==='__missing__'?'selected':''}>Unassigned / missing faculty tag</option>`:''}`;
  }
  function filterByFaculty(qs, value){
    if(value==='all') return qs;
    if(value==='__missing__') return qs.filter(q=>q.tags.faculty.length===0);
    return qs.filter(q=>q.tags.faculty.some(c=>c.name===value));
  }
  const REPORT_CATEGORY_DEFS=[
    {key:'parser',group:'Exam composition',label:'Parser validation',examWide:true},
    {key:'multiple',group:'Exam composition',label:'Multiple response',examWide:true},
    {key:'options',group:'Exam composition',label:'3–5 answer choices'},
    {key:'ktype',group:'Exam composition',label:'K-type questions',examWide:true},
    {key:'weights',group:'Exam composition',label:'Question weights'},
    {key:'figures',group:'Exam composition',label:'Missing figures / attachments'},
    {key:'answerKey',group:'Exam composition',label:'Correct-answer keys'},
    {key:'manual',group:'Exam composition',label:'Manual composition check'},
    {key:'rationale',group:'Item quality',label:'Rationale included'},
    {key:'stemKeyOverlap',group:'Item quality',label:'Stem / correct-answer overlap'},
    {key:'wording',group:'Item quality',label:'Wording review'},
    {key:'choiceLength',group:'Item quality',label:'Correct-answer length cueing'},
    {key:'writing',group:'Item quality',label:'Writing review'},
    {key:'course',group:'ExamSoft tagging',label:'Course Name'},
    {key:'faculty',group:'ExamSoft tagging',label:'Faculty Name'},
    {key:'pslo',group:'ExamSoft tagging',label:'PSLO'},
    {key:'clo',group:'ExamSoft tagging',label:'CLO'},
    {key:'bloom',group:'ExamSoft tagging',label:"Abbreviated Bloom's"},
    {key:'tagQuality',group:'ExamSoft tagging',label:'Tag quality'}
  ];

  function findingReportCategory(f){
    if(!f) return null;
    if(f.kind==='options') return 'options';
    if(f.kind==='weight') return 'weights';
    if(f.kind==='figure') return 'figures';
    if(f.kind==='answer-key') return 'answerKey';
    if(f.kind==='composition') return 'manual';
    if(f.kind==='rationale') return 'rationale';
    if(f.kind==='stem-key-overlap') return 'stemKeyOverlap';
    if(f.kind==='wording') return 'wording';
    if(f.kind==='choice-length') return 'choiceLength';
    if(String(f.kind||'').startsWith('writing-')) return 'writing';
    if(f.kind==='tag'){
      if(/^Course Name tag/i.test(f.text)) return 'course';
      if(/^Faculty Name tag/i.test(f.text)) return 'faculty';
      if(/^PSLO tag missing/i.test(f.text)) return 'pslo';
      if(/^CLO tag missing/i.test(f.text)) return 'clo';
      if(/^Abbreviated Bloom/i.test(f.text)) return 'bloom';
      return 'tagQuality';
    }
    return null;
  }

  function reportCategoryInfos(scope='all'){
    if(!state.exam) return [];
    const scoped=filterByFaculty(state.exam.questions,scope);
    return REPORT_CATEGORY_DEFS.map(def=>{
      const questions=scoped.filter(q=>q.findings.some(f=>findingReportCategory(f)===def.key));
      const rule=state.exam.rules[def.key];
      const examWideFinding=!!def.examWide && rule && rule.level!=='pass';
      return {...def,questions,rule,examWideFinding,applicable:questions.length>0||examWideFinding};
    }).filter(x=>x.applicable);
  }

  // Shared pop-up: the × and Cancel buttons, Escape, and outside clicks close it; focus returns to the opener.
  const reportDialog=FTDialog.manage($('#reportModal'));
  let reportSelectedKeys=null;
  let reportKnownKeys=new Set();

  function updateReportFindingSummary(infos){
    const selected=infos.filter(x=>reportSelectedKeys?.has(x.key)).length;
    const el=$('#reportFindingSummary');
    if(!infos.length) el.textContent='No finding categories apply to this report scope.';
    else el.textContent=`${selected} of ${infos.length} applicable finding categor${infos.length===1?'y':'ies'} selected.`;
  }

  function renderReportFindingOptions(preserve=false){
    const scope=$('#reportFaculty').value || 'all';
    const infos=reportCategoryInfos(scope);
    const nextKeys=new Set(infos.map(x=>x.key));

    if(!preserve || reportSelectedKeys===null){
      reportSelectedKeys=new Set(nextKeys);
    } else {
      const nextSelected=new Set();
      infos.forEach(info=>{
        if(reportSelectedKeys.has(info.key) || !reportKnownKeys.has(info.key)) nextSelected.add(info.key);
      });
      reportSelectedKeys=nextSelected;
    }
    reportKnownKeys=nextKeys;

    if(!infos.length){
      $('#reportFindingOptions').innerHTML='<div class="eb-report-picker-empty">No findings apply to this faculty scope. You can still generate a report or include passed checks below.</div>';
      updateReportFindingSummary(infos);
      return;
    }

    const groups=[...new Set(infos.map(x=>x.group))];
    $('#reportFindingOptions').innerHTML=groups.map(group=>{
      const rows=infos.filter(x=>x.group===group).map(info=>{
        const countLabel=info.questions.length
          ? `${info.questions.length} question${info.questions.length===1?'':'s'}`
          : 'Exam-wide finding';
        return `<label class="eb-report-finding-option"><input type="checkbox" data-report-finding="${info.key}" ${reportSelectedKeys.has(info.key)?'checked':''}><span><strong>${esc(info.label)}</strong><span class="eb-help">${esc(countLabel)}</span></span></label>`;
      }).join('');
      return `<div class="eb-report-picker-group"><div class="eb-report-picker-group-title">${esc(group)}</div>${rows}</div>`;
    }).join('');

    $$('[data-report-finding]',$('#reportFindingOptions')).forEach(cb=>cb.addEventListener('change',()=>{
      if(cb.checked) reportSelectedKeys.add(cb.dataset.reportFinding);
      else reportSelectedKeys.delete(cb.dataset.reportFinding);
      updateReportFindingSummary(infos);
    }));
    updateReportFindingSummary(infos);
  }

  function openReportModal(){
    if(!state.exam) return;
    $('#reportFaculty').innerHTML=facultySelectHTML(state.facultyFilter);
    reportSelectedKeys=null;
    reportKnownKeys=new Set();
    $('#reportIncludePassed').checked=false;
    renderReportFindingOptions(false);
    reportDialog.open();
  }

  function closeReportModal(){
    reportDialog.close();
  }

  $('#reportFaculty').addEventListener('change',()=>renderReportFindingOptions(true));
  $('#reportSelectAllBtn').addEventListener('click',()=>{
    const infos=reportCategoryInfos($('#reportFaculty').value||'all');
    reportSelectedKeys=new Set(infos.map(x=>x.key));
    renderReportFindingOptions(true);
  });
  $('#reportClearAllBtn').addEventListener('click',()=>{
    reportSelectedKeys=new Set();
    renderReportFindingOptions(true);
  });

  function ruleReportRow(key,r){
    const excepted=state.exceptions[key]?.approved && r.level==='action';
    const level=excepted?'exception':r.level;
    const label=level==='pass'?'Pass':level==='review'?'Review':level==='manual'?'Manual Check':level==='exception'?'Approved Exception':'Action Needed';
    return `<tr><td><strong>${esc(r.title)}</strong></td><td>${statusBadge(level,label)}</td><td>${esc(r.detail)}${excepted?' Approved exception recorded.':''}<div class="eb-help">Evaluated ${r.evaluated ?? state.exam.questions.length} of ${r.total ?? state.exam.questions.length} questions.</div></td></tr>`;
  }

  function selectedReportFindings(q,selectedKeys){
    return q.findings.filter(f=>{
      const key=findingReportCategory(f);
      return key && selectedKeys.has(key);
    });
  }

  function findingStatus(findings){
    if(findings.some(f=>f.level==='action')) return 'action';
    if(findings.some(f=>f.level==='review')) return 'review';
    if(findings.some(f=>f.level==='manual')) return 'manual';
    return 'pass';
  }

  function reportQuestionRow(q,findings){
    const actions=findings.filter(f=>f.level==='action');
    const reviews=findings.filter(f=>f.level==='review');
    const manuals=findings.filter(f=>f.level==='manual');
    const faculty=facultyName(q)||'Unassigned';
    const status=findingStatus(findings);
    const label=status==='action'?'Action Needed':status==='review'?'Review':status==='manual'?'Manual Check':'Pass';
    return `<div class="eb-report-item"><div class="eb-report-item-head"><div><strong>Question ${q.number}</strong> <span class="eb-report-item-id">Item ${esc(q.itemId||'—')}</span></div><div>${statusBadge(status,label)}</div></div><div class="eb-report-stem">${esc(q.stem||'(No stem text parsed)')}</div><div class="eb-report-meta">${esc(faculty)} · ${esc(q.type)} · ${fmtWeight(q.weight)}</div>${actions.length?`<div class="eb-report-findings action"><strong>Required changes</strong><ul>${actions.map(f=>`<li>${esc(f.text)}</li>`).join('')}</ul></div>`:''}${reviews.length?`<div class="eb-report-findings review"><strong>Review recommended</strong><ul>${reviews.map(f=>`<li>${esc(f.text)}</li>`).join('')}</ul></div>`:''}${manuals.length?`<div class="eb-report-findings"><strong>Manual check</strong><ul>${manuals.map(f=>`<li>${esc(f.text)}</li>`).join('')}</ul></div>`:''}</div>`;
  }

  function buildReport(scope='all',selectedKeys=new Set(),includePassed=false){
    const e=state.exam, m=e.metadata;
    const scoped=filterByFaculty(e.questions,scope);
    const scopeLabel=scope==='all'?'All faculty':scope==='__missing__'?'Unassigned / missing faculty tag':scope;
    const notes=$('#reportNotes').value.trim();
    const applicable=reportCategoryInfos(scope);
    const applicableKeys=new Set(applicable.map(x=>x.key));
    const selectedApplicable=applicable.filter(x=>selectedKeys.has(x.key));
    const selectedLabels=selectedApplicable.map(x=>x.label);

    const questionRows=scoped.map(q=>({q,findings:selectedReportFindings(q,selectedKeys)})).filter(x=>x.findings.length);
    const actionable=questionRows.filter(x=>findingStatus(x.findings)==='action');
    const review=questionRows.filter(x=>findingStatus(x.findings)==='review');
    const manual=questionRows.filter(x=>x.findings.some(f=>f.level==='manual'));
    const noSelected=scoped.length-questionRows.length;

    const allRuleKeys=['parser','multiple','options','ktype','weights','figures','answerKey','manual','rationale','stemKeyOverlap','wording','choiceLength','writing','ai','course','faculty','pslo','clo','bloom','tagQuality'];
    const ruleKeys=allRuleKeys.filter(k=>selectedKeys.has(k) || (includePassed && e.rules[k]?.level==='pass'));
    const rules=sortedRuleKeys(ruleKeys);
    const exceptions=Object.entries(state.exceptions).filter(([k,v])=>v.approved && selectedKeys.has(k));

    const actionItems=actionable.length
      ? actionable.map(x=>reportQuestionRow(x.q,x.findings)).join('')
      : '<div class="eb-report-empty">No question-level required changes are included in this report.</div>';
    const reviewItems=review.length
      ? review.map(x=>reportQuestionRow(x.q,x.findings)).join('')
      : '<div class="eb-report-empty">No question-level review findings are included in this report.</div>';
    const manualItems=manual.length
      ? manual.map(x=>reportQuestionRow(x.q,x.findings)).join('')
      : '<div class="eb-report-empty">No manual composition checks are included in this report.</div>';

    let scopeSummary;
    if(!applicable.length){
      scopeSummary='No applicable finding categories were present for this faculty scope.';
    } else if(selectedApplicable.length===applicable.length){
      scopeSummary=`All applicable findings · ${applicable.length} categor${applicable.length===1?'y':'ies'} included.`;
    } else {
      scopeSummary=`Selected findings only · ${selectedApplicable.length} of ${applicable.length} applicable finding categories included.`;
    }
    const selectedList=selectedLabels.length?`<div class="eb-report-scope-list"><strong>Included findings:</strong> ${esc(selectedLabels.join(', '))}</div>`:'<div class="eb-report-scope-list"><strong>Included findings:</strong> None selected.</div>';
    const passSummary=includePassed?'Passed checks are included in the guideline table.':'Passed checks are omitted from the guideline table.';

    const auditBits=[];
    if(m.examUid) auditBits.push(`Exam UID: ${esc(m.examUid)}`);
    if(m.creationDate) auditBits.push(`Created: ${esc(m.creationDate)}`);
    if(selectedKeys.has('parser') || includePassed) auditBits.push(`Parser validation: ${esc(e.rules.parser.detail)}`);

    const tableRows=rules.length
      ? rules.map(k=>ruleReportRow(k,e.rules[k])).join('')
      : '<tr><td colspan="3"><div class="eb-report-empty">No guideline checks were selected for this report.</div></td></tr>';

    $('#reportOutput').innerHTML=`<div class="eb-report-page"><header class="eb-report-header"><div><div class="eb-report-brand">Faculty Tools · ExamBridge</div><h1>Exam Review Report</h1><div class="eb-report-subtitle">${esc(e.fileName)}</div></div><div class="eb-report-date">Generated ${new Date().toLocaleDateString()}</div></header><div class="eb-report-meta-grid"><div><span>Course</span><strong>${esc(m.detectedCourseName||m.detectedCourseCode||'Not detected')}</strong></div><div><span>Exam</span><strong>${esc(m.examId?`Exam ID ${m.examId}`:'Exam ID not detected')}</strong></div><div><span>Faculty scope</span><strong>${esc(scopeLabel)}</strong></div><div><span>Questions in scope</span><strong>${scoped.length}</strong></div></div><div class="eb-report-scope"><strong>Report scope:</strong> ${esc(scopeSummary)}<div>${esc(passSummary)}</div>${selectedList}</div>${m.appearsAdministered?`<div class="eb-report-findings review"><strong>Administration detected</strong><div>This export contains results for ${m.examTakers} exam taker(s). Findings can be used as a retrospective quality review.</div></div>`:''}${auditBits.length?`<section class="eb-report-section"><h2>Audit details</h2><div class="eb-report-intro">${auditBits.join(' · ')}</div></section>`:''}<section class="eb-report-section"><h2>Action summary</h2><p class="eb-report-intro">Counts below reflect only the finding categories selected for this report. Exam-wide limits are evaluated on the complete exam; question-specific findings are filtered to <strong>${esc(scopeLabel)}</strong>.</p><div class="eb-report-summary"><div><span>Action needed</span><strong>${actionable.length}</strong></div><div><span>Review</span><strong>${review.length}</strong></div><div><span>Manual check</span><strong>${manual.length}</strong></div><div><span>No selected findings</span><strong>${noSelected}</strong></div></div></section><section class="eb-report-section"><h2>Required changes</h2>${actionItems}</section><section class="eb-report-section"><h2>Review recommended</h2>${reviewItems}</section><section class="eb-report-section"><h2>Manual checks</h2>${manualItems}</section><section class="eb-report-section"><h2>Guideline checks included</h2><table class="eb-report-table"><thead><tr><th>Guideline</th><th>Status</th><th>Finding</th></tr></thead><tbody>${tableRows}</tbody></table></section>${exceptions.length?`<section class="eb-report-section"><h2>Recorded approved exceptions</h2>${exceptions.map(([k,x])=>`<div class="eb-report-exception"><strong>${esc(e.rules[k]?.title||k)}</strong><div>${esc(x.authority||'Approving authority not recorded')}${x.note?` · ${esc(x.note)}`:''}</div></div>`).join('')}</section>`:''}${notes?`<section class="eb-report-section"><h2>Report notes</h2><div class="eb-report-notes">${esc(notes).replace(/\n/g,'<br>')}</div></section>`:''}<footer class="eb-report-footer">This report may contain a selected subset of ExamBridge findings. ExamBridge identifies guideline findings; it does not approve an exam or grant exceptions.</footer></div>`;
    $('#reportOutput').setAttribute('aria-hidden','false');
  }

  function filterQuestions(qs,key){
    if(key==='all') return qs;
    if(key==='action') return qs.filter(q=>q.findings.some(f=>f.level==='action'));
    if(key==='review') return qs.filter(q=>q.findings.some(f=>f.level==='review'));
    if(key==='manual') return qs.filter(q=>q.findings.some(f=>f.level==='manual'));
    if(key==='multiple') return qs.filter(q=>q.type===ITEM_TYPES.MULTIPLE);
    if(key==='fitb') return qs.filter(q=>q.type===ITEM_TYPES.FITB);
    if(key==='options') return qs.filter(q=>q.findings.some(f=>f.kind==='options'));
    if(key==='rationale') return qs.filter(q=>q.findings.some(f=>f.kind==='rationale'));
    if(key==='stem-key-overlap') return qs.filter(q=>q.findings.some(f=>f.kind==='stem-key-overlap'));
    if(key==='wording') return qs.filter(q=>q.findings.some(f=>f.kind==='wording'));
    if(key==='weight') return qs.filter(q=>q.findings.some(f=>f.kind==='weight'));
    if(key==='figure') return qs.filter(q=>q.findings.some(f=>f.kind==='figure'));
    if(key==='answer-key') return qs.filter(q=>q.findings.some(f=>f.kind==='answer-key'));
    if(key==='choice-length') return qs.filter(q=>q.findings.some(f=>f.kind==='choice-length'));
    if(key==='writing') return qs.filter(q=>q.findings.some(f=>f.kind.startsWith('writing-')));
    if(key==='tag') return qs.filter(q=>q.findings.some(f=>f.kind==='tag'));
    return qs;
  }

  function renderQuestions(){
    const filters=[['all','All'],['action','Action Needed'],['review','Needs Review'],['manual','Manual Check'],['multiple','Multiple Response'],['fitb','Fill in Blank'],['options','3–5 Choices'],['rationale','Rationale'],['stem-key-overlap','Stem / Key'],['wording','Wording'],['weight','Weight'],['figure','Figures'],['answer-key','Answer Key'],['choice-length','Length Cue'],['writing','Writing'],['tag','Tags']];
    const base=filterByFaculty(state.exam.questions,state.facultyFilter);
    const counts=Object.fromEntries(filters.map(([k])=>[k,filterQuestions(base,k).length]));

    // If a faculty-scope change makes the active filter empty, return to All.
    if(state.filter!=='all' && !counts[state.filter]) state.filter='all';

    const visibleFilters=filters.filter(([k])=>k==='all' || counts[k]>0);
    const hiddenCount=filters.length-visibleFilters.length;
    $('#filterBar').innerHTML=
      visibleFilters.map(([k,l])=>`<button class="eb-filter ${state.filter===k?'is-active':''}" data-filter="${k}" aria-label="${esc(l)}: ${counts[k]} question${counts[k]===1?'':'s'}">${esc(l)} <span class="eb-filter-count">(${counts[k]})</span></button>`).join('') +
      (hiddenCount?`<div class="eb-filter-note">${hiddenCount} filter${hiddenCount===1?' is':'s are'} hidden because no questions in this view match them.</div>`:'');

    $$('.eb-filter').forEach(b=>b.addEventListener('click',()=>{
      state.filter=b.dataset.filter;
      renderQuestions(); // re-rendering also closes any expanded question detail.
    }));

    $('#facultyFilter').innerHTML=facultySelectHTML(state.facultyFilter);
    $('#facultyFilter').addEventListener('change',e=>{
      state.facultyFilter=e.target.value;
      renderQuestions();
    });

    const qs=filterQuestions(base,state.filter);
    $('#questionRows').innerHTML=qs.length?qs.map(q=>questionRow(q)).join(''):`<tr><td colspan="7"><div class="eb-empty">No questions match this filter.</div></td></tr>`;
    $$('.eb-qrow').forEach(row=>{
      row.addEventListener('click',()=>showQuestion(+row.dataset.q,row));
      row.addEventListener('keydown',e=>{
        if(e.key==='Enter'||e.key===' '){ e.preventDefault(); showQuestion(+row.dataset.q,row); }
      });
    });
  }

  function questionRow(q){
    const tagMissing=['course','faculty','pslo','clo','bloom'].filter(k=>q.tags[k].length===0);
    const tagSummary=tagMissing.length?`<span class="eb-mini missing">${tagMissing.length} missing</span>`:`<span class="eb-mini">Complete</span>`;
    const label=q.status==='action'?'Action Needed':q.status==='review'?'Review':q.status==='manual'?'Manual Check':'Pass';
    return `<tr class="eb-qrow is-${q.status}" data-q="${q.number}" tabindex="0" role="button" aria-expanded="false" aria-label="Open details for question ${q.number}"><td class="eb-qnum">${q.number}</td><td><div class="eb-stem" title="${esc(q.stem)}">${esc(q.stem||'(No stem text parsed)')}</div><div class="eb-help">Item ${esc(q.itemId||'—')}</div></td><td>${esc(q.type)}</td><td>${esc(q.weight)}</td><td>${q.options.length||'—'}</td><td>${tagSummary}</td><td>${statusBadge(q.status,label)}</td></tr>`;
  }

  function questionDetailHTML(q){
    const tagBlock=(label,arr)=>`<div class="eb-detail-block"><strong>${label}</strong>${arr.length?arr.map(c=>`<div class="eb-help">${esc(c.name)}</div>`).join(''):`<div class="ft-status-error">× Missing</div>`}</div>`;
    const findings=q.findings.length?q.findings.map(f=>`<div class="ft-notice ${f.level==='action'?'ft-notice-danger':f.level==='manual'?'':'ft-notice-warning'} ft-mt-2"><strong>${f.level==='action'?'Action needed':f.level==='manual'?'Manual check':'Review'}:</strong> ${esc(f.text)}</div>`).join(''):`<div class="ft-notice ft-notice-success">✓ No question-level findings.</div>`;
    return `<div class="eb-inline-detail"><div class="eb-section-head"><div><div class="ft-eyebrow">Question ${q.number} · Item ${esc(q.itemId||'—')}</div><h3 class="eb-detail-stem">${esc(q.stem)}</h3></div><button class="ft-icon-btn eb-close-inline-detail" aria-label="Close question ${q.number} detail">×</button></div>${q.options.length?`<div class="eb-options">${q.options.map(o=>`<div class="eb-option ${o.correct?'correct':''}">${o.correct?'✓ ':''}<strong>${o.label}.</strong> ${esc(o.text)} <span class="eb-option-count">${(normalizeSpace(o.text||'').match(/\b[\w’'-]+\b/g)||[]).length} words</span></div>`).join('')}</div>`:''}${q.rationale?`<div class="eb-rationale"><strong>Rationale</strong><div>${esc(q.rationale)}</div></div>`:''}<div class="eb-detail-grid"><div class="eb-detail-block"><strong>Question type</strong>${esc(q.type)} · ${fmtWeight(q.weight)}${q.attachment?`<div class="eb-help">Attachment: ${esc(q.attachment)}</div>`:''}</div>${tagBlock('Faculty',q.tags.faculty)}${tagBlock('PSLO',q.tags.pslo)}${tagBlock('CLO',q.tags.clo)}${tagBlock("Bloom's",q.tags.bloom)}${tagBlock('Course Name',q.tags.course)}</div><div class="ft-mt-4"><strong>Findings</strong>${findings}</div></div>`;
  }

  function showQuestion(n,row){
    const q=state.exam.questions.find(x=>x.number===n); if(!q) return;
    const current=$('.eb-detail-row');
    const currentQ=current?.dataset?.q;
    $$('.eb-qrow[aria-expanded="true"]').forEach(r=>r.setAttribute('aria-expanded','false'));
    if(current) current.remove();

    // Clicking the already-open question toggles it closed without moving the page.
    if(currentQ===String(n)) return;

    const detailRow=document.createElement('tr');
    detailRow.className='eb-detail-row';
    detailRow.dataset.q=String(n);
    detailRow.innerHTML=`<td colspan="7">${questionDetailHTML(q)}</td>`;
    row.insertAdjacentElement('afterend',detailRow);
    row.setAttribute('aria-expanded','true');

    const close=$('.eb-close-inline-detail',detailRow);
    close?.addEventListener('click',e=>{
      e.stopPropagation();
      detailRow.remove();
      row.setAttribute('aria-expanded','false');
      row.focus();
    });
  }

  function renderExceptions(){
    const eligible=[['multiple',state.exam.rules.multiple],['ktype',state.exam.rules.ktype]].filter(([,r])=>r.level==='action');
    if(!eligible.length){ $('#exceptionArea').innerHTML='<div class="ft-notice ft-notice-success">✓ No exam-level maximum currently requires an exception.</div>'; return; }
    $('#exceptionArea').innerHTML=eligible.map(([key,r])=>{
      const ex=state.exceptions[key]||{};
      return `<div class="ft-card-soft ft-p-4 ft-mb-3"><div class="eb-section-head"><div><strong>${esc(r.title)}</strong><div class="eb-help">${esc(r.detail)}</div></div>${ex.approved?statusBadge('exception','Approved Exception'):statusBadge('action','Action Needed')}</div><label style="display:flex;gap:9px;align-items:flex-start"><input type="checkbox" data-ex-approved="${key}" ${ex.approved?'checked':''}> <span><strong>An exemption has been approved by the department chair or ADAA.</strong><div class="eb-help">Checking this records the faculty member's declaration; ExamBridge does not grant approval.</div></span></label><div class="eb-exception-form ft-mt-3 ${ex.approved?'':'eb-hidden'}" data-ex-fields="${key}"><div class="ft-field"><label>Approving authority (optional)</label><select class="ft-select" data-ex-authority="${key}"><option value="">Not recorded</option><option ${ex.authority==='Department Chair'?'selected':''}>Department Chair</option><option ${ex.authority==='ADAA'?'selected':''}>ADAA</option></select></div><div class="ft-field"><label>Note (optional)</label><input class="ft-input" data-ex-note="${key}" value="${esc(ex.note||'')}" placeholder="e.g., Approved for this exam"></div></div></div>`;
    }).join('');
    $$('[data-ex-approved]').forEach(c=>c.addEventListener('change',()=>{
      const key=c.dataset.exApproved; state.exceptions[key]=state.exceptions[key]||{}; state.exceptions[key].approved=c.checked;
      saveSession();
      render();
    }));
    $$('[data-ex-authority]').forEach(s=>s.addEventListener('change',()=>{ const k=s.dataset.exAuthority; state.exceptions[k]=state.exceptions[k]||{}; state.exceptions[k].authority=s.value; saveSession(); }));
    $$('[data-ex-note]').forEach(i=>i.addEventListener('input',()=>{ const k=i.dataset.exNote; state.exceptions[k]=state.exceptions[k]||{}; state.exceptions[k].note=i.value; saveSession(); }));
  }

  window.__ExamBridgeQA = { loadFile, rtfToText, parseExam, evaluateExam, answerChoiceLengthCheck, isKType, ITEM_TYPES, getState:()=>state };
})();
