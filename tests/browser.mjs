import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from '../scripts/serve.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium }=await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
const browser=await chromium.launch({ headless:true, ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath:process.env.CHROMIUM_EXECUTABLE_PATH } : {}), args:process.env.CHROMIUM_ARGS_JSON ? JSON.parse(process.env.CHROMIUM_ARGS_JSON) : [] });
const manifest=JSON.parse(fs.readFileSync(path.join(root,'suite.json')));
const output=path.join(root,'test-results');fs.mkdirSync(output,{recursive:true});
const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const results=[];
// Synthetic skills-lab syllabus (Word XML) read by both CalendarBridge and SyllabusBridge. Every name is made up.
// A Monday pre-lab lecture plus a "Tuesday or Wednesday" lab section row whose Topic and Lead boxes are merged
// down from the Monday row; job titles on their own line under each name; plural weekday names in the meeting
// times; a pre-lab quiz inside the Monday lecture; "8:00 a – 5:00 p" times.
function skillsLabXml(){
  const NS='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const p=t=>`<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
  // A cell is a string, or {lines, merge:'restart'|'continue', span}.
  const tc=c=>{c=typeof c==='string'?{lines:[c]}:c;const pr=(c.span?`<w:gridSpan w:val="${c.span}"/>`:'')+(c.merge==='restart'?'<w:vMerge w:val="restart"/>':c.merge==='continue'?'<w:vMerge/>':'');return `<w:tc>${pr?`<w:tcPr>${pr}</w:tcPr>`:''}${c.merge==='continue'?'<w:p/>':c.lines.map(p).join('')}</w:tc>`};
  const top=(lines,span)=>({lines,merge:'restart',span}),cont=span=>({merge:'continue',span});
  const paragraphs=['PHA9998 - Synthetic Skills Lab','Fall 2026','COURSE COORDINATOR: Ada Faculty, PharmD','Assistant Professor, Dept of Pharmacy Practice','Email: afaculty@university.edu',
    'COURSE FACULTY:','Ben Mentor, AAS, CPhT','Lab Assistant','Office: Room 101','Email: bmentor@university.edu','Cara Visitor, Pharm.D.','Adjunct, Department of Pharmacy Practice','Email: cvisitor@university.edu',
    'TIME AND LOCATION: Lecture (101): Mondays (9:00 am -10:00 am)','Lab (201/202): Tuesday or Wednesday (1:30pm - 4:30pm)','QUARTER CREDIT HOURS: 2','Course Schedule'];
  const rows=[['Week','Date','Topic(s)','Review in Brightspace','Lead'],
    [top(['Week 1']),{lines:['Pre-Lab','Monday (9/21/26)']},top(['Pre-Lab: Quiz 1 (1 – 10)','Sterile Labels'],2),top(['Faculty'])],
    [cont(),{lines:['Tuesday (9/22/26) or','Wednesday (9/23/26)']},cont(2),cont()],
    ['Week 1',{lines:['Friday (9/25/26)','8:00 a – 5:00 p']},{lines:['Immunization Training'],span:2},'Faculty'],
    [top(['Week 2']),{lines:['Pre-Lab','Monday (9/28/26)']},top(['Emulsions','Wednesday section: class will be held on Friday because of the 9/30/26 holiday'],2),top(['Visitor'])],
    [cont(),{lines:['Tuesday (9/29/26) or','Friday (10/2/26)']},cont(2),cont()],
    ['Week 3',{lines:['Tuesday (10/6/26) or','Wednesday (10/7/26)']},{lines:['Final Skills Assessment','Arrive at your assigned time'],span:2},'Faculty']];
  const xml=`<?xml version="1.0"?><w:document xmlns:w="${NS}"><w:body>${paragraphs.map(p).join('')}<w:tbl>${rows.map(r=>'<w:tr>'+r.map(tc).join('')+'</w:tr>').join('')}</w:tbl></w:body></w:document>`;
  return xml;
}
// Synthetic syllabus whose schedule names a faculty member inside a topic ("Antibiotics (Mentor)") and leaves the
// Faculty box empty. Every name is made up.
function facultyInTopicXml(){
  const p=t=>`<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`,tc=t=>'<w:tc>'+p(t)+'</w:tc>';
  const paragraphs=['PHA9997 - Synthetic Pharmacotherapy','Fall 2026','COURSE COORDINATOR: Ada Faculty, PharmD','Email: afaculty@university.edu','COURSE FACULTY:','Ben Mentor, Ph.D.','Email: bmentor@university.edu','Course Schedule'];
  const rows=[['Date','Topic','Faculty'],['9/21/26','Proteins','Faculty'],['9/22/26','Antibiotics (Mentor)',''],['9/23/26','Enzymes','']];
  return `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.map(p).join('')}<w:tbl>${rows.map(r=>'<w:tr>'+r.map(tc).join('')+'</w:tr>').join('')}</w:tbl></w:body></w:document>`;
}
try {
  for(const format of ['site','standalone']) for(const tool of manifest.tools) {
    const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
    const page=await context.newPage();const errors=[],remote=[];
    page.on('pageerror',e=>errors.push(e.message));
    await context.route('**/*',route=>{
      const url=route.request().url();
      if(/^(https?:)/.test(url) && !url.startsWith(origin)) { remote.push(url);return route.abort(); }
      return route.continue();
    });
    const url=format==='site' ? `${origin}/${tool.route ? tool.route + '/' : ''}` : pathToFileURL(path.join(root,'dist/standalone',`${tool.name}-v${tool.version}-build${manifest.suiteVersion}.html`)).href;
    await page.goto(url);await page.waitForLoadState('load');
    await page.addStyleTag({content:'*,*::before,*::after{transition:none!important;animation:none!important}'});
    assert.deepEqual(errors,[],`${tool.id} ${format} startup: ${errors.join('; ')}`);
    assert.deepEqual(remote,[],`${tool.id} ${format} remote requests`);
    assert.ok((await page.locator('.ft-build-label').textContent()).includes(`Build ${manifest.suiteVersion}`));
    assert.ok((await page.locator('header, .ft-topbar').first().textContent()).includes(`v${tool.version}`));
    // Every page tells faculty who to contact, which build they are using, and not to send student or exam data.
    const help=page.locator('.ft-support');
    assert.equal(await help.count(),1,`${tool.id} ${format} support note`);
    assert.ok(await help.isVisible(),`${tool.id} ${format} support note visible`);
    const helpText=await help.textContent();
    for(const part of [manifest.support.email,`v${tool.version}`,`Build ${manifest.suiteVersion}`,'student']) assert.ok(helpText.includes(part),`${tool.id} ${format} support note mentions ${part}: ${helpText}`);
    const mail=await help.locator('a').getAttribute('href');
    assert.ok(mail.startsWith(`mailto:${manifest.support.email}?subject=`),`${tool.id} ${format} support link: ${mail}`);
    assert.ok(decodeURIComponent(mail).includes(`${tool.name} v${tool.version} (Build ${manifest.suiteVersion})`),`${tool.id} ${format} support subject: ${mail}`);
    // Accessibility basics: every form control in the page markup has a name a screen reader can announce,
    // and the visible page has exactly one main-content landmark.
    const unlabeled=await page.evaluate(()=>[...document.querySelectorAll('input:not([type=hidden]):not([type=file]),select,textarea')]
      .filter(e=>!(e.getAttribute('aria-label')||e.getAttribute('aria-labelledby')||e.labels?.length||e.title)).map(e=>e.id||e.name||e.tagName));
    assert.deepEqual(unlabeled,[],`${tool.id} ${format} form controls without labels`);
    assert.equal(await page.locator('main:visible, [role="main"]:visible').count(),1,`${tool.id} ${format} main landmark`);
    const oldTheme=await page.locator('html').getAttribute('data-ft-theme');
    const theme=page.locator('#themeToggle, #themeBtn, #theme, #themeBtn');
    await theme.first().click();
    assert.notEqual(await page.locator('html').getAttribute('data-ft-theme'),oldTheme,`${tool.id} theme toggle`);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const colors=await page.evaluate(()=>{
      const css=getComputedStyle(document.documentElement);
      return {background:css.getPropertyValue('--ft-bg').trim(),brand:css.getPropertyValue('--ft-brand-700').trim()};
    });
    assert.ok(colors.background && colors.brand);
    const contrast=await page.evaluate(()=>{
      const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');
      const rgb=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data];};
      const luminance=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
      return [...document.querySelectorAll('.ft-btn-primary, .ft-btn-accent')].filter(e=>e.getClientRects().length && !e.disabled).map(e=>{const css=getComputedStyle(e),a=luminance(rgb(css.color)),b=luminance(rgb(css.backgroundColor));return {text:e.textContent.trim(),ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};});
    });
    for(const button of contrast) assert.ok(button.ratio>=4.5,`${tool.id} dark button ${button.text}: contrast ${button.ratio}`);
    await page.screenshot({path:path.join(output,`${tool.id}-${format}-dark.png`),fullPage:true,animations:'disabled'});
    await theme.first().click();
    await page.screenshot({path:path.join(output,`${tool.id}-${format}-light.png`),fullPage:true,animations:'disabled'});
    if(tool.id==='facultybridge') {
      assert.equal(await page.locator('[data-tool-link]').count(),7);
      for(const other of manifest.tools.filter(t=>t.route)) {
        const link=page.locator(`[data-tool-link="${other.id}"]`);assert.ok((await link.getAttribute('href')).includes(format==='site'?other.route:other.name));
        assert.ok((await link.locator('xpath=ancestor::article').textContent()).includes(`v${other.version}`));
      }
    }
    if(tool.id==='groupbridge') {
      const csv='Last Name,First Name,Username,Org Defined ID,Exam 1 Points Grade\r\nAble,Anna,#aable,00001,80\r\nBaker,Ben,bbaker,00002,70\r\nClark,Cara,cclark,00003,90\r\nDavis,Dan,ddavis,00004,\r\n';
      const upload=async(name,text)=>page.locator('#fileInput').setInputFiles({name,mimeType:'text/csv',buffer:Buffer.from(text)});
      await upload('roster.csv',csv);
      await page.locator('#toConfig').click();await page.locator('#groupCount').fill('2');
      await page.locator('#balanceCol').selectOption('Exam 1 Points Grade');
      await page.locator('#generateBtn').click();await page.waitForFunction(()=>groups.length===2&&!isGenerating);
      assert.equal(await page.locator('.member').count(),4);
      assert.equal(await page.locator('.score.missing').count(),1);
      assert.ok((await page.locator('#groupNotice').textContent()).includes('1 of 4'));
      const stats=await page.evaluate(()=>groups.map(statsFor));
      assert.equal(stats.reduce((n,g)=>n+g.valued,0),3);assert.equal(stats.reduce((n,g)=>n+g.missing,0),1);
      for(const g of stats) assert.ok(Number.isFinite(g.mean));
      assert.ok((await page.locator('#groupMeanSummary').textContent()).includes('1 of 2 students'));
      // A full destination offers a swap and keeps every student enrolled exactly once.
      const pair=await page.evaluate(()=>({a:groups[0].ids[0],b:groups[1].ids[0]}));
      await page.locator(`.moveStudent[data-id="${pair.a}"]`).selectOption('1');
      await page.locator('#swapChoice').selectOption(String(pair.b));await page.locator('#confirmSwap').click();
      assert.deepEqual(await page.evaluate(({a,b})=>[groups[1].ids.includes(a),groups[0].ids.includes(b),...groups.map(g=>g.ids.length)],pair),[true,true,2,2]);
      // Together constraints prevent a manual swap that would split the pair.
      const blocked=await page.evaluate(()=>{constraints=[{type:'together',a:groups[0].ids[0],b:groups[0].ids[1]}];return {a:groups[0].ids[0],b:groups[1].ids[0],signature:assignmentSignature(groups)};});
      await page.locator(`.moveStudent[data-id="${blocked.a}"]`).selectOption('1');
      await page.locator('#swapChoice').selectOption(String(blocked.b));await page.locator('#confirmSwap').click();
      assert.ok(await page.locator('.inlineError').count());assert.equal(await page.evaluate(()=>assignmentSignature(groups)),blocked.signature);
      await page.locator('#cancelSwap').click();await page.locator('#toExport').click();
      await page.locator('#gCode0').fill('G1');await page.locator('#gCode1').fill('G1');
      assert.equal(await page.locator('#downloadBright').isDisabled(),true);
      assert.ok((await page.locator('#exportStatus').textContent()).includes('unique'));
      await page.locator('#gCode1').fill('G2');assert.equal(await page.locator('#downloadBright').isEnabled(),true);
      const exported=await page.evaluate(()=>({plan:planCsv(),bright:brightCsv(),report:pdfReportHtml(true)}));
      assert.ok(exported.plan.includes('00001'));assert.equal(exported.bright.trim().split(/\r?\n/).length,4);
      assert.ok(exported.bright.includes('ENROLL,aable,00001'));assert.ok(!exported.bright.includes('#aable'));
      assert.ok(exported.report.includes('means exclude those records'));assert.ok(exported.report.includes('No value'));
      const downloadEvent=page.waitForEvent('download');await page.locator('#downloadBright').click();
      const downloaded=await downloadEvent;const bytes=fs.readFileSync(await downloaded.path());
      assert.equal(bytes.subarray(0,6).toString(),'ENROLL'); // Brightspace import has no BOM/header.
      assert.match(downloaded.suggestedFilename(),/^GroupBridge-Brightspace-Group-Import-\d{4}-\d{2}-\d{2}\.csv$/);
      const integrity=await page.evaluate(()=>{const id=groups[0].ids[0];groups[1].ids.push(id);validateExport();let rejected=false;try{brightCsv()}catch{rejected=true}groups[1].ids.pop();validateExport();return rejected;});
      assert.equal(integrity,true);
      // Rejected replacement retains the current roster/groups; a valid replacement clears them.
      await page.locator('.step[data-step="1"]').click();
      await upload('duplicate.csv',csv.replace('bbaker','aable'));
      await page.waitForFunction(()=>document.getElementById('uploadStatus').textContent.includes('duplicate Username'));
      assert.equal(await page.evaluate(()=>students.length),4);assert.equal(await page.evaluate(()=>groups.length),2);
      await upload('replacement.csv','Last Name,First Name,Username,Org Defined ID\nNew,Nina,nnew,00100\nOther,Omar,oother,00101\n');
      await page.waitForFunction(()=>fileName==='replacement.csv');
      assert.deepEqual(await page.evaluate(()=>[students.length,groups.length,constraints.length]),[2,0,0]);
      assert.equal(await page.locator('#downloadBright').isDisabled(),true);
      assert.equal(await page.locator('.step[data-step="4"]').isDisabled(),true);
      assert.equal(await page.locator('#codeGrid').textContent(),'');
    }
    if(['gradebridge','groupbridge'].includes(tool.id)) {
      const parsed=await page.evaluate(()=>parseCSV('Name,ID,Score\r\n"A, B",0000123,89\r\n'));
      assert.deepEqual(parsed[1],['A, B','0000123','89']);
    }
    if(tool.id==='itembridge') {
      const message=await page.evaluate(()=>{try { window.ItemBridge.parseExam('invalid','invalid.csv');return ''; } catch(e) {return e.message;} });
      assert.ok(message.includes('ExamSoft'));
    }
    if(['calendarbridge','questionbridge','syllabusbridge'].includes(tool.id)) {
      const zip=await page.evaluate(async()=>{const z=new JSZip();z.file('word/document.xml','<document>FacultyBridge ZIP check</document>');const bytes=await z.generateAsync({type:'uint8array'});return (await JSZip.loadAsync(bytes)).file('word/document.xml').async('string');});
      assert.ok(zip.includes('FacultyBridge ZIP check'));
    }
    if(['calendarbridge','syllabusbridge'].includes(tool.id)) {
      const parsed=await page.evaluate(async id=>{
        const paragraphs=['PHA9999 - Synthetic Course','Course Coordinator: Dr. Ada Faculty','Fall 2026','Course Schedule'];
        const table=[['Date','Time','Topic','Faculty'],['9/21/2026','9:00 AM - 10:00 AM','Proteins','Dr. Ada Faculty'],['9/23/2026','9:00 AM - 10:00 AM','Enzymes','Dr. Ada Faculty'],['9/28/2026','9:00 AM - 10:00 AM','Hemoglobin','Dr. Ada Faculty']];
        const p=t=>`<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;
        const xml=`<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.map(p).join('')}<w:tbl>${table.map(r=>'<w:tr>'+r.map(t=>'<w:tc>'+p(t)+'</w:tc>').join('')+'</w:tr>').join('')}</w:tbl></w:body></w:document>`;
        const z=new JSZip();z.file('word/document.xml',xml);
        const file=new File([await z.generateAsync({type:'uint8array'})],'synthetic-syllabus.docx',{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
        const parsed=await parseDocx(file);return id==='calendarbridge'?parsed.events.length:parsed.schedule.length;
      },tool.id);
      assert.equal(parsed,3,`${tool.id} synthetic Word schedule extraction`);
      // Review class periods that mention an exam or a quiz deadline are class meetings, not exams;
      // real exams stay assessments. SyllabusBridge's Course JSON handoff must agree.
      const classifyFn=tool.id==='calendarbridge'?'classify':'classifySharedEvent';
      const types=await page.evaluate(fn=>['Review for exam 1 (Quiz 1 due at 8 AM)','Final Exam Review','Class activities (Quiz 2 due at 8AM)','Exam 1 (Lectures 1-8)','Comprehensive Final Exam','Quiz 3'].map(t=>window[fn](t)),classifyFn);
      assert.deepEqual(types.slice(0,2),['activity','activity'],`${tool.id} review periods are class meetings`);
      assert.notEqual(types[2],'assessment',`${tool.id} a quiz deadline note does not make a class period an exam`);
      assert.deepEqual(types.slice(3),['assessment','assessment','assessment'],`${tool.id} real exams and quizzes stay assessments`);
    }
    if(['calendarbridge','syllabusbridge'].includes(tool.id)) {
      // Date typos: a day name sharing the date's cell that disagrees with the calendar, a year that breaks
      // from the dates around it, and a date earlier than the row above. Correct rows stay unflagged.
      const flags=await page.evaluate(async id=>{
        const p=t=>`<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`,tc=t=>'<w:tc>'+p(t)+'</w:tc>';
        const rows=[['Lecture','Date','Course Topics','Instructor'],['1','Monday 9/21/26','Proteins','Ada'],['2','Thursday 9/23/26','Enzymes','Ada'],['3','Friday 9/25/26','Lipids','Ada'],['4','Monday 9/28/25','Hemoglobin','Ada'],['5','Wednesday 9/30/26','Membranes','Ada'],['6','Wednesday 9/16/26','Carbohydrates','Ada']];
        const xml=`<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${p('PHA9999 - Synthetic Course')}${p('Fall 2026')}${p('Course Schedule')}<w:tbl>${rows.map(r=>'<w:tr>'+r.map(tc).join('')+'</w:tr>').join('')}</w:tbl></w:body></w:document>`;
        const z=new JSZip();z.file('word/document.xml',xml);
        const file=new File([await z.generateAsync({type:'uint8array'})],'synthetic-date-typos.docx');
        if(id==='syllabusbridge'){await parseDocx(file);return scheduleDateWarnings()}
        const parsed=await parseDocx(file);state.events=parsed.events;resolveEventYears();flagDateProblems();
        return Object.fromEntries(state.events.map(e=>[e.topic,eventIssues(e).filter(x=>['weekday','year','date-order'].includes(x))]));
      },tool.id);
      if(tool.id==='calendarbridge') assert.deepEqual(flags,{Proteins:[],Enzymes:['weekday'],Lipids:[],Hemoglobin:['weekday','year'],Membranes:[],Carbohydrates:['date-order']},'calendarbridge date typo flags');
      else assert.deepEqual(flags,['Thursday 9/23/26: that date is a Wednesday','Monday 9/28/25: that date is a Sunday','9/28/25: the year 2025 does not match the dates around it (2026)','9/16/26: earlier than the row above it'],'syllabusbridge date typo warnings');
    }
    if(['calendarbridge','syllabusbridge'].includes(tool.id)) {
      // A faculty name inside a topic ("Antibiotics (Mentor)"): CalendarBridge names the event "Antibiotics" and lists
      // Mentor as its faculty. SyllabusBridge keeps the topic as written in Word and lists Mentor for that row only.
      const rows=await page.evaluate(async({id,xml})=>{
        const z=new JSZip();z.file('word/document.xml',xml);
        const parsed=await parseDocx(new File([await z.generateAsync({type:'uint8array'})],'synthetic-faculty-in-topic.docx'));
        if(id==='syllabusbridge') return state.schedule.map(e=>`${e.date}|${e.topic}|${e.faculty}`);
        return parsed.events.map(e=>`${e.date}|${e.topic}|${e.facultyIds.map(f=>parsed.faculty.find(x=>x.id===f)?.short||f).join('+')}`);
      },{id:tool.id,xml:facultyInTopicXml()});
      if(tool.id==='calendarbridge') assert.deepEqual(rows,['9/21/2026|Proteins|Faculty','9/22/2026|Antibiotics|Mentor','9/23/2026|Enzymes|Faculty'],'calendarbridge removes a faculty name from the topic');
      else assert.deepEqual(rows,['9/21/26|Proteins|Faculty','9/22/26|Antibiotics (Mentor)|Mentor','9/23/26|Enzymes|Faculty'],'syllabusbridge lists the faculty named in a topic for that row only');
    }
    if(tool.id==='calendarbridge') {
      // "Week N" heading rows inside a schedule table are section labels, not calendar events.
      const topics=await page.evaluate(async()=>{
        const p=t=>`<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`,tc=t=>'<w:tc>'+p(t)+'</w:tc>';
        const rows=[['Lecture','Date','Course Topics','Instructor'],['1','Monday 9/21/26','Proteins','Ada'],['Week 2'],['2','Monday 9/28/26','Enzymes','Ada'],['','Friday 10/2/26','Review for exam 1 (Quiz 1 due at 8 AM)','Ada']];
        const xml=`<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${p('Course Schedule')}<w:tbl>${rows.map(r=>'<w:tr>'+r.map(tc).join('')+'</w:tr>').join('')}</w:tbl></w:body></w:document>`;
        const z=new JSZip();z.file('word/document.xml',xml);
        const parsed=await parseDocx(new File([await z.generateAsync({type:'uint8array'})],'synthetic-weeks.docx'));
        return parsed.events.map(e=>`${e.topic}|${e.type}`);
      });
      assert.deepEqual(topics,['Proteins|lecture','Enzymes|lecture','Review for exam 1 (Quiz 1 due at 8 AM)|activity'],'calendarbridge skips Week heading rows');
      // Skills-lab layout (see skillsLabXml).
      const lab=await page.evaluate(async xml=>{
        const z=new JSZip();z.file('word/document.xml',xml);
        // Same steps parseFile runs after reading the Word file.
        state=await parseDocx(new File([await z.generateAsync({type:'uint8array'})],'synthetic-skills-lab.docx'));
        resolveEventYears();flagDateProblems();inferMissingTimes();state.events=dedupeEvents(state.events);
        const short=ids=>(ids||[]).map(id=>state.faculty.find(f=>f.id===id)?.short||id).join('+');
        return {faculty:state.faculty.map(f=>`${f.name}|${f.email}`),patterns:Object.fromEntries(Object.entries(state.meetingPatterns).filter(([,v])=>v.length)),
          events:state.events.map(e=>`${e.date}|${e.day}|${e.time}|${e.topic}|${e.type}|${e.include}|${short(e.facultyIds)}`),
          // A full-day training (8 AM to 5 PM) is a usable time, not a time problem.
          fullDayIssues:eventIssues(state.events.find(e=>e.date==='9/25/2026'))};
      },skillsLabXml());
      assert.deepEqual(lab.faculty,['Ada Faculty, PharmD|afaculty@university.edu','Ben Mentor, AAS, CPhT|bmentor@university.edu','Cara Visitor, Pharm.D.|cvisitor@university.edu'],'calendarbridge skips job-title lines when naming faculty');
      assert.deepEqual(lab.patterns,{Monday:['9:00 am – 10:00 am'],Tuesday:['1:30pm – 4:30pm'],Wednesday:['1:30pm – 4:30pm']},'calendarbridge reads plural weekday meeting times');
      assert.deepEqual(lab.events,[
        '9/21/2026|Monday|9:00 am – 10:00 am|Pre-Lab: Quiz 1 (1 – 10) Sterile Labels|lecture|true|Faculty',
        '9/22/2026|Tuesday|1:30pm – 4:30pm|Pre-Lab: Quiz 1 (1 – 10) Sterile Labels|lecture|true|Faculty',
        '9/23/2026|Wednesday|1:30pm – 4:30pm|Pre-Lab: Quiz 1 (1 – 10) Sterile Labels|lecture|true|Faculty',
        '9/25/2026|Friday|8:00 AM – 5:00 PM|Immunization Training|lecture|true|Faculty',
        '9/28/2026|Monday|9:00 am – 10:00 am|Emulsions Wednesday section: class will be held on Friday because of the 9/30/26 holiday|lecture|true|Visitor',
        '9/29/2026|Tuesday|1:30pm – 4:30pm|Emulsions Wednesday section: class will be held on Friday because of the 9/30/26 holiday|lecture|true|Visitor',
        '10/2/2026|Friday||Emulsions Wednesday section: class will be held on Friday because of the 9/30/26 holiday|lecture|true|Visitor',
        '10/6/2026|Tuesday|1:30pm – 4:30pm|Final Skills Assessment Arrive at your assigned time|lecture|true|Faculty',
        '10/7/2026|Wednesday|1:30pm – 4:30pm|Final Skills Assessment Arrive at your assigned time|lecture|true|Faculty'],'calendarbridge skills-lab schedule rows');
      assert.deepEqual(lab.fullDayIssues,[],'calendarbridge accepts a full-day time range');
    }
    if(tool.id==='syllabusbridge') {
      // Report filters are generated dynamically after parsing the synthetic syllabus.
      await page.evaluate(()=>{renderReport();go('report');});
      assert.equal(await page.locator('#filters .ft-btn').count(),5);
      for(const mode of ['light','dark']) {
        await page.evaluate(mode=>document.documentElement.setAttribute('data-ft-theme',mode),mode);
        const styles=await page.locator('#filters button').evaluateAll(buttons=>buttons.map(b=>{const c=getComputedStyle(b);return {radius:parseFloat(c.borderRadius),height:b.getBoundingClientRect().height,padding:parseFloat(c.paddingLeft)};}));
        for(const style of styles) {assert.ok(style.radius>=10);assert.ok(style.height>=42);assert.ok(style.padding>=12);}
        await page.locator('#filters button').nth(2).click();
        assert.equal(await page.locator('#filters .active').textContent(),'Warnings');
        assert.equal(await page.locator('#results .result:not(.warning-status)').count(),0);
        await page.locator('#filters button').first().click();
        assert.ok(await page.locator('#results .result').count());
        await page.screenshot({path:path.join(output,`syllabusbridge-${format}-report-${mode}.png`),fullPage:true,animations:'disabled'});
      }
      await page.evaluate(()=>document.documentElement.setAttribute('data-ft-theme','light'));
      // The same skills-lab syllabus CalendarBridge reads above: SyllabusBridge uses the shared schedule reader,
      // so the "Tuesday or Wednesday" lab rows get the merged-down topic and lead, and Monday pre-lab rows keep theirs.
      const lab=await page.evaluate(async xml=>{
        const z=new JSZip();z.file('word/document.xml',xml);
        await parseDocx(new File([await z.generateAsync({type:'uint8array'})],'synthetic-skills-lab.docx'));
        const at=d=>state.schedule.find(e=>e.date===d)?.source;
        return {patterns:Object.fromEntries(state.meetingPatterns.map(m=>[m.day,m.time])),
          rows:state.schedule.map(e=>`${e.date}|${e.day}|${e.time}|${e.topic}|${e.faculty}`),
          monday:at('9/21/26'),tuesday:at('9/22/26'),preLabType:classifySharedEvent(state.schedule[0]?.topic||'')};
      },skillsLabXml());
      assert.deepEqual(lab.patterns,{Monday:'9:00 am – 10:00 am',Tuesday:'1:30pm – 4:30pm',Wednesday:'1:30pm – 4:30pm'},'syllabusbridge reads plural weekday meeting times');
      assert.deepEqual(lab.rows,[
        '9/21/26|Monday|9:00 am – 10:00 am|Pre-Lab: Quiz 1 (1 – 10) Sterile Labels|Faculty',
        '9/22/26|Tuesday|1:30pm – 4:30pm|Pre-Lab: Quiz 1 (1 – 10) Sterile Labels|Faculty',
        '9/23/26|Wednesday|1:30pm – 4:30pm|Pre-Lab: Quiz 1 (1 – 10) Sterile Labels|Faculty',
        '9/25/26|Friday|8:00 AM – 5:00 PM|Immunization Training|Faculty',
        '9/28/26|Monday|9:00 am – 10:00 am|Emulsions Wednesday section: class will be held on Friday because of the 9/30/26 holiday|Visitor',
        '9/29/26|Tuesday|1:30pm – 4:30pm|Emulsions Wednesday section: class will be held on Friday because of the 9/30/26 holiday|Visitor',
        '10/2/26|Friday||Emulsions Wednesday section: class will be held on Friday because of the 9/30/26 holiday|Visitor',
        '10/6/26|Tuesday|1:30pm – 4:30pm|Final Skills Assessment Arrive at your assigned time|Faculty',
        '10/7/26|Wednesday|1:30pm – 4:30pm|Final Skills Assessment Arrive at your assigned time|Faculty'],'syllabusbridge skills-lab schedule rows');
      assert.equal(lab.preLabType,'class','syllabusbridge: a pre-lab quiz inside a lecture topic is still a class meeting');
      // Word export links: the Monday row's own boxes; the lab row's Topic and Lead boxes belong to the Monday row
      // in Word, so they are not linked to the lab row (an edit there is listed for Word by hand, never misplaced).
      assert.deepEqual([lab.monday?.rowIndex,lab.monday?.columnMap?.date,lab.monday?.columnMap?.topic,lab.monday?.columnMap?.faculty],[1,1,2,3],'syllabusbridge Monday row Word links');
      assert.deepEqual([lab.tuesday?.rowIndex,lab.tuesday?.columnMap?.date,lab.tuesday?.columnMap?.topic,lab.tuesday?.columnMap?.faculty],[2,1,null,null],'syllabusbridge merged lab row Word links');
      // Several dates in one box: two dates with one topic are two meetings of that topic, and a faculty name
      // carries down to later meetings with no faculty of their own (as SyllabusBridge always did).
      const shared=await page.evaluate(async()=>{
        const p=t=>`<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`,tc=c=>'<w:tc>'+[].concat(c).map(p).join('')+'</w:tc>';
        const rows=[['Date','Topic','Faculty'],[['9/21/26','9/22/26'],['Introduction','Practice'],'Mentor'],['9/23/26','Discussion',''],[['9/28/26','9/29/26'],'Shared topic','Faculty'],['9/30/26','Wrap up','']];
        const xml=`<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${p('PHA9999 - Synthetic Course')}${p('Fall 2026')}${p('COURSE COORDINATOR: Ada Faculty, PharmD')}${p('Email: afaculty@university.edu')}${p('COURSE FACULTY:')}${p('Ben Mentor, Ph.D.')}${p('Email: bmentor@university.edu')}${p('Course Schedule')}<w:tbl>${rows.map(r=>'<w:tr>'+r.map(tc).join('')+'</w:tr>').join('')}</w:tbl></w:body></w:document>`;
        const z=new JSZip();z.file('word/document.xml',xml);
        await parseDocx(new File([await z.generateAsync({type:'uint8array'})],'synthetic-shared-topic.docx'));
        return state.schedule.map(e=>`${e.date}|${e.topic}|${e.faculty}`);
      });
      assert.deepEqual(shared,['9/21/26|Introduction|Mentor','9/22/26|Practice|Mentor','9/23/26|Discussion|Mentor','9/28/26|Shared topic|Faculty','9/29/26|Shared topic|Faculty','9/30/26|Wrap up|Faculty'],'syllabusbridge keeps every date of a shared-topic row and carries faculty down');
    }
    if(tool.id==='questionbridge') {
      for (const step of ['review','validate','export']) {
        assert.equal(await page.locator(`[data-screen="${step}"]`).isDisabled(),true);
        await page.evaluate(id=>show(id),step);
        assert.equal(await page.locator('#upload').isVisible(),true);
      }
      await page.locator('#fileInput').setInputFiles({name:'empty.txt',mimeType:'text/plain',buffer:Buffer.from('')});
      await page.waitForFunction(()=>document.getElementById('parseStatus').textContent.includes('could not read'));
      assert.equal(await page.locator('[data-screen="review"]').isDisabled(),true);
      await page.locator('[data-screen="upload"]').click();
      await page.locator('#pasteText').fill('1. Which molecule transports oxygen?\nA. Hemoglobin *\nB. Glycogen\nC. DNA\nD. ATP');
      await page.locator('#parsePaste').click();
      assert.equal(await page.evaluate(()=>state.questions.length),1);
      assert.ok(await page.locator('#stem').inputValue());
      for (const step of ['review','validate','export']) {
        assert.equal(await page.locator(`[data-screen="${step}"]`).isDisabled(),false);
        await page.locator(`[data-screen="${step}"]`).click();
        assert.equal(await page.locator(`#${step}`).isVisible(),true);
      }
      await page.reload();
      assert.equal(await page.locator('[data-screen="review"]').isDisabled(),false);
      await page.locator('[data-screen="review"]').click();
      await page.locator('#deleteQuestion').click();
      await page.locator('dialog.ft-dialog[open] [data-ft-dialog-action="confirm"]').click();
      assert.equal(await page.locator('#upload').isVisible(),true);
      for (const step of ['review','validate','export']) assert.equal(await page.locator(`[data-screen="${step}"]`).isDisabled(),true);
      await page.locator('#fileInput').setInputFiles({name:'questions.txt',mimeType:'text/plain',buffer:Buffer.from('1. Synthetic question?\nA. Yes *\nB. No')});
      await page.waitForFunction(()=>document.getElementById('review').classList.contains('is-active'));
      assert.equal(await page.locator('[data-screen="export"]').isDisabled(),false);
      await page.locator('[data-screen="upload"]').click();
      await page.locator('#startNew').click();
      await page.locator('dialog.ft-dialog[open] [data-ft-dialog-action="confirm"]').click();
      for (const step of ['review','validate','export']) assert.equal(await page.locator(`[data-screen="${step}"]`).isDisabled(),true);
      await page.locator('[data-screen="upload"]').focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('#themeBtn').evaluate(el=>el===document.activeElement),true);
      await page.locator('[data-screen="upload"]').focus();
    }
    if(tool.id==='exambridge') {
      await page.locator('#fileInput').setInputFiles({name:'invalid.doc',mimeType:'application/msword',buffer:Buffer.from('invalid export')});
      await page.waitForFunction(()=>document.getElementById('uploadError').textContent.includes('RTF'));
      assert.ok((await page.locator('#uploadError').textContent()).includes('ExamSoft'));
      // Report customization uses synthetic question findings, with no real exam data.
      await page.evaluate(()=>{
        const qa=window.__ExamBridgeQA;
        const text='Course Name: PHA9999 Synthetic\n# of Questions: 2\nQuestion #: 1\nQuestion Type: Multiple Choice\nQuestion #: 2\nQuestion Type: Multiple Choice';
        const exam=qa.evaluateExam(qa.parseExam(text,'synthetic-exam.doc'));
        exam.questions.forEach((q,i)=>{q.stem='Synthetic question '+(i+1);q.tags.faculty=[{name:i?'Dr. Beta':'Dr. Alpha'}];q.findings=[{kind:'rationale',level:'review',text:'Synthetic rationale finding '+(i+1)},{kind:'options',level:'action',text:'Synthetic options finding '+(i+1)}];q.status='action';});
        qa.getState().exam=exam;document.getElementById('uploadView').classList.add('eb-hidden');document.getElementById('resultsView').classList.remove('eb-hidden');window.print=()=>{};
      });
      await page.locator('#printBtn').click();
      assert.ok(await page.locator('[data-report-finding]:checked').count());
      await page.locator('#reportClearAllBtn').click();assert.equal(await page.locator('[data-report-finding]:checked').count(),0);
      await page.locator('[data-report-finding="rationale"]').check();
      await page.locator('#reportFaculty').selectOption('Dr. Alpha');
      assert.equal(await page.locator('[data-report-finding="rationale"]').isChecked(),true);
      await page.locator('#generateReportBtn').click();
      const selected=await page.locator('#reportOutput').textContent();
      assert.ok(selected.includes('Selected findings only'));assert.ok(selected.includes('Synthetic rationale finding 1'));
      assert.ok(!selected.includes('Synthetic options finding'));assert.ok(!selected.includes('Synthetic rationale finding 2'));
      const summary=await page.locator('.eb-report-summary strong').allTextContents();assert.deepEqual(summary,['0','1','0','0']);
      const selectedRows=await page.locator('.eb-report-table tbody tr').count();
      await page.locator('#printBtn').click();await page.locator('#reportClearAllBtn').click();await page.locator('[data-report-finding="rationale"]').check();
      await page.locator('#reportIncludePassed').check();await page.locator('#generateReportBtn').click();
      assert.ok(await page.locator('.eb-report-table tbody tr').count()>selectedRows);
      assert.ok((await page.locator('#reportOutput').textContent()).includes('Passed checks are included'));
      await page.locator('#printBtn').click();await page.locator('#reportSelectAllBtn').click();
      assert.equal(await page.locator('[data-report-finding]:not(:checked)').count(),0);
      await page.screenshot({path:path.join(output,`exambridge-${format}-report-options.png`),fullPage:true,animations:'disabled'});
      await page.locator('#generateReportBtn').click();assert.ok((await page.locator('#reportOutput').textContent()).includes('All applicable findings'));
      // Empty selection must disclose that findings were omitted, rather than implying a clean exam.
      await page.locator('#printBtn').click();await page.locator('#reportClearAllBtn').click();await page.locator('#generateReportBtn').click();
      assert.ok((await page.locator('#reportOutput').textContent()).includes('None selected'));
    }
    // Keyboard navigation remains usable after the smoke workflow.

    await page.keyboard.press('Tab');
    const focus=await page.evaluate(()=>{const e=document.activeElement,c=getComputedStyle(e);return {tag:e.tagName,outline:c.outlineStyle,shadow:c.boxShadow};});
    assert.notEqual(focus.tag,'BODY');
    assert.ok(focus.outline!=='none'||focus.shadow!=='none',`${tool.id} visible keyboard focus`);
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(output,`${tool.id}-${format}-mobile.png`),fullPage:true,animations:'disabled'});
    assert.deepEqual(errors,[],`${tool.id} ${format} interactions: ${errors.join('; ')}`);
    results.push({tool:tool.id,format,status:'passed'});console.log(`PASS ${tool.name} ${format}`);
    await context.close();
  }
  // Browsers with storage blocked (strict privacy settings, managed computers, embedded previews) must still
  // start every tool. The shared runtime substitutes temporary in-memory storage.
  const uploadButtons={calendarbridge:'#chooseFile',exambridge:'#chooseBtn',gradebridge:'button:has-text("Choose ExamSoft File")',syllabusbridge:'#choose'};
  for(const tool of manifest.tools) {
    const context=await browser.newContext();
    await context.addInitScript(()=>{for(const name of ['localStorage','sessionStorage'])Object.defineProperty(window,name,{configurable:true,get(){throw new DOMException('The operation is insecure.','SecurityError');}});});
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(pathToFileURL(path.join(root,'dist/standalone',`${tool.name}-v${tool.version}-build${manifest.suiteVersion}.html`)).href);
    await page.waitForLoadState('load');
    const theme=page.locator('#themeToggle, #themeBtn, #theme');const before=await page.locator('html').getAttribute('data-ft-theme');
    await theme.first().click();
    assert.notEqual(await page.locator('html').getAttribute('data-ft-theme'),before,`${tool.id} theme toggle with storage blocked`);
    if(uploadButtons[tool.id]) {
      const chooser=page.waitForEvent('filechooser',{timeout:3000});
      await page.locator(uploadButtons[tool.id]).first().click();
      await chooser;
    }
    assert.deepEqual(errors,[],`${tool.id} with storage blocked: ${errors.join('; ')}`);
    console.log(`PASS ${tool.name} storage blocked`);
    await context.close();
  }
  const context=await browser.newContext();const page=await context.newPage();await page.goto(origin);await page.locator('#themeToggle').click();await Promise.all([page.waitForURL('**/GradeBridge/index.html'),page.locator('[data-tool-link="gradebridge"]').click()]);await page.waitForLoadState('load');assert.equal(await page.locator('html').getAttribute('data-ft-theme'),'dark');await context.close();
  fs.writeFileSync(path.join(output,'browser-results.json'),JSON.stringify({results,sharedThemeNavigation:'passed'},null,2)+'\n');
} finally { await browser.close();await new Promise(resolve=>server.close(resolve)); }
