'use strict'; const $=id=>document.getElementById(id); class SyllabusFileError extends Error{constructor(message){super(message);this.name='SyllabusFileError'}}
const clean=s=>String(s||'').replace(/\s+/g,' ').trim(); const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
let state={sourceName:'',lines:[],sections:[],course:{code:'',title:'',year:'',location:''},faculty:[],coordinator:null,clos:[],plos:[],cloMappings:[],meetingPatterns:[],assessments:[],policies:{},schedule:[],grading:[],rawTables:[],structuredTables:[],assignmentTables:[],supplementalTables:[],redText:[],results:[],extraction:{scheduleFailures:[],scheduleCandidates:0,cloCandidates:0},dirty:false,reviewComplete:false,editorBaseline:null,tableMutations:[],editMutations:[],cloEditorIds:[]};
const SECTION_RULES=[
 {key:'description',label:'Course description',patterns:[/course description/i]},
 {key:'clos',label:'Course learning outcomes',patterns:[/course learning (?:outcomes?|objectives?)(?!\s+to\s+program)/i]},
 {key:'coordinator',label:'Course coordinator',patterns:[/^[•▪◦\-\s]*(?:co-)?course coordinators?\b/i]},
 {key:'faculty',label:'Course faculty',patterns:[/course faculty/i]},
 {key:'timeLocation',label:'Time and location',patterns:[/time and location/i,/^time\s*:/i,/^location\s*:/i]},
 {key:'credits',label:'Quarter credit hours',patterns:[/quarter credit (?:hours?|hrs?)/i]},
 {key:'quarter',label:'Quarter',patterns:[/^quarter\s*:/i]},
 {key:'classification',label:'Course classification',patterns:[/course classification/i]},
 {key:'grading',label:'Grading scale',patterns:[/grading scale/i]},
 {key:'materials',label:'Required textbooks and related materials',patterns:[/required textbooks? and related materials/i,/required texbooks? and related materials/i,/^textbooks? and related materials/i]},
 {key:'hardware',label:'Required hardware and software',patterns:[/required hardware and software/i]},
 {key:'accessibility',label:'Accessibility and disability accommodation',patterns:[/accessibility and disability accomm?odations?/i]},
 {key:'plos',label:'Program mapping',patterns:[/program mapping/i,/program student learning outcomes?/i,/program learning outcomes?\s*\(?(?:p|ps)lo\)?/i]},
 {key:'schedule',label:'Course schedule',patterns:[/course presentation and teaching strategies/i,/course calendar/i,/course schedule/i]},
 {key:'engagement',label:'Student engagement',patterns:[/student engagement/i]},
 {key:'programAssessment',label:'Program-wide assessment tools',patterns:[/program-wide assessment tools/i]},
 {key:'assessment',label:'Course evaluation',patterns:[/^course evaluation\s*:?\s*$/i]},
 {key:'coursePolicies',label:'Course specific policies',patterns:[/course specific policies/i]},
 {key:'evaluations',label:'Course and instructor evaluations',patterns:[/course and instructor evaluations/i]},
 {key:'attendance',label:'Attendance/tardy policy',patterns:[/attendance\s*\/\s*tardy policy/i,/class attendance policy/i,/course attendance policy/i]},
 {key:'assessmentPolicy',label:'Assessment policy',patterns:[/^assessment policy/i,/^exam policies?/i]},
 {key:'absence',label:'Absence policy',patterns:[/^(?:excused\s+)?absence policy/i]},
 {key:'incomplete',label:'Incomplete policy',patterns:[/^incomplete(?:\s+grade)?\s+policy/i]},
 {key:'correspondence',label:'Correspondence and emails',patterns:[/^correspondence and emails?/i]},
 {key:'theftPolicy',label:'Theft',patterns:[/^theft\s*:/i]},
 {key:'electronicPolicy',label:'Electronic devices',patterns:[/^electronic devices\s*(?::|$)/i]},
 {key:'copyright',label:'Copyright',patterns:[/^copyright\s*(?::|$)/i]},
 {key:'professionalismPolicy',label:'Professionalism',patterns:[/^professionalism\s*$/i,/^professionalism(?:\s*[-–—].*)?\s*:/i,/^professionalism\s*[-–—]/i]},
 {key:'integrity',label:'Academic honesty and integrity',patterns:[/academic honesty and integrity/i,/academic integrity/i,/honor code/i]}
];
function norm(s){return clean(s).toLowerCase().replace(/[–—−]/g,'-')}
function tableNearSection(rows,key){
 const section=state.sections.find(x=>x.key===key);
 if(!section)return false;
 const next=state.sections.filter(x=>x.index>section.index&&x.key!==key).sort((a,b)=>a.index-b.index)[0];
 const sectionTextValue=sectionText(key);
 const tableText=rows.flat().map(c=>clean(c.text)).filter(Boolean).join(' ');
 if(!tableText||!sectionTextValue)return false;
 const snippets=rows.flat().map(c=>clean(c.text)).filter(x=>x.length>=3);
 const overlap=snippets.filter(x=>sectionTextValue.includes(x) || sectionTextValue.includes(x.slice(0,40))).length;
 return overlap>=Math.min(2,Math.max(1,snippets.length));
}

function lastName(name){const p=clean(name).replace(/,.*$/,'').split(/\s+/).filter(Boolean);return p.at(-1)||''}
function parseLooseDate(s){const c=clean(s);let m=c.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);if(m)return{mo:+m[1],d:+m[2],y:m[3]||''};const months={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,sep:9,sept:9,september:9,oct:10,nov:11,dec:12};m=c.match(/\b(\d{1,2})\s*[-–—]\s*(Jan|Feb|Mar|Apr|May|Jun|June|Jul|July|Aug|Sep|Sept|September|Oct|Nov|Dec)\.?(?:\s*[-–—,]\s*(\d{2,4}))?\b/i);if(m)return{mo:months[m[2].toLowerCase()],d:+m[1],y:m[3]||''};m=c.match(/\b(Jan|January|Feb|February|Mar|March|Apr|April|May|Jun|June|Jul|July|Aug|August|Sep|Sept|September|Oct|October|Nov|November|Dec|December)\.?\s*(?:[-–—]\s*|\s+)(\d{1,2})(?:\s*[-–—,]\s*(\d{2,4}))?\b/i);if(m){const k=m[1].toLowerCase().slice(0,3);return{mo:{jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12}[k],d:+m[2],y:m[3]||''}}return null}
function dayFromDate(s){const d=parseLooseDate(s);if(!d)return'';let y=+(d.y||state.course.year);if(y<100)y+=2000;if(!y)return'';const dt=new Date(y,d.mo-1,d.d);if(dt.getMonth()!==d.mo-1||dt.getDate()!==d.d)return'';return['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dt.getDay()]}
function extractDates(t){const c=clean(t),out=[...c.matchAll(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g)].map(m=>m[0]);for(const m of c.matchAll(/\b\d{1,2}\s*[-–—]\s*(?:Jan|Feb|Mar|Apr|May|Jun|June|Jul|July|Aug|Sep|Sept|September|Oct|Nov|Dec)\.?(?:\s*[-–—,]\s*\d{2,4})?\b/gi))out.push(m[0]);for(const m of c.matchAll(/\b(?:Jan|January|Feb|February|Mar|March|Apr|April|May|Jun|June|Jul|July|Aug|August|Sep|Sept|September|Oct|October|Nov|November|Dec|December)\.?\s*(?:[-–—]\s*|\s+)\d{1,2}(?:\s*[-–—,]\s*\d{2,4})?\b/gi))out.push(m[0]);return [...new Set(out)]}
function normalizeTimeText(t){return clean(t).replace(/(\d{1,2})\s*[:.]\s*(\d)\s+(\d)\b/g,'$1:$2$3').replace(/(\d{1,2})\s*[:.]\s*(\d{2})\b/g,'$1:$2').replace(/\bto\b/gi,'–').replace(/[—−-]/g,'–')}
function extractTime(t){const c=normalizeTimeText(t),m=c.match(/\b\d{1,2}:\d{2}\s*(?:AM|PM)?\s*–\s*\d{1,2}:\d{2}\s*(?:AM|PM)?\b/i);return m?clean(m[0]):''}
function detectSections(lines){const out=[];lines.forEach((line,i)=>{const c=clean(line),colon=c.indexOf(':'),headingLike=c.length<=110||/:$/.test(c)||(colon>=0&&colon<=60);for(const r of SECTION_RULES){if(headingLike&&r.patterns.some(p=>p.test(c))){if(!out.some(x=>x.key===r.key&&x.index===i))out.push({key:r.key,label:r.label,index:i,line:c});break}}});return out}
function sectionText(key){const hits=state.sections.filter(x=>x.key===key);if(!hits.length)return'';const h=hits[0],next=state.sections.filter(x=>x.index>h.index&&x.key!==key&&!/^[•▪◦]/.test(x.line)).sort((a,b)=>a.index-b.index)[0],end=Math.min(next?.index??state.lines.length,h.index+120),arr=state.lines.slice(h.index,end);if(!arr.length)return'';const first=clean(arr[0]),rule=SECTION_RULES.find(r=>r.key===key);if(rule&&rule.patterns.some(p=>p.test(first))){const colon=first.indexOf(':');if(colon>=0&&clean(first.slice(colon+1)))arr[0]=clean(first.slice(colon+1));else arr.shift()}while(arr.length&&rule&&rule.patterns.some(p=>p.test(clean(arr[0]))))arr.shift();return arr.map(clean).filter(Boolean).join('\n')}
function parseMetadata(lines,fileName){let titleLine=lines.find(x=>/^[A-Z]{2,5}\s*\d{3,5}\s*[–-]\s*.+/i.test(x))||lines.find(x=>/^[A-Z]{2,5}\s*\d{3,5}\s+.+/i.test(x))||'';const tm=titleLine.match(/^([A-Z]{2,5}\s*\d{3,5})\s*(?:[–-]\s*)?(.+)$/i),code=tm?tm[1].replace(/\s/g,'').toUpperCase():'',title=tm?clean(tm[2].replace(/School of Pharmacy.*$/i,'')):'';const safe=String(fileName).replace(/Class\s+of\s+20\d{2}/ig,''),filenameYear=(safe.match(/(?:^|\D)(20\d{2})(?:\D|$)/)||[])[1],head=lines.slice(0,140).join('\n'),headerYear=(head.match(/Quarter\s*\d+[^\n]{0,25}\b(20\d{2})\b/i)||head.match(/Course Syllabus[^\n]{0,35}\b(20\d{2})\b/i)||[])[1],year=headerYear||filenameYear||new Date().getFullYear().toString();let location='';for(const l0 of lines.slice(0,180)){const l=clean(l0),m=l.match(/^LOCATION\s*:\s*(.+)$/i);if(m&&clean(m[1])){location=clean(m[1]).replace(/Room\s*#\s*/i,'Room ');break}}if(!location){const tl=lines.findIndex(x=>/^TIME AND LOCATION\s*:/i.test(clean(x)));if(tl>=0){for(let i=tl;i<=Math.min(lines.length-1,tl+12);i++){const l=clean(lines[i]).replace(/\bR\s+oom\b/ig,'Room');let m=l.match(/^TIME AND LOCATION\s*:\s*(.+)$/i);if(m&&clean(m[1])&&!/^(lectures?|mon|tue|wed|thu|fri)/i.test(clean(m[1]))){const room=clean(m[1]).match(/\b(Room\s*#?\s*\d+|Classroom\s*\d+|SAV\s*\d+|Faculty Lounge|\d{3,4})\b/i);if(room){location=clean(room[1]).replace(/Room\s*#\s*/i,'Room ');break}}m=l.match(/^Location\s*:\s*(.+)$/i);if(m&&clean(m[1])){location=clean(m[1]).replace(/Room\s*#\s*/i,'Room ');break}}}}return{code,title,year,location}}
function parseFaculty(lines){const faculty=[],seen=new Set;let section='',coordinator=null;const coordinatorHeading=/^(?:CO-)?COURSE\s+COO(?:RD|DR)INATORS?\s*:\s*/i;const stop=/^(TIME AND LOCATION|TIME\s*:|LOCATION\s*:|BASIC INFORMATION|QUARTER CREDIT|COURSE CLASSIFICATION|GRADING SCALE|REQUIRED TEXTBOOKS)/i;const looksName=c=>/Pharm\.?D|Ph\.?D|B\.?Pharm|M\.?D|RPh|BCPS|MBA|M\.?P\.?H/i.test(c)||/^[A-Z][A-Za-z'’.-]+(?:\s+[A-Z.][A-Za-z'’.-]*){1,4}(?:,\s*.+)?$/.test(c);for(let i=0;i<lines.length;i++){let line=clean(lines[i]);if(coordinatorHeading.test(line))section='coordinator';else if(/^COURSE FACULTY\s*:/i.test(line)||/^Guest Lecturers?\s*:/i.test(line))section='faculty';else if(stop.test(line))section='';if(!section)continue;let candidate=clean(line.replace(coordinatorHeading,'').replace(/^COURSE FACULTY\s*:\s*/i,''));if(!candidate||/^(Office|Phone|Email|Office Hours|Assistant|Associate|Professor|Department|School)/i.test(candidate)||/@/.test(candidate)||!looksName(candidate))continue;let email='';for(let j=i+1;j<=Math.min(lines.length-1,i+7);j++){const next=clean(lines[j]);if(j>i+1&&(looksName(next)||stop.test(next)||/^COURSE /i.test(next)))break;const em=(next.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)||[])[0];if(em){email=em;break}}const key=norm(candidate.replace(/,\s*.+$/,''));if(seen.has(key))continue;const f={name:candidate,email,short:lastName(candidate),role:section};faculty.push(f);seen.add(key);if(section==='coordinator'&&!coordinator)coordinator=f}return{faculty,coordinator}}
function extractNumberedItems(text){return text.split(/\n+/).map(clean).filter(Boolean).map(x=>x.replace(/^[•\-–—]\s*/,''));}
function parseCLOs(){const text=sectionText('clos');if(!text)return[];const items=extractNumberedItems(text).map(x=>x.replace(/[–—−]/g,'-')).filter(x=>/^(?:CL?O\s*-?\s*)?\d+[.)\s:-]/i.test(x)||/^(?:Upon|By the end|Students? will|Demonstrate|Describe|Explain|Apply|Analyze|Identify|Evaluate|Compare|Develop|Recognize|Gain|Understand|Comprehend|Grasp)\b/i.test(x));return [...new Set(items.map(x=>clean(x.replace(/^Course learning (?:outcomes?|objectives?)\s*:?/i,''))).filter(x=>x.length>12))]}
function parsePLOs(){const text=sectionText('plos')+'\n'+state.lines.filter(x=>/\bPLO\s*\d+/i.test(x)).join('\n');const refs=[...text.matchAll(/\bPLO\s*[-:#]?\s*(\d+(?:\.\d+)*)\b/gi)].map(m=>'PLO '+m[1]);return [...new Set(refs)]}
function parseMeetingPatterns(lines,tables=[]){const out=[],dayMap={mon:'Monday',monday:'Monday',tue:'Tuesday',tues:'Tuesday',tuesday:'Tuesday',wed:'Wednesday',wednesday:'Wednesday',thu:'Thursday',thur:'Thursday',thurs:'Thursday',thursday:'Thursday',fri:'Friday',friday:'Friday'};const normalizeDay=x=>dayMap[clean(x).toLowerCase().replace(/[^a-z]/g,'')]||'';const add=(day,time,source)=>{day=normalizeDay(day)||day;time=extractTime(time)||normalizeTimeText(time);if(day&&time&&!out.some(x=>x.day===day&&x.time===time))out.push({day,time,source})};const pairLine=l=>{let n=0;const c=normalizeTimeText(l),D='(Mon(?:day)?|Tue(?:s(?:day)?)?|Wed(?:nesday)?|Thu(?:r(?:s(?:day)?)?)?|Fri(?:day)?)',shared=new RegExp(`\\b${D}\\s*(?:&|and|/)\\s*${D}\\b\\s*[,;:]?\\s*(\\d{1,2}:\\d{2}\\s*(?:AM|PM)?\\s*–\\s*\\d{1,2}:\\d{2}\\s*(?:AM|PM)?)`,'i').exec(c);if(shared){add(shared[1],shared[3],l);add(shared[2],shared[3],l);n+=2}const re=/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Mon|Tue(?:s)?|Wed|Thu(?:rs)?|Fri)\b\s*[,;:]?\s*(\d{1,2}:\d{2}\s*(?:AM|PM)?\s*–\s*\d{1,2}:\d{2}\s*(?:AM|PM)?)/gi;for(const m of c.matchAll(re)){add(m[1],m[2],l);n++}return n};
 for(const rows of tables){let hi=-1,dayCol=-1,timeCol=-1;for(let i=0;i<Math.min(rows.length,4);i++){rows[i].forEach((c,j)=>{const t=norm(c.text);if(/^day$/.test(t))dayCol=j;if(/^time$/.test(t))timeCol=j});if(dayCol>=0&&timeCol>=0){hi=i;break}}if(hi>=0){for(const row of rows.slice(hi+1)){const day=normalizeDay(row[dayCol]?.text||''),time=extractTime(row[timeCol]?.text||'');if(day&&time)add(day,time,'Day/Time table')}if(out.length)return out}}
 const timeHead=lines.findIndex(x=>/^TIME\s*:\s*$/i.test(clean(x)));if(timeHead>=0){for(let i=timeHead+1;i<=Math.min(lines.length-1,timeHead+12);i++){const l=clean(lines[i]);if(/^(QUARTER|COURSE CLASSIFICATION|GRADING SCALE|REQUIRED)/i.test(l))break;if(pairLine(l))continue;const tm=extractTime(l),dm=l.match(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Mon|Tue(?:s)?|Wed|Thu(?:rs)?|Fri)\b/i);if(tm&&dm)add(dm[1],tm,l)}if(out.length)return out}
 const tl=lines.findIndex(x=>/^TIME AND LOCATION\s*:/i.test(clean(x)));if(tl>=0){for(let i=tl;i<=Math.min(lines.length-1,tl+18);i++){const l=clean(lines[i]);if(i>tl&&/^(QUARTER|COURSE CLASSIFICATION|GRADING SCALE|REQUIRED)/i.test(l))break;if(pairLine(l))continue;const tm=extractTime(l),dm=l.match(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Mon|Tue(?:s)?|Wed|Thu(?:rs)?|Fri)\b/i);if(tm&&dm)add(dm[1],tm,l)}}
 return out}
function meetingTimeForDay(day){return state.meetingPatterns?.find(x=>x.day===day)?.time||''}
function parseCLOMappings(tables){const out=[];for(const rows of tables){for(const row of rows){if(row.length<2)continue;const left=clean(row[0]?.text),right=clean(row[1]?.text);const cm=left.match(/\bCL?O\s*[-–—]?\s*(\d+)\b/i);if(!cm||!/(?:PSLO|PLO)/i.test(right))continue;const ps=[...right.matchAll(/(\d+(?:\.\d+)+)/g)].map(m=>m[1]);out.push({clo:'CLO'+cm[1],cloText:left,pslos:[...new Set(ps)],source:right})}}return out}
const GRADE_ITEM_RE=/\b(exams?|quiz(?:zes)?|reinforcement|participation|final|projects?|assignments?|cases?|discussions?|activities?|presentation|homework|paper|lab)\b/i;
function parseGradingTable(tables){for(const rows of tables){if(!rows.length)continue;const head=rows.slice(0,4).flat().map(c=>norm(c.text)).join(' | '),whole=rows.flat().map(c=>clean(c.text)).join(' | '),hasPercent=/\d{1,3}(?:\.\d+)?\s*%/.test(whole),headerMatch=/assessment/.test(head)&&/(% of grade|grade|weight)/.test(head),totalMatch=/\btotal\b/i.test(whole)&&/\b100\s*%?\b/.test(whole),assessmentLike=(whole.match(/\b(exams?|quizzes?|reinforcement|participation|final|projects?|assignments?|cases?|discussions?|activities?|presentation|homework|paper|lab)\b/gi)||[]).length,questionComposition=/questions?\b/i.test(whole)&&!/grade|weight|% of grade|course evaluation/i.test(whole);if(questionComposition)continue;if(!tableNearSection(rows,'assessment')&&!headerMatch)continue;if(!headerMatch&&!(totalMatch&&assessmentLike>=2&&hasPercent))continue;const out=[];
 for(const row of rows){if(row.length<2)continue;const left=(row[0]?.lines||[]).map(clean),right=(row[1]?.lines||[]).map(clean);
  if(Math.max(left.length,right.length)>1){let labels=left.filter(x=>{const z=x.replace(/^[•▪◦\-–—]\s*/,'');return GRADE_ITEM_RE.test(z)&&!/^total$/i.test(z)&&!/\bpoint(?:s)? for each class\b/i.test(z)}).map(x=>x.replace(/^[•▪◦\-–—]\s*/,''));let weights=right.map(clean).filter(x=>/^\d{1,3}(?:\.\d+)?\s*%?$/.test(x)&&+x.replace('%','')<=100);if(!labels.length||!weights.length)continue;if(labels.length===weights.length+1&&/^(exams?|quizzes?|assignments?|projects?|activities?)$/i.test(clean(labels[0])))labels=labels.slice(1);else if(!clean(right[0])&&labels.length===weights.length+1)labels=labels.slice(1);const n=Math.min(labels.length,weights.length);for(let i=0;i<n;i++){const pct=+weights[i].replace('%','');const rec={label:labels[i],pct,source:`${labels[i]} | ${weights[i]}`};const k=norm(rec.label)+'|'+rec.pct;if(!out.some(x=>norm(x.label)+'|'+x.pct===k))out.push(rec)}continue}
  const label=clean(row[0]?.text).replace(/^[•▪◦\-–—]\s*/,''),raw=clean(row[1]?.text);if(!label||/^total$/i.test(label)||!GRADE_ITEM_RE.test(label))continue;const nums=[...raw.matchAll(/(\d{1,3}(?:\.\d+)?)\s*%?/g)].map(m=>+m[1]).filter(v=>v<=100);if(nums.length)out.push({label,pct:nums.at(-1),source:row.map(c=>c.text).join(' | ')})}
 if(out.length>=2)return out}return[]}
function parseGrading(){const text=sectionText('assessment'),lines=text?text.split(/\n+/).map(clean).filter(Boolean):[],out=[];for(let i=0;i<lines.length;i++){const line=lines[i];if(!/%/.test(line))continue;const pcts=[...line.matchAll(/(\d{1,3}(?:\.\d+)?)\s*%/g)];if(!pcts.length)continue;const last=pcts.at(-1),pct=+last[1];if(pct>100)continue;let label=clean(line.slice(0,last.index)).replace(/\s*[:\-–]\s*$/,'').replace(/^(and|or)\s+/i,'');if(!label&&i>0)label=clean(lines[i-1]);if(label.length>2&&!/^total$/i.test(label)&&GRADE_ITEM_RE.test(label))out.push({label,pct,source:line})}
 const uniq=[];const seen=new Set;for(const x of out){const k=norm(x.label)+'|'+x.pct;if(!seen.has(k)){seen.add(k);uniq.push(x)}}return uniq}

function gradeType(label){const t=norm(label);if(/\bexam\b|final/.test(t))return'Exam';if(/\bquiz/.test(t))return'Quiz';if(/reinforcement/.test(t))return'Reinforcement';return'Other'}
function assessmentDate(label){
 const t=norm(label);
 const rangeFor=kind=>{const re=new RegExp(`\\b${kind}(?:zes)?\\s*#?\\s*(\\d+)\\s*(?:-|–|—|to)\\s*#?\\s*(\\d+)`,'i'),m=t.match(re);if(!m)return[];const a=+m[1],b=+m[2],out=[];for(let n=Math.min(a,b);n<=Math.max(a,b);n++)out.push(n);return out};
 const singleFor=kind=>{const re=new RegExp(`\\b${kind}(?:zes)?\\s*#?\\s*(\\d+)`,'i'),m=t.match(re);return m?[+m[1]]:[]};
 let nums=rangeFor('quiz');if(!nums.length)nums=singleFor('quiz');
 let kind=nums.length?'quiz':'';
 if(!nums.length){nums=rangeFor('exam');if(!nums.length)nums=singleFor('exam');if(nums.length)kind='exam'}
 let candidates=[];
 if(kind&&nums.length)candidates=state.schedule.filter(e=>nums.some(n=>new RegExp(`\\b${kind}\\s*#?\\s*${n}\\b`,'i').test(norm(e.topic))));
 else if(/comprehensive final|cumulative final|final exam|^final$/.test(t))candidates=state.schedule.filter(e=>/final exam|final comprehensive|comprehensive final|cumulative final/.test(norm(e.topic)));
 else if(/reinforcement/.test(t))candidates=state.schedule.filter(e=>/reinforcement/.test(norm(e.topic)));
 else candidates=state.schedule.filter(e=>{const x=norm(e.topic);return x.includes(t)||t.includes(x)});
 if(/final exam|cumulative final|comprehensive final/.test(t)){const finals=state.schedule.filter(e=>/final exam|final comprehensive|comprehensive final|cumulative final/.test(norm(e.topic)));candidates.push(...finals)}
 return [...new Set(candidates.map(e=>clean(e.date)).filter(Boolean))].join(', ');
}
function sectionTextWithoutStructuredTables(key,types=[]){
 const text=sectionText(key);if(!text)return'';
 const excluded=new Set;
 for(const tbl of state.structuredTables||[]){if(types.length&&!types.includes(tbl.type))continue;for(const row of tbl.rows||[])for(const c of row.cells||[]){const n=norm(c.text);if(n)excluded.add(n);for(const line of c.lines||[]){const ln=norm(line);if(ln)excluded.add(ln)}}for(const h of tbl.headers||[]){const n=norm(h);if(n)excluded.add(n)}}
 return text.split(/\n+/).map(clean).filter(Boolean).filter(line=>!excluded.has(norm(line))).join('\n');
}
function courseEvaluationNarrative(){const text=sectionText('assessment');if(!text)return'';const excluded=new Set;for(const rows of state.rawTables||[]){if(!tableNearSection(rows,'assessment'))continue;for(const c of rows.flat()){for(const line of (c.lines||[])){const n=norm(line);if(n)excluded.add(n)}const n=norm(c.text);if(n)excluded.add(n)}}const gradeLabels=new Set((state.grading||[]).flatMap(g=>[norm(g.label),norm(g.source||'')]).filter(Boolean));const lines=text.split(/\n+/).map(clean).filter(Boolean),out=[];for(const line of lines){const n=norm(line);if(/^examination policies?\s*:/.test(n))break;if(excluded.has(n)||gradeLabels.has(n))continue;if(/^assessment$|^% of grade$|^weight$|^total$/.test(n))continue;if(/^\d+(?:\.\d+)?\s*%$/.test(line)||/^100%$/.test(line))continue;if(/^(exam\s*\d+|quiz(?:zes)?(?:\s*\d+|\s*\d+\s*-\s*\d+)?|reinforcement activities?|participation points?|comprehensive final exam|final cumulative exam|final exam|final)\s*$/i.test(line))continue;if(/^(exam\s*\d+|quiz|reinforcement|participation|final|case studies?|class discussion).*\d+(?:\.\d+)?\s*%$/i.test(line))continue;out.push(line)}return out.join('\n')}
function enrichGrading(){state.grading=(state.grading||[]).map(g=>({...g,type:g.type||gradeType(g.label),date:g.date||assessmentDate(g.label)}))}
function parseAssessments(){const out=[];for(const g of state.grading){if(/exam|quiz|assignment|project|presentation|activity|participation|homework|assessment|case|paper|final/i.test(g.label))out.push({...g})}for(const l of state.lines){const m=l.match(/^(.{3,60}?(?:Exam|Quiz|Assignment|Project|Presentation|Activity|Case|Paper|Final).{0,30}?)\s+(\d{1,3}(?:\.\d+)?)\s*%/i);if(m)out.push({label:clean(m[1]),pct:+m[2],source:l})}const seen=new Set;return out.filter(x=>{const k=norm(x.label)+'|'+x.pct;if(seen.has(k))return false;seen.add(k);return true})}
function semanticIncompletePolicy(lines){const start=lines.findIndex(x=>/\bIncompletes? are given at the discretion|\bIncomplete grades? must be cleared|\bTo receive an incomplete\b/i.test(clean(x)));if(start<0)return'';const out=[];for(let i=start;i<Math.min(lines.length,start+14);i++){const l=clean(lines[i]);if(i>start&&/^[A-Z][A-Z \/&-]{4,}(?::|$)/.test(l)&&!/INCOMPLETE/i.test(l))break;out.push(l)}const text=out.join('\n');const markers=[/incomplete/i,/course requirements/i,/(?:one-half|50%)/i,/(?:14 consecutive calendar days|end of session|end of class)/i];return markers.filter(r=>r.test(text)).length>=2?text:''}
function semanticAbsencePolicy(lines){const start=lines.findIndex(x=>/^ABSENCE POLICY\b/i.test(clean(x))||/unable to attend a scheduled exam\/graded assessment/i.test(clean(x))||/excused absence/i.test(clean(x)));if(start<0)return'';const out=[];for(let i=start;i<Math.min(lines.length,start+34);i++){const l=clean(lines[i]);if(i>start&&/^[A-Z][A-Z \/&-]{4,}(?::|$)/.test(l)&&!/ABSENCE/i.test(l))break;out.push(l)}const text=out.join('\n');const markers=[/absence/i,/(?:exam|graded assessment)/i,/(?:notify|notification)/i,/(?:excused|unexcused)/i];return markers.filter(r=>r.test(text)).length>=2?text:''}
function semanticAttendancePolicy(lines){const start=lines.findIndex(x=>/^ATTENDANCE(?:\/TARDY)? POLICY\b/i.test(clean(x))||/^COURSE ATTENDANCE POLICY\b/i.test(clean(x)));if(start<0)return'';const out=[];for(let i=start;i<Math.min(lines.length,start+34);i++){const l=clean(lines[i]);if(i>start&&/^[A-Z][A-Z0-9 \/&()\-–—]{4,}:?$/.test(l)&&!/ATTENDANCE|TARDY/i.test(l))break;out.push(l)}const text=out.join('\n');const markers=[/attendance/i,/(?:class|scheduled|student)/i,/(?:absen|tardy|punctual|arrive)/i];return markers.filter(r=>r.test(text)).length>=2?text:''}

function parsePolicies(){return{
 description:sectionText('description'),accessibility:sectionText('accessibility'),
 materials:sectionText('materials'),hardware:sectionText('hardware'),engagement:sectionText('engagement'),
 programAssessment:sectionText('programAssessment'),coursePolicies:sectionTextWithoutStructuredTables('coursePolicies',['studentTeams']),
 evaluations:sectionText('evaluations'),attendance:sectionText('attendance')||semanticAttendancePolicy(state.lines),
 assessmentPolicy:sectionText('assessmentPolicy'),absence:sectionText('absence')||semanticAbsencePolicy(state.lines),
 incomplete:sectionText('incomplete')||semanticIncompletePolicy(state.lines),integrity:sectionText('integrity'),
 theftPolicy:sectionText('theftPolicy'),electronicPolicy:sectionText('electronicPolicy'),professionalismPolicy:sectionText('professionalismPolicy')
}}

function classifyStructuredTable(rows,index){
 const header=(rows[0]||[]).map(c=>clean(c.text));
 const head=norm(header.join(' | '));
 let type='generic';
 if(/grade category/.test(head)&&/(assignment|due date)/.test(head))type='assignmentSchedule';
 else if(/course learning/.test(head)&&/(pslo|program student learning)/.test(head))type='cloMapping';
 else if(/% grade/.test(head)&&/gpa/.test(head))type='gradingScale';
 else if((header.filter(h=>/due date/i.test(h)).length>=2&&header.filter(h=>/^topic$/i.test(clean(h))).length>=2)||(/due date\s*\|\s*topic\s*\|\s*due date\s*\|\s*topic/i.test(head)))type='dueDateTopic';
 else if(/student teams?/.test(head))type='studentTeams';
 else if(/^component\s*\|\s*points?$/.test(head)||(/component/.test(head)&&/points?/.test(head)))type='rubric';
 else if(/assessment/.test(head)&&/(grade|weight|%)/.test(head))type='gradeBreakdown';
 else if(likelySchedule(rows))type='courseSchedule';
 const normalizedRows=rows.slice(1).map((row,ri)=>({
   rowIndex:ri+1,
   cells:row.map((c,ci)=>({columnIndex:ci,text:clean(c.text),lines:(c.lines||[]).map(clean)}))
 }));
 return {tableIndex:index,type,headers:header,rows:normalizedRows};
}
function parseAssignmentTables(tables){
 const out=[];
 tables.forEach((rows,ti)=>{
  const meta=classifyStructuredTable(rows,ti);
  if(meta.type!=='assignmentSchedule')return;
  const entries=[];
  for(const r of meta.rows){
   const category=clean(r.cells[0]?.text),detailCell=r.cells[1];
   if(!category&&!clean(detailCell?.text))continue;
   const items=(detailCell?.lines||[]).map(clean).filter(Boolean);
   entries.push({category,items:items.length?items:(clean(detailCell?.text)?[clean(detailCell.text)]:[]),sourceTableIndex:ti,sourceRowIndex:r.rowIndex});
  }
  out.push({...meta,entries});
 });
 return out;
}
function parseSupplementalTables(tables){
 const keep=new Set(['rubric','dueDateTopic','studentTeams']);
 const out=[];
 tables.forEach((rows,ti)=>{
   const meta=classifyStructuredTable(rows,ti);
   if(!keep.has(meta.type))return;
   const dataRows=meta.rows.filter(r=>r.cells.some(c=>clean(c.text)));
   if(!dataRows.length)return;
   out.push({...meta,rows:dataRows});
 });
 return out;
}

// A date cell that says the date is not set yet ("TBD").
const DATE_PLACEHOLDER=/^(?:TBD|TBA|to be (?:determined|announced))\.?$/i;
function likelySchedule(rows){const head=rows.slice(0,3).flat().map(c=>norm(c.text)).join(' | '),structure=/(topic|lecture|course topics?)/.test(head)&&/(date|day|week|time frame|time|faculty|instructor)/.test(head);if(!structure)return false;return scheduleTableProfile(rows).count>=2}

function scheduleTableProfile(rows,tableIndex=-1){
 let dateCol=-1,headerIndex=-1;
 const dateHead=/^(?:\(?[a-z]\)?\s*)?(?:date|date\/time)$/i;
 for(let ri=0;ri<Math.min(rows.length,6);ri++){
  rows[ri].forEach((c,i)=>{if(dateHead.test(clean(c.text)))dateCol=i});
  if(dateCol>=0){headerIndex=ri;break}
 }
 const broadDateish=x=>{const c=clean(x);return !!c&&(/\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b/.test(c)||/(?<!:)\b\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?\b(?!:)/.test(c)||/\b(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\.?\s*[-–—/. ]\s*\d{1,2}(?:\s*[-–—,/. ]\s*\d{2,4})?\b/i.test(c)||/\b\d{1,2}\s*[-–—/. ]\s*(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\.?(?:\s*[-–—,/. ]\s*\d{2,4})?\b/i.test(c))};
 if(dateCol<0){
  let best={i:-1,n:0},maxCols=Math.max(0,...rows.map(r=>r.length));
  for(let ci=0;ci<maxCols;ci++){
   let n=0;for(const row of rows.slice(1)){const cell=row[ci],ls=(cell?.lines?.length?cell.lines:[cell?.text||'']).map(clean).filter(Boolean);n+=ls.filter(broadDateish).length}
   if(n>best.n)best={i:ci,n};
  }
  dateCol=best.i;headerIndex=0;
 }
 const entries=[],failures=[];
 if(dateCol<0)return{tableIndex,dateCol,headerIndex,entries,failures,count:0};
 rows.slice(Math.max(0,headerIndex+1)).forEach((row,offset)=>{
  const rowIndex=Math.max(0,headerIndex+1)+offset,cell=row[dateCol];
  let ls=(cell?.lines?.length?cell.lines:[cell?.text||'']).map(clean).filter(Boolean).filter(broadDateish);
  let sourceCol=dateCol;
  if(!ls.length){
    const fallback=[];
    row.forEach((c,ci)=>{for(const raw of (c?.lines?.length?c.lines:[c?.text||'']).map(clean).filter(Boolean)){if(broadDateish(raw))fallback.push({raw,ci})}});
    if(fallback.length){ls=[...new Set(fallback.map(x=>x.raw))];sourceCol=fallback[0].ci}
  }
  // A "TBD" date on a row that has other content is an event still to be dated, not an unreadable date.
  if(!ls.length&&DATE_PLACEHOLDER.test(clean(cell?.text))&&row.some((c,ci)=>ci!==dateCol&&clean(c?.text))){entries.push({tableIndex,rowIndex:rowIndex+1,lineIndex:1,columnIndex:dateCol,raw:clean(cell.text),parsedCount:0,placeholder:true});return}
  ls.forEach((raw,lineIndex)=>{const parsed=extractDates(raw),entry={tableIndex,rowIndex:rowIndex+1,lineIndex:lineIndex+1,columnIndex:sourceCol,raw,parsedCount:parsed.length};entries.push(entry);if(!parsed.length)failures.push(entry)});
 });
 return{tableIndex,dateCol,headerIndex,entries,failures,count:entries.length};
}
function countScheduleCandidates(rows,tableIndex=-1){return scheduleTableProfile(rows,tableIndex).count}
function parseScheduleTable(rows,tableIndex=-1){
 const events=[];let headerIndex=-1,cols={};
 const facultyHeader=t=>/^(?:course\s+)?(?:faculty|instructor|lead\s+instructor|presenter|lecturer|facilitator)s?$/.test(t);
 const readingHeader=t=>/(?:book|reading|chapter|chapters|textbook|medical term)/.test(t);
 for(let ri=0;ri<Math.min(rows.length,5);ri++){
  const row=rows[ri];
  row.forEach((c,i)=>{
   const t=norm(c.text);
   if(/^(?:\(?[a-z]\)?\s*)?(?:date|date\s*\/\s*time|date time)$/.test(t)){cols.date=i;if(/time/.test(t))cols.time=i}
   else if(/^day$|^weekday$/.test(t))cols.day=i;
   else if(/^time$/.test(t))cols.time=i;
   else if(/^#/.test(t)||/^lecture(?: number)?$/.test(t))cols.num=i;
   else if(/^topic$/.test(t)||/course topics?/.test(t))cols.topic=i;
   else if(facultyHeader(t))cols.faculty=i;
   else if(readingHeader(t))cols.reading=i;
  });
  if(cols.date!=null&&cols.topic!=null){headerIndex=ri;break}
 }
 if(headerIndex<0){
  let bestDate={i:-1,n:0},bestDay={i:-1,n:0};const maxCols=Math.max(...rows.map(r=>r.length));
  for(let ci=0;ci<maxCols;ci++){let dn=0,yn=0;for(const row of rows){const txt=row[ci]?.text||'';dn+=extractDates(txt).length;if(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Mon|Tue(?:s)?|Wed|Thu(?:rs)?|Fri)$/i.test(clean(txt)))yn++}if(dn>bestDate.n)bestDate={i:ci,n:dn};if(yn>bestDay.n)bestDay={i:ci,n:yn}}
  if(bestDate.n>=3){
   cols.date=bestDate.i;cols.day=bestDay.n>=3?bestDay.i:Math.max(0,cols.date-1);cols.topic=cols.date+1;
   // Infer faculty from actual faculty-name matches instead of assuming the last column.
   let bestFaculty={i:-1,n:0};
   for(let ci=0;ci<maxCols;ci++){
    if([cols.date,cols.day,cols.topic].includes(ci))continue;
    let n=0;
    for(const row of rows.slice(1)){const text=clean(row[ci]?.text);if(!text)continue;for(const f of state.faculty||[]){const short=norm(f.short||''),name=norm(f.name||'');const t=norm(text);if((short&&t.includes(short))||(name&&t.includes(name))){n++;break}}}
    if(n>bestFaculty.n)bestFaculty={i:ci,n};
   }
   if(bestFaculty.n>0)cols.faculty=bestFaculty.i;
   headerIndex=0;
  }else return events
 }
 const splitMerged=line=>{const parts=clean(line).split(/(?<=[a-z)])(?=[A-Z]{2,}\b)/).map(clean).filter(Boolean);return parts.length>1?parts:[clean(line)]};let carryFaculty='';
 const scheduleDataRows=rows.slice(headerIndex+1);for(let rowOffset=0;rowOffset<scheduleDataRows.length;rowOffset++){const cells=scheduleDataRows[rowOffset],sourceRowIndex=headerIndex+1+rowOffset;
  let dc=cells[cols.date];let dateLines=dc?(dc.lines?.length?dc.lines:[dc.text]).flatMap(x=>extractDates(x)):[];
  if(!dateLines.length){dateLines=cells.flatMap(c=>(c.lines?.length?c.lines:[c.text]).flatMap(x=>extractDates(x)));if(dateLines.length&&!dc)dc={text:dateLines.join(' '),lines:dateLines}}
  // Keep a "TBD" row (for example the final exam) with its placeholder date; the editor marks it for a real date.
  if(!dateLines.length&&dc&&DATE_PLACEHOLDER.test(clean(dc.text))&&cells.some((c,ci)=>ci!==cols.date&&clean(c.text)))dateLines=[clean(dc.text)];
  if(!dateLines.length)continue;
  let topicLines=(cells[cols.topic]?.lines||[]).flatMap(splitMerged).map(clean).filter(Boolean);
  if(!topicLines.length&&cells[cols.topic]?.text)topicLines=[clean(cells[cols.topic].text)];
  if(!topicLines.length){let fallback=clean(cells.map(c=>c.text).join(' '));for(const d of dateLines)fallback=fallback.replace(d,'');fallback=fallback.replace(/^\s*\d+\s+/,'').replace(/^\s*(?:M|T|W|Th|F|Mon|Tue|Wed|Thu|Fri|Monday|Tuesday|Wednesday|Thursday|Friday)\b\s*/i,'');topicLines=[clean(fallback)]}
  const timeLines=cols.time!=null?(cells[cols.time]?.lines||[]).map(clean).filter(Boolean):[];
  const facultyLines=cols.faculty!=null?(cells[cols.faculty]?.lines||[]).map(clean).filter(Boolean):[];
  if(facultyLines.length)carryFaculty=clean(facultyLines.join(' ')).replace(/\s+/g,' ');
  let fi=0;
  for(let i=0;i<dateLines.length;i++){
   const date=dateLines[i],printedDay=clean((cells[cols.day]?.lines||[])[i]||cells[cols.day]?.text||'')||(dateLines.length===1?namedDay(dc?.text||''):namedDay((dc?.lines||[]).find(l=>extractDates(l).includes(date))||'')),day=/^(Monday|Tuesday|Wednesday|Thursday|Friday|Mon|Tue(?:s)?|Wed|Thu(?:rs)?|Fri)$/i.test(printedDay)?({'monday':'Monday','mon':'Monday','tuesday':'Tuesday','tue':'Tuesday','tues':'Tuesday','wednesday':'Wednesday','wed':'Wednesday','thursday':'Thursday','thu':'Thursday','thurs':'Thursday','friday':'Friday','fri':'Friday'}[printedDay.toLowerCase()]||dayFromDate(date)):dayFromDate(date),topic=topicLines[i]||topicLines[Math.min(i,topicLines.length-1)]||'',nonTeaching=/\b(exam|quiz|final|holiday|veteran.?s day|no class|reinforcement|in[- ]class activit)/i.test(topic);
   let explicitTime='';
   if(timeLines.length)explicitTime=extractTime(timeLines[i]||'')||extractTime(timeLines[Math.min(i,timeLines.length-1)]||'');
   if(!explicitTime&&cols.time!=null)explicitTime=extractTime(cells[cols.time]?.text||'');
   const fac=nonTeaching?'':(facultyLines[fi++]||carryFaculty||'');
   events.push({date,day,time:explicitTime||meetingTimeForDay(day),topic,faculty:fac,raw:cells.map(c=>c.text).join(' | '),source:{tableIndex,rowIndex:sourceRowIndex,lineIndex:i,columnMap:{date:cols.date,day:cols.day,time:cols.time,topic:cols.topic,faculty:cols.faculty}}})
  }
 }
 return events
}
async function parseDocx(file){if(!window.JSZip)throw new Error('The built-in Word parser could not start. Reload SyllabusBridge and try again.');let zip;try{zip=await JSZip.loadAsync(file)}catch(e){throw new SyllabusFileError('This file could not be opened as a Word document. It may be damaged or saved in the older .doc format. Open it in Word and use Save As → .docx, then try again.')}let xml=await zip.file('word/document.xml')?.async('string');if(!xml)throw new SyllabusFileError('This Word file does not contain a readable document body.');const doc=new DOMParser().parseFromString(xml,'application/xml'),NS='http://schemas.openxmlformats.org/wordprocessingml/2006/main';let numDoc=null;const numXml=await zip.file('word/numbering.xml')?.async('string');if(numXml)numDoc=new DOMParser().parseFromString(numXml,'application/xml');const numDefs=new Map,numToAbs=new Map,counters=new Map;const attr=(n,name)=>n?.getAttributeNS(NS,name)||'';if(numDoc){for(const abs of [...numDoc.getElementsByTagNameNS(NS,'abstractNum')]){const aid=attr(abs,'abstractNumId'),levels={};for(const lvl of [...abs.getElementsByTagNameNS(NS,'lvl')]){const ilvl=+(attr(lvl,'ilvl')||0),fmt=attr(lvl.getElementsByTagNameNS(NS,'numFmt')[0],'val')||'decimal',txt=attr(lvl.getElementsByTagNameNS(NS,'lvlText')[0],'val')||'%1.';levels[ilvl]={fmt,txt}}numDefs.set(aid,levels)}for(const n of [...numDoc.getElementsByTagNameNS(NS,'num')]){const id=attr(n,'numId'),abs=attr(n.getElementsByTagNameNS(NS,'abstractNumId')[0],'val');numToAbs.set(id,abs)}}const alpha=n=>{let x='',v=n;while(v>0){v--;x=String.fromCharCode(97+v%26)+x;v=Math.floor(v/26)}return x};const roman=n=>{const vals=[[1000,'m'],[900,'cm'],[500,'d'],[400,'cd'],[100,'c'],[90,'xc'],[50,'l'],[40,'xl'],[10,'x'],[9,'ix'],[5,'v'],[4,'iv'],[1,'i']];let r='',v=n;for(const [a,b] of vals)while(v>=a){r+=b;v-=a}return r};const listPrefix=p=>{const numPr=p.getElementsByTagNameNS(NS,'numPr')[0];if(!numPr)return'';const numId=attr(numPr.getElementsByTagNameNS(NS,'numId')[0],'val'),ilvl=+(attr(numPr.getElementsByTagNameNS(NS,'ilvl')[0],'val')||0),def=numDefs.get(numToAbs.get(numId))?.[ilvl];if(!def)return'• ';if(def.fmt==='bullet')return'• ';const key=numId+':'+ilvl,n=(counters.get(key)||0)+1;counters.set(key,n);for(const k of [...counters.keys()]){const [nid,lev]=k.split(':');if(nid===numId&&+lev>ilvl)counters.delete(k)}let val=def.fmt==='lowerLetter'?alpha(n):def.fmt==='upperLetter'?alpha(n).toUpperCase():def.fmt==='lowerRoman'?roman(n):def.fmt==='upperRoman'?roman(n).toUpperCase():String(n);let pre=def.txt.replace(/%\d+/g,val);return pre+' '};const nodeText=n=>[...n.getElementsByTagNameNS(NS,'t')].map(x=>x.textContent).join('');const paragraphText=p=>clean(listPrefix(p)+nodeText(p));const cellLines=tc=>{const out=[];for(const p of [...tc.children].filter(x=>x.localName==='p')){let b='';const pieces=[];const walk=n=>{for(const ch of n.childNodes){if(ch.localName==='t')b+=ch.textContent||'';else if(ch.localName==='br'||ch.localName==='cr'){pieces.push(clean(b));b=''}else walk(ch)}};walk(p);pieces.push(clean(b));const pre=listPrefix(p);if(pieces.length){pieces[0]=clean(pre+pieces[0]);out.push(...pieces)}else out.push(clean(pre))}return out};const redText=[];for(const run of [...doc.getElementsByTagNameNS(NS,'r')]){const color=run.getElementsByTagNameNS(NS,'color')[0]?.getAttributeNS(NS,'val')||'';if(/^FF0000$/i.test(color)){const t=clean(nodeText(run));if(t)redText.push(t)}}const body=[...doc.getElementsByTagNameNS(NS,'body')][0],lines=[],tables=[],tableLines=[];for(const ch of body.children){if(ch.localName==='p'){const t=paragraphText(ch);if(t)lines.push(t)}else if(ch.localName==='tbl'){const rows=[];for(const r of [...ch.children].filter(x=>x.localName==='tr')){const cells=[...r.children].filter(x=>x.localName==='tc').map(c=>{const ls=cellLines(c);return{text:clean(ls.join(' ')),lines:ls}});rows.push(cells);for(const c of cells)for(const l of c.lines.filter(Boolean)){tableLines.push(lines.length);lines.push(l)}}tables.push(rows)}}state={sourceName:file.name,lines,tableLineIndexes:tableLines,sections:detectSections(lines),course:parseMetadata(lines,file.name),faculty:[],coordinator:null,clos:[],plos:[],cloMappings:[],meetingPatterns:[],assessments:[],policies:{},schedule:[],grading:[],rawTables:tables,structuredTables:tables.map((rows,i)=>classifyStructuredTable(rows,i)),assignmentTables:parseAssignmentTables(tables),supplementalTables:parseSupplementalTables(tables),redText,results:[],extraction:{scheduleFailures:[],scheduleCandidates:0,cloCandidates:0},dirty:false,reviewComplete:false,editorBaseline:null,tableMutations:[],editMutations:[],cloEditorIds:[]};const pf=parseFaculty(lines);state.faculty=pf.faculty;state.coordinator=pf.coordinator;const cloText=sectionText('clos');state.extraction.cloCandidates=(cloText.match(/\bCL?O\s*[-–—]?\s*\d+/gi)||[]).length;state.clos=parseCLOs();state.cloMappings=parseCLOMappings(tables);state.plos=[...new Set(state.cloMappings.flatMap(x=>x.pslos.map(p=>'PSLO '+p)))];if(!state.plos.length)state.plos=parsePLOs();state.meetingPatterns=parseMeetingPatterns(lines,tables);state.grading=parseGradingTable(tables);if(!state.grading.length)state.grading=parseGrading();state.policies=parsePolicies();state.policies.courseEvaluation=courseEvaluationNarrative();state.policies.courseEvaluationEdited=false;let scheduleCandidates=0,scheduleFailures=[];for(let ti=0;ti<tables.length;ti++){const rows=tables[ti],type=classifyStructuredTable(rows,ti).type;if(type==='courseSchedule'||(type==='generic'&&likelySchedule(rows))){const profile=scheduleTableProfile(rows,ti);scheduleCandidates+=profile.count;scheduleFailures.push(...profile.failures);state.schedule.push(...parseScheduleTable(rows,ti))}}state.schedule=state.schedule.filter((x,i,a)=>a.findIndex(y=>y.date===x.date&&clean(y.time)===clean(x.time)&&norm(y.topic)===norm(x.topic)&&clean(y.faculty)===clean(x.faculty)&&clean(y.raw)===clean(x.raw))===i);state.extraction.scheduleCandidates=scheduleCandidates;state.extraction.scheduleFailures=scheduleFailures;if(!state.meetingPatterns.length){const freq=new Map;for(const e of state.schedule){if(!e.day||!e.time||/exam|quiz|final|no class|holiday|reinforcement/i.test(e.topic))continue;const k=e.day+'|'+e.time;freq.set(k,(freq.get(k)||0)+1)}state.meetingPatterns=[...freq.entries()].filter(([,n])=>n>=2).map(([k])=>{const [day,time]=k.split('|');return{day,time,source:'Derived from recurring schedule rows'}})}enrichGrading();state.assessments=parseAssessments();return state}
function result(id,category,status,title,summary,evidence,action,evaluated=true){return{id,category,status,title,summary,evidence,action,evaluated}}


// Schedule entries in the Word file: each dated line (or "TBD" row) in a schedule
// table. Rows are not counted: one row can hold several dates, and "Week 1"
// heading rows hold none.
function sourceScheduleRowCount(){return state.extraction?.scheduleCandidates||0}
// Full or abbreviated day name written next to a date in the same cell ("Thursday 1/27/27").
function namedDay(t){const m=clean(t).match(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Mon|Tues?|Wed|Thu(?:rs?)?|Fri)\b/i);if(!m)return'';const k=m[1].toLowerCase().slice(0,2);return{mo:'Monday',tu:'Tuesday',we:'Wednesday',th:'Thursday',fr:'Friday'}[k]||''}
// Schedule dates whose printed weekday is wrong, whose year breaks from the dates around them,
// or that go backwards from the row above. A year-flagged date is not used as the reference for later rows.
function scheduleDateWarnings(){const out=[];let ref=null,prev=null;for(const e of state.schedule||[]){const p=parseLooseDate(e.date);if(!p||!isoDate(e.date))continue;let y=+p.y;if(p.y&&y<100)y+=2000;if(!p.y)y=ref?(ref.mo-p.mo>6?ref.y+1:ref.y):(+state.course.year||new Date().getFullYear());const label=clean(e.date),actual=dayFromDate(p.y?e.date:`${p.mo}/${p.d}/${y}`);if(e.day&&actual&&e.day!==actual)out.push(`${e.day} ${label}: that date is a ${actual}`);if(ref&&p.y){const expected=ref.mo-p.mo>6?ref.y+1:ref.y;if(y!==expected){out.push(`${label}: the year ${y} does not match the dates around it (${expected})`);continue}}const t=Date.UTC(y,p.mo-1,p.d);if(prev!==null&&t<prev)out.push(`${label}: earlier than the row above it`);prev=t;ref={y,mo:p.mo}}return out}
function editedScheduleDateProblems(){
 return (state.schedule||[]).map((e,index)=>({e,index,iso:isoDate(e.date)})).filter(x=>!x.iso)
}
function handoffBlockingProblems(){return editedScheduleDateProblems()}
// A required section the Word file lacks (or has without its heading) can be
// written in the structured editor. It counts as found when the faculty member
// added the whole section there, or typed its heading as the first line: Export
// edited Word syllabus then writes it into the Word file with that heading.
function editorSectionHeading(key){
 const pk={assessment:'courseEvaluation'}[key]||key,base=state.editorBaseline?.policies,cur=state.policies?.[pk];
 if(!base||typeof cur!=='string'||!clean(cur)||clean(base[pk])===clean(cur))return false;
 const rule=SECTION_RULES.find(r=>r.key===key),first=clean(cur.split('\n').find(l=>clean(l))||'');
 return !clean(base[pk])||!!rule?.patterns.some(p=>p.test(first))
}
function sectionCoverage(key){
 const inFile=state.sections.some(x=>x.key===key),added=!inFile&&editorSectionHeading(key),heading=inFile||added, text=clean(sectionText(key));
 const ex=state.extraction||{};
 const map={
  description:{count:clean(state.policies.description)?1:0,label:'course description'},
  clos:{count:state.clos.length,label:'CLOs',candidate:ex.cloCandidates},
  coordinator:{count:state.coordinator?1:0,label:'coordinator record'},
  faculty:{count:state.faculty.filter(x=>x.role==='faculty').length,label:'faculty records'},
  timeLocation:{count:(state.course.location||state.meetingPatterns.length)?1:0,label:'location / meeting pattern'},
  credits:{count:text?1:0,label:'credit-hours value'},quarter:{count:text?1:0,label:'quarter value'},classification:{count:text?1:0,label:'classification value'},
  grading:{count:text?1:0,label:'grading scale'},materials:{count:clean(state.policies.materials)?1:0,label:'materials content'},hardware:{count:clean(state.policies.hardware)?1:0,label:'hardware/software content'},
  accessibility:{count:clean(state.policies.accessibility)?1:0,label:'accessibility language'},plos:{count:state.cloMappings.length,label:'CLO→PSLO mappings',candidate:state.clos.length},
  schedule:{count:state.schedule.length,label:'schedule rows',candidate:sourceScheduleRowCount()},
  engagement:{count:clean(state.policies.engagement)?1:0,label:'engagement language'},programAssessment:{count:clean(state.policies.programAssessment)?1:0,label:'assessment-tool content'},
  assessment:{count:(state.grading.length||clean(state.policies.courseEvaluation||courseEvaluationNarrative()))?1:0,label:'course-evaluation content'},
  coursePolicies:{count:clean(state.policies.coursePolicies)?1:0,label:'course-policy content'},evaluations:{count:clean(state.policies.evaluations)?1:0,label:'evaluation language'},
  attendance:{count:clean(state.policies.attendance)?1:0,label:'attendance policy'},assessmentPolicy:{count:clean(state.policies.assessmentPolicy)?1:0,label:'assessment policy'},
  absence:{count:clean(state.policies.absence)?1:0,label:'absence policy'},incomplete:{count:clean(state.policies.incomplete)?1:0,label:'incomplete policy'}
 };
 return {heading,added,...(map[key]||{count:text?1:0,label:'section content'})};
}
function coverageStatus(c){
 if(!c.heading&&c.count===0)return'issue';
 if(!c.heading&&c.count>0)return'warning';
 if(c.heading&&c.count===0)return'warning';
 if(Number.isFinite(c.candidate)&&c.candidate>0&&c.count<c.candidate)return'warning';
 return'passed';
}
// Policy content checks (v2.3). The rules live in a dated policy profile
// (policy/*.js, data only) instead of in this code. When the policy changes, a
// new dated profile is added; the newest one loaded is used, and the report
// names it. Every check says Not evaluated when SyllabusBridge can't tell.
const POLICY_CATEGORY='Policy content';
function policyProfile(){const list=globalThis.SyllabusBridgePolicyProfiles||[];return [...list].sort((a,b)=>String(b.updated||'').localeCompare(String(a.updated||'')))[0]||null}
function policyName(p=policyProfile()){return p?`${p.name}, updated ${p.updated}`:''}
function policyPatterns(patterns){return (patterns||[]).map(p=>{try{return new RegExp(p,'i')}catch(e){return null}}).filter(Boolean)}
function policyMatch(text,patterns){for(const re of policyPatterns(patterns)){const m=re.exec(text);if(m)return m}return null}
// The words around a match, kept within the line it is on.
function policySnippet(text,m){const ls=text.lastIndexOf('\n',m.index)+1,nl=text.indexOf('\n',m.index+m[0].length),le=nl<0?text.length:nl,s=Math.max(ls,m.index-60),e=Math.min(le,m.index+m[0].length+60);return `${s>ls?'…':''}${clean(text.slice(s,e))}${e<le?'…':''}`}
function listWords(items){return items.length<2?items.join(''):`${items.slice(0,-1).join(', ')}${items.length>2?',':''} and ${items.at(-1)}`}
const POLICY_UNCONFIRMED=' Note: this part of the policy profile has not yet been confirmed against the official policy.';
// The syllabus as it stands now: the editor's current text, plus only those
// lines from the Word file that the editor holds no copy of. Text faculty
// deleted or replaced in the editor is never used as evidence.
// Schedule edits change the schedule (state.schedule), not the table it was read from,
// so those table cells are stale copies. A cell the schedule was read from (its date,
// day, time, topic, and faculty columns) is represented by the schedule entry instead,
// and every cell of a row whose schedule entries were all removed is left out.
function scheduleTableCellSkipped(){
 const base=state.editorBaseline?.schedule||[],now=new Set((state.schedule||[]).map(e=>e.source&&`${e.source.tableIndex}:${e.source.rowIndex}`).filter(Boolean)),cells=new Set,rows=new Set;
 for(const e of base){const s=e.source;if(!s||s.tableIndex==null||s.rowIndex==null)continue;const row=`${s.tableIndex}:${s.rowIndex}`;for(const col of Object.values(s.columnMap||{}))if(col!=null)cells.add(`${row}:${col}`);if(!now.has(row))rows.add(row)}
 return(t,r,c)=>rows.has(`${t}:${r}`)||cells.has(`${t}:${r}:${c}`)
}
function editorTextParts(snap,ignore=[]){
 const skip=scheduleTableCellSkipped();
 const tables=(snap.structuredTables||[]).flatMap(t=>[...(t.headers||[]),...(t.rows||[]).flatMap(r=>(r.cells||[]).filter(c=>!skip(t.tableIndex,r.rowIndex,c.columnIndex)).flatMap(c=>[c.text,...(c.lines||[])]))]);
 return [...Object.entries(snap.policies||{}).filter(([k,v])=>typeof v==='string'&&!ignore.includes(k)).map(([,v])=>v),...tables,...(snap.grading||[]).map(g=>g.label),...(snap.schedule||[]).flatMap(e=>[e.topic,e.faculty]),...(snap.clos||[])]
}
// The lines of the Word file a section's editor text was read from: the heading
// line (which can carry text after its colon) up to the next section, as in sectionText().
function sectionLineRange(key){const h=state.sections.find(x=>x.key===key);if(!h)return null;const next=state.sections.filter(x=>x.index>h.index&&x.key!==key&&!/^[•▪◦]/.test(x.line)).sort((a,b)=>a.index-b.index)[0];return[h.index,Math.min(next?.index??state.lines.length,h.index+120)]}
// Word-file lines the editor holds a copy of, found by where they came from, not by
// matching text: every table line (all tables are in the editor), every line of a
// section whose text is in the editor, and the CLO section. A policy read without a
// heading (attendance, absence, incomplete) is matched by its lines' text.
function editorCoveredLines(){
 const covered=new Set(state.tableLineIndexes||[]),b=state.editorBaseline||{},keyFor={courseEvaluation:'assessment'};
 const cover=k=>{const r=sectionLineRange(k);if(r)for(let i=r[0];i<r[1];i++)covered.add(i);return!!r};
 cover('clos');
 const byText=new Set;
 for(const [k,v] of Object.entries(b.policies||{}))if(typeof v==='string'&&clean(v)&&!cover(keyFor[k]||k))for(const l of v.split(/\n+/)){const n=norm(l);if(n)byText.add(n)}
 (state.lines||[]).forEach((l,i)=>{if(byText.has(norm(l)))covered.add(i)});
 return covered
}
function currentSyllabusText(ignore=[]){
 const covered=editorCoveredLines();
 const rest=(state.lines||[]).filter((l,i)=>!covered.has(i));
 return [...rest,...editorTextParts(state,ignore)].map(t=>String(t||'')).filter(t=>clean(t)).join('\n')
}
// Approved wording (v2.3): every sentence of the approved text must appear in the
// syllabus. Capital letters, punctuation, quote marks, and spacing are ignored.
// A {setting} placeholder marks a campus-specific part that may differ.
function wordingKey(t){return String(t||'').toLowerCase().replace(/[’‘]/g,"'").replace(/[^a-z0-9{}]+/g,' ').trim()}
function approvedSentences(text){return String(text||'').split(/(?<=[.!?])\s+/).map(x=>x.trim()).filter(Boolean)}
function approvedWordingResult(check,profile,text,note){
 const id='policy-'+check.id,have=` ${wordingKey(text)} `,sentences=approvedSentences(check.approvedText);
 const esc=x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const found=sentences.filter(sn=>{const parts=wordingKey(sn).split(/\s*\{\w+\}\s*/);return new RegExp(` ${parts.map(esc).join(' .{1,200}? ')}${parts.at(-1)?' ':''}`).test(have)});
 const missing=sentences.filter(sn=>!found.includes(sn)).map(sn=>sn.replace(/\s*\{\w+\}/g,' [campus contact]'));
 let campus='';
 if(check.campusSetting){const v=clean(profile.campus?.[check.campusSetting]);if(!v)campus=' The campus-specific contact is not set in the policy profile, so it was not compared.';else if(have.includes(` ${wordingKey(v)} `))campus=` The campus contact "${v}" is named.`;else missing.push(`the campus contact "${v}"`)}
 const short=x=>x.length>140?x.slice(0,137)+'…':x,status=missing.length?'warning':'passed';
 const summary=missing.length?`${sentences.length-found.length?`${sentences.length-found.length} of ${sentences.length} sentences of the approved wording ${sentences.length-found.length===1?'is':'are'} missing or different`:'The approved wording is present'}${missing.length>sentences.length-found.length?`${sentences.length-found.length?', and':', but'} the campus contact is not named`:''}.`:`Matches the approved wording (${sentences.length} sentences)${campus.includes('is named')?', with the campus contact':''}.`;
 const evidence=`${found.length} of ${sentences.length} approved sentences found.${missing.length?` Missing or different: ${missing.map(x=>`"${short(x)}"`).join(' · ')}.`:''}${campus} Capital letters, punctuation, and spacing are ignored.${note}`;
 return result(id,POLICY_CATEGORY,status,check.title,summary,evidence,missing.length?check.action:'No action needed.')
}
function policyContentResult(check,profile){
 const id='policy-'+check.id,sections=check.sections||[];
 const text=check.searchWholeSyllabus?currentSyllabusText():sections.map(k=>String(state.policies?.[k]||'')).filter(t=>clean(t)).join('\n');
 const note=check.confirmed===false?POLICY_UNCONFIRMED:'';
 const sectionNames=sections.map(k=>SECTION_RULES.find(r=>r.key===k)?.label||k);
 if(!clean(text))return result(id,POLICY_CATEGORY,'not-evaluated',check.title,`${check.title} could not be checked because no ${sectionNames[0]||'section'} text was found.`,`No text was extracted for: ${sectionNames.join(', ')}.${note}`,'Add the section in the structured editor (or check the section heading in the Word file), then revalidate.',false);
 if(check.approvedText)return approvedWordingResult(check,profile,text,note);
 const found=[],missing=[];
 for(const req of check.requirements||[]){const m=policyMatch(text,req.patterns);if(m)found.push(`${req.label} ("${policySnippet(text,m)}")`);else missing.push(req.label)}
 let extra='';
 if(check.campusSetting){const v=clean(profile.campus?.[check.campusSetting]);if(!v)extra=' The campus-specific contact is not set in the policy profile, so it was not compared.';else if(norm(text).includes(norm(v)))found.push(`the campus contact "${v}"`);else missing.push(`the campus contact "${v}"`)}
 if(check.onlyWhen){
  const triggerText=check.onlyWhen.ignoreSections?.length?(check.searchWholeSyllabus?currentSyllabusText(check.onlyWhen.ignoreSections):sections.filter(k=>!check.onlyWhen.ignoreSections.includes(k)).map(k=>String(state.policies?.[k]||'')).join('\n')):text;
  const trigger=policyMatch(triggerText,check.onlyWhen.patterns);
  // No research work found: the requirement does not apply, so the check is Not evaluated
  // (never Passed), whether or not the library is mentioned.
  if(!trigger)return result(id,POLICY_CATEGORY,'not-evaluated',check.title,'No assignment that involves research was detected, so this check does not apply.',`Looked for research-type work (${check.onlyWhen.label}) and found none.${found.length?` Found anyway: ${found.join(' · ')}.`:''}${note}`,'If any assignment does involve research, point students to South University Library resources.',false);
  extra=` Research detected: "${policySnippet(triggerText,trigger)}".`+extra
 }
 const status=missing.length?'warning':'passed';
 const summary=missing.length?`Not found: ${listWords(missing)}.`:`Includes ${listWords((check.requirements||[]).map(r=>r.label))}.`;
 const evidence=`${found.length?`Found: ${found.join(' · ')}.`:'None of the required wording was found.'}${missing.length?` Not found: ${missing.join(' · ')}.`:''}${extra} Checked: ${sectionNames.join(', ')}${check.searchWholeSyllabus?' and the rest of the syllabus':''}.${note}`;
 return result(id,POLICY_CATEGORY,status,check.title,summary,evidence,missing.length?check.action:'No action needed.')
}
// Grading scale: a percent band ("≥90", "76", "65-69", "64 and below") and a GPA.
function parsePercentBand(s){
 const t=clean(s).replace(/≥/g,'>=').replace(/≤/g,'<=').replace(/[–—−]/g,'-').replace(/%/g,'').toLowerCase().trim();let m;
 if((m=t.match(/^(\d{1,3})\s*-\s*(\d{1,3})$/)))return{min:Math.min(+m[1],+m[2]),max:Math.max(+m[1],+m[2])};
 if((m=t.match(/^(?:>=|=>)\s*(\d{1,3})$/)||t.match(/^(\d{1,3})\s*(?:\+|(?:and|or|&)\s*(?:above|higher|greater|over|up))$/)))return{min:+m[1],max:100};
 if((m=t.match(/^(?:<=|=<)\s*(\d{1,3})$/)||t.match(/^(\d{1,3})\s*(?:and|or|&)\s*(?:below|lower|less|under)$/)))return{min:0,max:+m[1]};
 if((m=t.match(/^(?:<|below|less than|under)\s*(\d{1,3})$/)))return{min:0,max:+m[1]-1};
 if((m=t.match(/^(?:>|above|greater than|over)\s*(\d{1,3})$/)))return{min:+m[1]+1,max:100};
 if((m=t.match(/^(\d{1,3})$/)))return{min:+m[1],max:+m[1]};
 return null
}
function parseGpa(s){const m=clean(s).match(/^(\d(?:\.\d{1,2})?)$/);return m&&+m[1]<=4?+m[1]:null}
function percentBandLabel(x){return x.min===x.max?`${x.min}%`:x.max===100?`≥${x.min}%`:x.min===0?`≤${x.max}%`:`${x.min}–${x.max}%`}
// Finds the table whose header has a percent column next to a GPA column (one or
// more side-by-side pairs) and reads its current, possibly edited, rows.
function gradingScaleColumns(t){
  const all=[{cells:(t.headers||[]).map((h,i)=>({columnIndex:i,text:clean(h),lines:[clean(h)]}))},...(t.rows||[])];
  let head=-1,pairs=[];
  for(let i=0;i<Math.min(all.length,3)&&head<0;i++){
   const cells=all[i].cells||[];
   // The nearest column to the left that says % or percent; failing that, one that says grade (not "Letter Grade" when a % column exists).
   pairs=cells.filter(c=>/\bgpa\b|grade point/i.test(c.text)).map(g=>{const left=[...cells].reverse().filter(c=>c.columnIndex<g.columnIndex&&!/\bgpa\b|grade point/i.test(c.text)),p=left.find(c=>/%|percent/i.test(c.text))||left.find(c=>/grade/i.test(c.text)&&!/letter/i.test(c.text));return p?{pct:p.columnIndex,gpa:g.columnIndex}:null}).filter(Boolean);
   if(pairs.length){
    head=i;
    // Further side-by-side pairs whose header cells were left blank.
    for(let c=pairs.at(-1).gpa+1;c+1<cells.length&&!clean(cells[c].text)&&!clean(cells[c+1].text)&&pairs.every(x=>x.gpa===x.pct+1);c+=2)pairs.push({pct:cells[c].columnIndex,gpa:cells[c+1].columnIndex})
   }
  }
  return head<0?null:{all,head,pairs}
}
// Tables the parser left as "generic" but whose header has a percent and a GPA
// column (for example "Percent | GPA") become the editable Grading scale table,
// so Fix this can open them.
function promoteGradingScaleTables(){for(const t of state.structuredTables||[])if(t.type==='generic'&&gradingScaleColumns(t))t.type='gradingScale'}
function gradingScaleRows(){
 for(const t of state.structuredTables||[]){
  const cols=gradingScaleColumns(t);if(!cols)continue;
  const {all,head,pairs}=cols,rows=[];
  for(const row of all.slice(head+1))for(const p of pairs){
   const cellLines=col=>{const c=(row.cells||[]).find(x=>x.columnIndex===col);return(c?.lines?.length?c.lines:[c?.text||'']).map(clean)};
   const pl=cellLines(p.pct),gl=cellLines(p.gpa);
   for(let k=0;k<Math.max(pl.length,gl.length);k++){const a=pl[k]||'',b=gl[k]||'';if(a||b)rows.push({pctText:a,gpaText:b,band:parsePercentBand(a),gpa:parseGpa(b)})}
  }
  return{table:t,rows}
 }
 return null
}
function gradingScaleResult(profile){
 const spec=profile.gradingScale,id='policy-grading-scale',title=spec.title||'Grading scale matches the official scale',note=spec.confirmed===false?POLICY_UNCONFIRMED:'';
 const found=gradingScaleRows();
 if(!found||!found.rows.length)return result(id,POLICY_CATEGORY,'not-evaluated',title,'The grading scale table was not found, so it was not compared with the official scale.',`No table with a percent column and a GPA column was detected.${note}`,'Confirm the syllabus includes the official grading scale table (percent and GPA).',false);
 const gpa=v=>Number(v).toFixed(1),used=new Set,wrong=[],missing=[];
 for(const want of spec.rows||[]){const got=found.rows.find(r=>!used.has(r)&&r.band&&r.band.min===want.min&&r.band.max===want.max);if(!got){missing.push(percentBandLabel(want));continue}used.add(got);if(got.gpa!==null&&Math.abs(got.gpa-want.gpa)>0.001)wrong.push(`${percentBandLabel(want)} shows ${got.gpaText}; the official scale is ${gpa(want.gpa)}`);else if(got.gpa===null)wrong.push(`${percentBandLabel(want)} has no readable GPA ("${got.gpaText||'blank'}"); the official scale is ${gpa(want.gpa)}`)}
 const extra=found.rows.filter(r=>r.band&&!used.has(r)).map(r=>`${r.pctText} = ${r.gpaText||'(blank)'}`),unreadable=found.rows.filter(r=>!r.band).map(r=>`"${r.pctText||'(blank)'}" = ${r.gpaText||'(blank)'}`);
 const status=wrong.length?'issue':(missing.length||extra.length||unreadable.length)?'warning':'passed';
 const problems=wrong.length+missing.length+extra.length+unreadable.length;
 const summary=status==='passed'?`All ${found.rows.length} rows match the official grading scale.`:wrong.length?`${wrong.length} GPA value${wrong.length===1?' differs':'s differ'} from the official grading scale.`:`${problems} row${problems===1?' does':'s do'} not line up with the official grading scale.`;
 const parts=[`Compared ${found.rows.length} row${found.rows.length===1?'':'s'} with the ${(spec.rows||[]).length}-row official scale.`];
 if(wrong.length)parts.push(`Different GPA: ${wrong.join(' · ')}.`);
 if(missing.length)parts.push(`Missing: ${missing.join(', ')}.`);
 if(extra.length)parts.push(`Not on the official scale: ${extra.join(' · ')}.`);
 if(unreadable.length)parts.push(`Could not read: ${unreadable.join(' · ')}.`);
 return result(id,POLICY_CATEGORY,status,title,summary,parts.join(' ')+note,status==='passed'?'No action needed.':found.table.type==='gradingScale'?'Use the official grading scale from the syllabus policy. You can correct the Grading scale table in the structured editor.':'Use the official grading scale from the syllabus policy. Correct the table in the Word syllabus, then upload it again.')
}
// Template placeholders in the syllabus as it stands now, each with where it is:
// the editor field that holds it (with a Fix this target), or nowhere for text only
// the Word file can change (lines outside the editor, and heading labels).
function templatePlaceholders(placeholders){
 const out=[],seen=new Set,card=k=>({anchor:'review-'+k,focus:[`#review-${k} textarea`]});
 const label=k=>k==='courseEvaluation'?'Course evaluation':SECTION_RULES.find(r=>r.key===k)?.label||k;
 const add=(text,where,fixAt)=>{const t=clean(text),m=placeholders.map(p=>t.match(p)).find(Boolean);if(!t||!m)return;const key=t+'|'+where;if(seen.has(key))return;seen.add(key);out.push({text:t,where,fixAt:fixAt&&$(fixAt.anchor)?fixAt:null,match:m[0]})};
 // A section's text can include a table that sits under its heading; such lines are
 // listed once, under the table they came from.
 const tableIdx=new Set(state.tableLineIndexes||[]),tableTextIn=k=>{const r=sectionLineRange(k==='courseEvaluation'?'assessment':k),out=new Set;if(r)for(let i=r[0];i<r[1];i++)if(tableIdx.has(i))out.add(norm(state.lines[i]));return out};
 for(const [k,v] of Object.entries(state.policies||{}))if(typeof v==='string'){const inTables=tableTextIn(k);for(const l of v.split(/\n+/))if(!inTables.has(norm(l)))add(l,label(k),k==='courseEvaluation'?{anchor:'review-assessments',focus:['#courseEvaluationText']}:card(k))}
 for(const t of state.structuredTables||[]){
  const editable=editableStructuredTables().includes(t),title=editable?structuredTableTitle(t.type):'a table',skip=scheduleTableCellSkipped();
  for(const h of t.headers||[])add(h,title,null);
  // The exact box: the row (by its source row or editor row id) and the column.
  const model=editable?structuredDisplayModel(t):null;
  for(const row of t.rows||[]){
   const shown=model?model.rows.indexOf(row):-1,rowId=row.editorRowId||`source-${t.tableIndex}-${row.rowIndex}`;
   for(const c of row.cells||[]){
    if(skip(t.tableIndex,row.rowIndex,c.columnIndex))continue;
    const fixAt=editable&&shown>=0?{anchor:`review-structured-${t.tableIndex}`,focus:[`#review-structured-${t.tableIndex} tr[data-editor-row-id="${rowId}"] textarea[data-col="${c.columnIndex}"]`]}:null;
    for(const l of (c.lines?.length?c.lines:[c.text]))add(l,shown>=0?`${title}, row ${shown+1}`:title,fixAt)
   }
  }
 }
 for(const [f,lab] of [['code','Course code'],['title','Course title'],['year','Year'],['location','Location']])add(state.course?.[f],lab,{anchor:'review-course-info',focus:['#course'+f[0].toUpperCase()+f.slice(1)]});
 (state.clos||[]).forEach((c,i)=>add(c,`Course learning outcomes, ${(c.match(/\bCL?O\s*[-–—]?\s*\d+/i)||[`outcome ${i+1}`])[0]}`,{anchor:'review-clos',focus:[`#review-clos .clo-text@${i}`]}));
 (state.schedule||[]).forEach((e,i)=>{const where=`Course schedule, ${clean(e.date)||`row ${i+1}`}`;add(e.topic,where,{anchor:'review-schedule',focus:[`#scheduleBody .s-topic@${i}`]});add(e.faculty,where,{anchor:'review-schedule',focus:[`#scheduleBody .s-faculty@${i}`]})});
 const covered=editorCoveredLines();
 (state.lines||[]).forEach((l,i)=>{if(!covered.has(i))add(l,'',null)});
 // Heading labels (the words before a colon) stay in the Word file whatever the editor holds.
 for(const h of state.sections||[]){const c=h.line.indexOf(':');add(c>=0?h.line.slice(0,c):h.line,'',null)}
 return out
}
function policyResults(){
 const profile=policyProfile();
 if(!profile)return[result('policy-profile',POLICY_CATEGORY,'not-evaluated','Syllabus policy profile','No syllabus policy profile was loaded, so policy wording was not checked.','The policy profile file is missing from this copy of SyllabusBridge.','Reload SyllabusBridge, or download a fresh copy. If this keeps happening, contact the FacultyBridge project owner.',false)];
 return[gradingScaleResult(profile),...(profile.contentChecks||[]).map(c=>policyContentResult(c,profile))]
}
function validate(){const r=[],hasSection=k=>state.sections.some(x=>x.key===k),allText=state.lines.join('\n');
 const required=[
 ['description','Course description'],['clos','Course learning outcomes'],['coordinator','Course coordinator'],
 ['faculty','Course faculty'],['timeLocation','Time and location'],['credits','Quarter credit hours'],
 ['quarter','Quarter'],['classification','Course classification'],['grading','Grading scale'],
 ['materials','Required textbooks and related materials'],['hardware','Required hardware and software'],
 ['accessibility','Accessibility and disability accommodation'],['plos','CLO → PSLO program mapping'],
 ['schedule','Course schedule / course calendar'],['engagement','Student engagement'],
 ['programAssessment','Program-wide assessment tools'],['assessment','Course evaluation'],
 ['coursePolicies','Course specific policies'],['evaluations','Course and instructor evaluations'],
 ['attendance','Attendance/tardy policy'],['assessmentPolicy','Assessment policy'],
 ['absence','Absence policy'],['incomplete','Incomplete policy']
 ];
 for(const [k,label] of required){const c=sectionCoverage(k),status=coverageStatus(c),hasDen=Number.isFinite(c.candidate)&&c.candidate>0,ratio=hasDen?`${c.count} of ${c.candidate}`:`${c.count}`,summary=status==='passed'&&c.added?`${label} was added in SyllabusBridge.`:status==='passed'?`${label} was detected and usable content was extracted.`:status==='warning'&&!c.heading&&c.count>0?`${label} content was extracted, but the approved-template heading was not detected.`:status==='warning'?`${label} was detected, but extraction was incomplete or empty.`:`${label} was not confidently detected.`,failureDetail=k==='schedule'&&state.extraction?.scheduleFailures?.length?` Unreadable schedule entries: ${state.extraction.scheduleFailures.slice(0,12).map(x=>`table ${x.tableIndex+1}, row ${x.rowIndex}: "${x.raw}"`).join(' · ')}${state.extraction.scheduleFailures.length>12?` · plus ${state.extraction.scheduleFailures.length-12} more`:''}`:'',evidence=`${c.added?'Heading added in SyllabusBridge. It goes into the Word file when you choose “Export edited Word syllabus”':`Heading ${c.heading?'found':'not found'}`} · ${ratio} ${c.label} extracted${hasDen?` (${Math.round(c.count/c.candidate*100)}% coverage)`:''}.${failureDetail}`;r.push(result('section-'+k,'Approved template',status,label,summary,evidence,status==='passed'&&c.added?'Choose “Export edited Word syllabus” to add it to the Word file.':status==='passed'?'No action needed.':status==='issue'?'Restore the required section or confirm the approved template has changed.':'Review the section heading and extracted content before relying on downstream checks.',true))}
 const placeholders=[
  /copy and paste/i,/insert (?:text|course|applicable|additional|additoinal)/i,/identify if ipads? or tablets? are acceptable/i,
  /policy is at the discretion of the course coordinator/i,/list pslo number/i,/replace highlighted sections/i,
  /all items listed in red/i,/example optional course specific policies/i,/course number\s*[-–]\s*course title/i,
  /course number,\s*quarter,\s*year/i,/name,\s*degree/i,/rank and department/i,/room\(s\)\s*&\s*time/i
 ];
 // Read the syllabus as it stands now (edits count) and note where each placeholder is,
 // so Fix this can open it. Heading labels are checked too: only Word can change them.
 const unresolved=templatePlaceholders(placeholders),cleanupAll=unresolved.map(x=>x.text+(x.where?` (in ${x.where})`:'')),cleanup=cleanupAll.slice(0,20),first=unresolved.find(x=>x.fixAt),wordOnly=unresolved.some(x=>!x.fixAt);
 r.push(result('template-cleanup','Template cleanup',cleanupAll.length?'issue':'passed','Template instructions and placeholder text',cleanupAll.length?`${cleanupAll.length} unresolved template instruction or placeholder${cleanupAll.length===1?' was':'s were'} detected${cleanupAll.length>20?' (showing first 20)':''}.`:'No obvious template instructions were detected.',cleanup.length?cleanup.join(' · '):'Checked for unresolved template placeholders and faculty-facing instructional phrases. Text color alone is not treated as a template error.',cleanupAll.length?`Replace course-specific placeholders and remove template-only instructional text before releasing the syllabus.${first?' Fix this opens the first one in the structured editor.':''}${wordOnly?' Anything the structured editor cannot open (such as headings) must be changed in the Word file.':''}`:'No action needed.'));
 if(first)Object.assign(r.at(-1),{fixAt:first.fixAt,fixSelect:first.match});
 const courseFields=[['code','Course code'],['title','Course title'],['year','Course year / term year']];for(const [k,label] of courseFields){const v=clean(state.course[k]);r.push(result('course-'+k,'Course information',v?'passed':'warning',label,v?`${label} was detected.`:`${label} could not be confidently detected.`,v||'No value extracted.',v?'No action needed.':'Confirm the extracted course information before relying on downstream checks.'))}
 r.push(result('coordinator-record','Course information',state.coordinator?'passed':'warning','Coordinator contact record',state.coordinator?'A coordinator name/email record was identified.':'The coordinator section exists, but a complete coordinator contact record was not confidently extracted.',state.coordinator?state.faculty.filter(f=>f.role==='coordinator').map(f=>`${f.name} · ${f.email||'email not detected'}`).join('; '):(sectionText('coordinator')||'No coordinator record extracted.'),state.coordinator?'Confirm the information is current.':'Confirm coordinator name, rank/department, office, phone, and email are completed.'));
 const facDup=state.faculty.filter((f,i,a)=>{if(!clean(f.email))return false;return a.findIndex(x=>clean(x.email)&&x.email.toLowerCase()===f.email.toLowerCase())!==i});r.push(result('faculty-consistency','Course information',facDup.length?'issue':state.faculty.length?'passed':'warning','Faculty information consistency',facDup.length?'Duplicate faculty email records were detected.':state.faculty.length?'No duplicate faculty email records were detected.':'Faculty contact records were not confidently extracted.',facDup.length?facDup.map(f=>f.email).join(', '):state.faculty.length?`Evaluated ${state.faculty.length} faculty record${state.faculty.length===1?'':'s'}.`:(sectionText('faculty')||'No faculty records extracted.'),facDup.length?'Review duplicate or inconsistent faculty listings.':state.faculty.length?'Confirm names, roles, office, phone, and email are current.':'Complete or review the Course Faculty section.'));
 const missingFacultyEmails=state.faculty.filter(f=>!clean(f.email));if(state.faculty.length)r.push(result('faculty-contact-completeness','Course information',missingFacultyEmails.length?'warning':'passed','Faculty contact completeness',missingFacultyEmails.length?`${missingFacultyEmails.length} of ${state.faculty.length} faculty records do not have an extracted email address.`:`All ${state.faculty.length} faculty records include an email address.`,missingFacultyEmails.length?missingFacultyEmails.map(f=>f.name).join(' · '):`Evaluated ${state.faculty.length} faculty records.`,missingFacultyEmails.length?'Confirm the approved syllabus includes current contact information for each faculty member.':'No action needed.'));else r.push(result('faculty-contact-completeness','Course information','not-evaluated','Faculty contact completeness','Faculty contact completeness could not be evaluated.','No faculty records were extracted.','Review Course Faculty extraction.',false));
 const total=state.grading.reduce((sum,x)=>sum+x.pct,0);if(state.grading.length)r.push(result('grading-total','Assessment & alignment',Math.abs(total-100)<0.05?'passed':'issue','Course evaluation totals 100%',Math.abs(total-100)<0.05?'Detected course-evaluation percentages total 100%.':`Detected course-evaluation percentages total ${total.toFixed(1)}%.`,state.grading.map(x=>`${x.label}: ${x.pct}%`).join(' · '),Math.abs(total-100)<0.05?'No action needed.':'Review the Course Evaluation table for missing, duplicated, or incorrect percentages.'));else r.push(result('grading-total','Assessment & alignment','not-evaluated','Course evaluation totals 100%','Course-evaluation arithmetic could not be evaluated.','No component percentages were confidently extracted.','Review the Course Evaluation table and extraction.',false));
 if(state.clos.length&&hasSection('plos')){const mappings=state.cloMappings||[],missing=[];state.clos.forEach((c,i)=>{const n=(c.match(/\bCL?O\s*(\d+)/i)||[])[1]||String(i+1);const m=mappings.find(x=>String((x.clo||'').match(/\d+/)?.[0]||'')===String(n));if(!m||!Array.isArray(m.pslos)||!m.pslos.length)missing.push(n)});const mappedCount=state.clos.length-missing.length;r.push(result('clo-pslo','Assessment & alignment',missing.length?'warning':'passed','CLO → PSLO mapping completeness',missing.length?`${missing.length} detected CLO${missing.length===1?'':'s'} may lack a PSLO mapping.`:`All ${state.clos.length} detected CLOs have PSLO mappings.`,`Evaluated ${state.clos.length} CLOs using ${mappings.length} structured CLO → PSLO mapping record${mappings.length===1?'':'s'}. ${mappedCount} mapped${missing.length?'; review CLO '+missing.join(', '):'.'}`,missing.length?'Confirm every CLO is mapped to the appropriate PSLO number(s).':'No action needed.'))}else r.push(result('clo-pslo','Assessment & alignment','not-evaluated','CLO → PSLO mapping completeness','CLO-to-PSLO mapping could not be fully evaluated.',`Detected ${state.clos.length} CLOs; Program Mapping section ${hasSection('plos')?'detected':'not detected'}.`,'Review CLO and Program Mapping extraction.',false));
 const evalText=clean(state.policies.courseEvaluationEdited?state.policies.courseEvaluation:(state.policies.courseEvaluation||courseEvaluationNarrative()||sectionText('assessment'))),evalWords=clean(evalText).split(/\s+/).filter(Boolean).length;const assessmentTerms=(evalText.match(/\b(exams?|quizzes?|assignments?|projects?|assessments?|final exam|case[- ]based)\b/gi)||[]).length,implementationTerms=(evalText.match(/\b(administered|due|complete|submit|worth|count|cover|include|assessed|grade|graded|time|hours?)\b/gi)||[]).length;const narrative=evalWords>=45&&assessmentTerms>=2&&implementationTerms>=2;r.push(result('evaluation-narrative','Assessment & alignment',narrative?'passed':'warning','Assessment-method narrative',narrative?'A substantive explanation of how course assessments are implemented was detected.':'A substantive narrative explaining assessment/evaluation implementation was not confidently detected.',evalText?`Evaluated ${evalWords} words in Course Evaluation; detected ${assessmentTerms} assessment references and ${implementationTerms} implementation/detail references. ${clean(evalText).slice(0,220)}`:'Course Evaluation section not extracted.','The approved template requires a narrative description of evaluation and assessment methods; confirm this is included.'));
 if(state.schedule.length){const key=e=>[clean(e.date),clean(e.time),norm(e.topic),clean(e.faculty),clean(e.raw)].join('|'),dup=state.schedule.filter((e,i,a)=>a.findIndex(x=>key(x)===key(e))!==i),incomplete=state.schedule.filter(e=>!clean(e.topic)),candidate=sourceScheduleRowCount(),missed=Math.max(0,candidate-state.schedule.length),dateProblems=editedScheduleDateProblems(),status=dup.length||incomplete.length||dateProblems.length?'issue':missed?'warning':'passed';r.push(result('schedule-internal','Schedule',status,'Internal schedule consistency',status==='passed'?'Parsed schedule entries are internally consistent.':dateProblems.length?`${dateProblems.length} schedule entr${dateProblems.length===1?'y has':'ies have'} no usable date.`:status==='warning'?`${missed} schedule entr${missed===1?'y was':'ies were'} not parsed.`:'Potential duplicate or incomplete schedule rows were detected.',`Parsed ${state.schedule.length} schedule entries from ${candidate||'an unknown number of'} source schedule rows. ${dup.length} exact duplicates; ${incomplete.length} rows without topics; ${dateProblems.length} rows without usable dates.${missed?` ${missed} source schedule row${missed===1?' was':'s were'} not represented in the parsed schedule.`:''}${state.extraction?.scheduleFailures?.length?` Unreadable source date entries: ${state.extraction.scheduleFailures.map(x=>`row ${x.rowIndex} "${x.raw}"`).slice(0,12).join(' · ')}${state.extraction.scheduleFailures.length>12?' · …':''}`:''}`,status==='passed'?'No action needed.':'Review the identified schedule rows and date formats.'));r.push(result('schedule-handoff-dates','Schedule',dateProblems.length?'issue':'passed','CalendarBridge handoff dates',dateProblems.length?`${dateProblems.length} of ${state.schedule.length} schedule entries have no usable date and cannot be handed off safely to CalendarBridge.`:`All ${state.schedule.length} schedule entries have usable dates for CalendarBridge.`,dateProblems.length?dateProblems.slice(0,12).map(x=>`row ${x.index+1}: "${clean(x.e.date)||'(blank)'}" · ${clean(x.e.topic)||'Untitled event'}`).join(' · ')+(dateProblems.length>12?` · plus ${dateProblems.length-12} more`:''):`Validated ${state.schedule.length} edited schedule dates against the current course year.`,dateProblems.length?'Correct the highlighted schedule dates before exporting FacultyBridge Course JSON.':'No action needed.'))}else{r.push(result('schedule-internal','Schedule','not-evaluated','Internal schedule consistency','Schedule consistency could not be evaluated.',sourceScheduleRowCount()?`${sourceScheduleRowCount()} source schedule rows were found, but none were parsed.`:'No schedule rows were confidently extracted.','Review the schedule extraction.',false));r.push(result('schedule-handoff-dates','Schedule','not-evaluated','CalendarBridge handoff dates','CalendarBridge handoff dates could not be evaluated.','No schedule events are available.','Review the schedule extraction.',false));}

 if(state.schedule.length){const w=scheduleDateWarnings();r.push(result('schedule-dates','Schedule',w.length?'warning':'passed','Schedule dates, weekdays, and order',w.length?`${w.length} schedule date${w.length===1?' looks':'s look'} wrong.`:'Every schedule date matches its printed weekday, year, and order.',w.length?w.join(' · '):`Checked ${state.schedule.length} schedule entries.`,w.length?'Correct the date or the day name in the syllabus. If a date is intentional, no change is needed.':'No action needed.'))}
 for(const [key,title] of [['theftPolicy','Theft'],['electronicPolicy','Electronic devices'],['professionalismPolicy','Professionalism']]){const text=clean(state.policies[key]),heading=hasSection(key);r.push(result('optional-'+key,'Optional course-specific policies',text?'passed':'not-evaluated',title,text?`${title} language was detected.`:`${title} was not detected; this section is optional in the approved template.`,text?`Heading ${heading?'found':'not found'} · ${text.split(/\s+/).length} words extracted.`:'No content extracted. Optional sections do not affect the pass/fail interpretation.',text?'No action needed.':'Add this section only if it is applicable to the course.',!!text))}
 r.push(result('academic-integrity-reference','Policies',hasSection('integrity')?'passed':'warning','Academic honesty/integrity reference',hasSection('integrity')?'Academic honesty/integrity language or reference was detected.':'Academic honesty/integrity language or reference was not detected.',hasSection('integrity')?(state.sections.find(x=>x.key==='integrity')?.line||'Reference detected'):'No matching text found.','Confirm the Course Specific Policies section retains the required Academic Honesty and Integrity reference.'));
 r.push(...policyResults());
 r.push(result('university-calendar','University calendar','not-evaluated','University calendar alignment','University-calendar comparison is not yet configured.','No academic-calendar profile is configured in this release.','Compare syllabus dates with the official institutional calendar manually. A calendar profile remains planned for a later release.',false));
 state.results=r;return r}
function autoGrow(t){const min=t.classList.contains('clo-text')?52:t.classList.contains('sb-table-cell')?46:110;t.style.height='0px';t.style.height=Math.max(min,t.scrollHeight+2)+'px'}


function initializeEditorIdentity(){
 (state.faculty||[]).forEach((x,i)=>{if(!x.editorId)x.editorId=`faculty-source-${i+1}`});
 (state.grading||[]).forEach((x,i)=>{if(!x.editorId)x.editorId=`grade-source-${i+1}`});
 (state.schedule||[]).forEach((x,i)=>{if(!x.editorId)x.editorId=`schedule-source-${i+1}`});
 if(!(state.cloEditorIds||[]).length)state.cloEditorIds=(state.clos||[]).map((_,i)=>`clo-source-${i+1}`)
}
function comparableFaculty(x){return x?{role:x.role||'faculty',name:clean(x.name),email:clean(x.email)}:null}
function comparableGrade(x){return x?{type:x.type||'',label:clean(x.label),date:clean(x.date),pct:+x.pct||0}:null}
function comparableSchedule(x){return x?{date:clean(x.date),day:clean(x.day),time:clean(x.time),topic:clean(x.topic),faculty:clean(x.faculty)}:null}
function rowMap(arr,normalizer){return new Map((arr||[]).map((x,i)=>[x.editorId||`index-${i}`,normalizer(x)]))}
function diffRows(kind,baseArr,currentArr,normalizer){
 const b=rowMap(baseArr,normalizer),c=rowMap(currentArr,normalizer),out=[];
 for(const id of new Set([...b.keys(),...c.keys()])){
  if(!b.has(id))out.push({key:`${kind}:${id}`,section:kind,action:'add',id});
  else if(!c.has(id))out.push({key:`${kind}:${id}`,section:kind,action:'remove',id});
  else if(JSON.stringify(b.get(id))!==JSON.stringify(c.get(id)))out.push({key:`${kind}:${id}`,section:kind,action:'update',id})
 }
 return out
}
function cloRows(snapshot){
 const ids=snapshot.cloEditorIds||[];
 return (snapshot.clos||[]).map((clo,i)=>{const num=(clo.match(/\d+/)||[])[0]||String(i+1),m=(snapshot.cloMappings||[]).find(x=>String((x.clo||'').match(/\d+/)?.[0]||'')===String(num));return{editorId:ids[i]||`clo-index-${i}`,clo:clean(clo),pslos:[...(m?.pslos||[])].sort()}})
}
function rebuildEditMutations(){
 if(!state.editorBaseline){state.editMutations=[];return}
 const b=state.editorBaseline,c=editorSnapshot(),out=[];
 for(const key of ['code','title','year','location'])if(clean(b.course?.[key])!==clean(c.course?.[key]))out.push({key:`course:${key}`,section:'course',action:'update',field:key});
 out.push(...diffRows('faculty',b.faculty,c.faculty,comparableFaculty));
 out.push(...diffRows('grading',b.grading,c.grading,comparableGrade));
 out.push(...diffRows('schedule',b.schedule,c.schedule,comparableSchedule));
 const bc=cloRows(b),cc=cloRows(c),bm=new Map(bc.map(x=>[x.editorId,x])),cm=new Map(cc.map(x=>[x.editorId,x]));
 for(const id of new Set([...bm.keys(),...cm.keys()])){
  if(!bm.has(id))out.push({key:`clo:${id}`,section:'clo',action:'add',id});
  else if(!cm.has(id))out.push({key:`clo:${id}`,section:'clo',action:'remove',id});
  else if(JSON.stringify(bm.get(id))!==JSON.stringify(cm.get(id)))out.push({key:`clo:${id}`,section:'clo',action:'update',id})
 }
 for(const key of new Set([...Object.keys(b.policies||{}),...Object.keys(c.policies||{})])){
  if(key==='courseEvaluationEdited')continue;
  if(clean(b.policies?.[key])!==clean(c.policies?.[key]))out.push({key:`policy:${key}`,section:'policy',action:'update',field:key})
 }
 state.editMutations=out
}
function activeStructuredMutations(){return (state.tableMutations||[]).filter(m=>m.active!==false&&m.origin!=='schedule-editor')}
function editorStructuredTablesSnapshot(){
 return (state.structuredTables||[]).map(t=>({
  tableIndex:t.tableIndex,type:t.type,headers:[...(t.headers||[])],
  rows:(t.rows||[]).map(r=>({
   rowIndex:r.rowIndex??null,
   cells:(r.cells||[]).map((c,ci)=>({columnIndex:c.columnIndex??ci,text:clean(c.text),lines:[...(c.lines||[])].map(x=>String(x??''))}))
  }))
 }))
}
function editorSnapshot(){
 return structuredClone({
  course:state.course,faculty:state.faculty,coordinator:state.coordinator,
  clos:state.clos,cloMappings:state.cloMappings,plos:state.plos,
  grading:state.grading,assessments:state.assessments,policies:state.policies,
  schedule:state.schedule,meetingPatterns:state.meetingPatterns,
  structuredTables:editorStructuredTablesSnapshot(),cloEditorIds:[...(state.cloEditorIds||[])]
 });
}
function captureEditorBaseline(){initializeEditorIdentity();state.editorBaseline=editorSnapshot();state.editMutations=[];state.dirty=false;updateEditorStatus();resetHistory()}
function editorDiffCount(){
 if(!state.editorBaseline)return 0;
 rebuildEditMutations();
 return (state.editMutations||[]).length+activeStructuredMutations().length
}
function updateEditorStatus(){
 const el=$('editCount');if(!el)return;const n=editorDiffCount();
 el.textContent=`${n} net change${n===1?'':'s'}`;state.dirty=n>0;
 const box=$('editorStatus');if(box)box.classList.toggle('sb-edited',n>0);updateFixCount();
}
// Undo/redo. After every editor change the whole editor state is copied onto a
// history list; undo and redo put an earlier or later copy back. Copies (not
// replayed edits) keep undo exact, and the editor data is small. Typing in one
// field without a pause of 2 seconds or more counts as one step.
// The copy keeps structured tables exactly as the editor holds them, including
// each added row's editorRowId, which its add-row change record points to.
// (editorSnapshot() keeps a reduced form that is only for counting changes.)
const HISTORY_LIMIT=100,HISTORY_GROUP_MS=2000;
function historySnapshot(){return structuredClone({editor:{...editorSnapshot(),structuredTables:state.structuredTables||[]},tableMutations:state.tableMutations||[],changeKinds:state.changeKinds||{},changeFindings:state.changeFindings||{}})}
function resetHistory(){state.history={past:[],future:[],current:historySnapshot(),groupKey:null,groupAt:0};updateHistoryControls('')}
function typingTarget(el){return !!el&&(el.tagName==='TEXTAREA'||(el.tagName==='INPUT'&&!/^(button|checkbox|radio|submit|reset|file|color|range)$/i.test(el.type||'')))||!!el?.isContentEditable}
function recordHistory(){
 const h=state.history;if(!h||state.restoringHistory)return;
 pruneChangeKinds();linkFixEdits();
 const now=Date.now(),el=document.activeElement,key=typingTarget(el)?el:null,snap=historySnapshot();
 // Leaving a field fires a "changed" event even when nothing changed; that is not a step.
 if(JSON.stringify(snap)===JSON.stringify(h.current))return;
 if(!(key&&h.groupKey===key&&now-h.groupAt<HISTORY_GROUP_MS)){h.past.push(h.current);if(h.past.length>HISTORY_LIMIT)h.past.shift()}
 h.current=snap;h.future=[];h.groupKey=key;h.groupAt=now;updateHistoryControls('')
}
function restoreHistory(snap){
 const s=structuredClone(snap);state.restoringHistory=true;
 try{Object.assign(state,s.editor);state.tableMutations=s.tableMutations;state.changeKinds=s.changeKinds||{};state.changeFindings=s.changeFindings||{};state.cloEditorIds=[...(s.editor.cloEditorIds||[])];refreshDerivedTableViews();renderReview();updateEditorStatus()}
 finally{state.restoringHistory=false}
 const v=$('liveValidation');if(v){v.textContent='Changes not revalidated';v.className='pill'}
}
function undoEdit(){const h=state.history;if(!h?.past.length)return;h.future.push(h.current);h.current=h.past.pop();h.groupKey=null;restoreHistory(h.current);updateHistoryControls('Undid the last change.')}
function redoEdit(){const h=state.history;if(!h?.future.length)return;h.past.push(h.current);h.current=h.future.pop();h.groupKey=null;restoreHistory(h.current);updateHistoryControls('Redid the change.')}
function updateHistoryControls(message){
 const h=state.history,u=$('undoEdit'),r=$('redoEdit'),st=$('historyStatus');
 if(u)u.disabled=!h?.past.length;if(r)r.disabled=!h?.future.length;if(st)st.textContent=message
}
function markEditorChanged(){recordHistory();updateEditorStatus();const v=$('liveValidation');if(v){v.textContent='Changes not revalidated';v.className='pill'}}
function restoreEditorBaseline(){
 if(!state.editorBaseline)return;
 const b=structuredClone(state.editorBaseline);
 Object.assign(state,b);state.editorBaseline=structuredClone(b);state.tableMutations=[];state.editMutations=[];state.cloEditorIds=[...(b.cloEditorIds||[])];refreshDerivedTableViews();state.results=[];state.reviewComplete=false;state.dirty=false;
 renderReview();recordHistory();updateEditorStatus();const v=$('liveValidation');if(v){v.textContent='Reset to parsed extraction';v.className='pill'}
}
function syncCourseFields(){
 state.course.code=clean($('courseCode').value);state.course.title=clean($('courseTitle').value);
 state.course.year=clean($('courseYear').value);state.course.location=clean($('courseLocation').value);
}
function revalidateInEditor(){
 syncCourseFields();state.results=validate();
 const c={passed:0,warning:0,issue:0,'not-evaluated':0};state.results.forEach(r=>c[r.status]++);
 const v=$('liveValidation');v.textContent=`${c.passed} passed · ${c.warning} warnings · ${c.issue} issues`;v.className='pill sb-validation-mini';
 updateEditorStatus();showFixOutcome();
}

function editorRowId(){
 if(globalThis.crypto?.randomUUID)return crypto.randomUUID();
 return 'row-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
}
function canonicalTable(tableIndex){return (state.structuredTables||[]).find(t=>t.tableIndex===tableIndex)||null}
function baselineTable(tableIndex){return (state.editorBaseline?.structuredTables||[]).find(t=>t.tableIndex===tableIndex)||null}
function tableCellValue(cell){return (cell?.lines||[]).filter(x=>x!==undefined&&x!==null).join('\n')||clean(cell?.text)}
function setTableCellValue(cell,value){
 const lines=String(value??'').replace(/\r/g,'').split('\n').map(x=>x.trimEnd());
 cell.lines=lines;
 cell.text=clean(lines.join(' '));
}
function recordCellMutation(table,row,cell,newValue){
 const sourceRow=row.rowIndex??null,sourceCol=cell.columnIndex??null,key=`cell:${table.tableIndex}:${sourceRow}:${sourceCol}:${row.editorRowId||''}`;
 const base=baselineTable(table.tableIndex),baseRow=sourceRow==null?null:(base?.rows||[]).find(r=>r.rowIndex===sourceRow),baseCell=sourceCol==null?null:(baseRow?.cells||[]).find(c=>c.columnIndex===sourceCol);
 const original=baseCell?tableCellValue(baseCell):'';
 const i=(state.tableMutations||[]).findIndex(m=>m.key===key);
 if(newValue===original){if(i>=0)state.tableMutations.splice(i,1);return}
 const mutation={key,action:'update-cell',active:true,tableIndex:table.tableIndex,tableType:table.type,sourceRowIndex:sourceRow,sourceColumnIndex:sourceCol,editorRowId:row.editorRowId||null,originalValue:original,newValue};
 if(i>=0)state.tableMutations[i]=mutation;else state.tableMutations.push(mutation)
}
function recordAddRow(table,row){
 const key=`add:${table.tableIndex}:${row.editorRowId}`;
 state.tableMutations.push({key,action:'add-row',active:true,tableIndex:table.tableIndex,tableType:table.type,sourceRowIndex:null,editorRowId:row.editorRowId,row:structuredClone(row)})
}
function updateAddedRowMutation(table,row){
 const key=`add:${table.tableIndex}:${row.editorRowId}`,i=state.tableMutations.findIndex(m=>m.key===key);
 if(i>=0)state.tableMutations[i].row=structuredClone(row)
}
function recordRemoveRow(table,row){
 if(row.rowIndex==null){state.tableMutations=state.tableMutations.filter(m=>m.editorRowId!==row.editorRowId);return}
 const key=`remove:${table.tableIndex}:${row.rowIndex}`,updates=state.tableMutations.filter(m=>m.action==='update-cell'&&m.tableIndex===table.tableIndex&&m.sourceRowIndex===row.rowIndex&&m.active!==false);
 updates.forEach(m=>{m.active=false;m.supersededBy=key});
 const original=(baselineTable(table.tableIndex)?.rows||[]).find(r=>r.rowIndex===row.rowIndex);
 const mutation={key,action:'remove-row',active:true,tableIndex:table.tableIndex,tableType:table.type,sourceRowIndex:row.rowIndex,editorRowId:row.editorRowId||null,row:structuredClone(original||row),absorbedMutations:updates.map(m=>m.key)};
 const i=state.tableMutations.findIndex(m=>m.key===key);if(i>=0)state.tableMutations[i]=mutation;else state.tableMutations.push(mutation)
}

function scheduleSourceCell(e,field){
 const src=e?.source,col=src?.columnMap?.[field];
 if(src?.tableIndex==null||src?.rowIndex==null||col==null)return null;
 const table=canonicalTable(src.tableIndex),base=baselineTable(src.tableIndex),row=(table?.rows||[]).find(r=>r.rowIndex===src.rowIndex),baseRow=(base?.rows||[]).find(r=>r.rowIndex===src.rowIndex);
 return{table,row,baseRow,col,lineIndex:src.lineIndex??0,cell:row?.cells?.[col],baseCell:baseRow?.cells?.[col]}
}
function recordScheduleCellMutation(e,field,newValue){
 const x=scheduleSourceCell(e,field);if(!x)return;
 const sourceLine=(x.baseCell?.lines||[])[x.lineIndex]??tableCellValue(x.baseCell);
 let original=sourceLine;
 if(field==='date')original=extractDates(sourceLine)[0]||clean(sourceLine);
 else if(field==='time')original=extractTime(sourceLine)||clean(sourceLine);
 else if(field==='day')original=namedDay(sourceLine)||clean(sourceLine);
 const key=`schedule:${x.table.tableIndex}:${e.source.rowIndex}:${x.col}:${x.lineIndex}:${field}`,i=state.tableMutations.findIndex(m=>m.key===key);
 if(clean(newValue)===clean(original)){if(i>=0)state.tableMutations.splice(i,1);return}
 const mutation={key,action:'update-cell',active:true,origin:'schedule-editor',field,tableIndex:x.table.tableIndex,tableType:'courseSchedule',sourceRowIndex:e.source.rowIndex,sourceColumnIndex:x.col,sourceLineIndex:x.lineIndex,originalValue:original,newValue:clean(newValue),scheduleEditorId:e.editorId||null};
 if(i>=0)state.tableMutations[i]=mutation;else state.tableMutations.push(mutation)
}
function primaryCourseScheduleTable(){return (state.structuredTables||[]).find(t=>t.type==='courseSchedule')||null}
function recordScheduleAdd(e){
 const table=primaryCourseScheduleTable(),key=`schedule-add:${e.editorId}`;
 state.tableMutations.push({key,action:'add-row',active:true,origin:'schedule-editor',tableIndex:table?.tableIndex??-1,tableType:'courseSchedule',sourceRowIndex:null,editorRowId:e.editorId,row:structuredClone(e)})
}
function recordScheduleRemove(e){
 if(e?.source?.tableIndex==null){state.tableMutations=state.tableMutations.filter(m=>m.scheduleEditorId!==e.editorId&&m.editorRowId!==e.editorId);return}
 const base=baselineTable(e.source.tableIndex),original=(base?.rows||[]).find(r=>r.rowIndex===e.source.rowIndex),sameRow=(state.schedule||[]).filter(x=>x!==e&&x.source?.tableIndex===e.source.tableIndex&&x.source?.rowIndex===e.source.rowIndex).length,key=`schedule-remove:${e.source.tableIndex}:${e.source.rowIndex}:${e.source.lineIndex??0}:${e.editorId||''}`;
 state.tableMutations.filter(m=>m.origin==='schedule-editor'&&m.scheduleEditorId===e.editorId).forEach(m=>{m.active=false;m.supersededBy=key});
 state.tableMutations.push({key,action:'remove-row',active:true,origin:'schedule-editor',partialRow:sameRow>0,sourceLineIndex:e.source.lineIndex??0,tableIndex:e.source.tableIndex,tableType:'courseSchedule',sourceRowIndex:e.source.rowIndex,editorRowId:e.editorId||null,row:structuredClone(original||e),scheduleEditorId:e.editorId||null})
}
function makeStructuredRow(table,colCount){
 return{rowIndex:null,editorRowId:editorRowId(),cells:Array.from({length:colCount},(_,i)=>({columnIndex:i,text:'',lines:[''],sourceColumnIndex:null}))}
}
function editableStructuredTables(){
 return (state.structuredTables||[]).filter(t=>['gradingScale','assignmentSchedule','rubric','dueDateTopic','studentTeams'].includes(t.type))
}
function structuredTableTitle(type){
 return type==='gradingScale'?'Grading scale':type==='assignmentSchedule'?'Assignments / Activities':type==='rubric'?'Project / Assignment Rubric':type==='studentTeams'?'Student Teams':'Quiz / Assignment Due Dates'
}
function structuredDisplayModel(table){
 let headers=[...(table.headers||[])],rows=[...(table.rows||[])],headerSourceRow=null;
 if(table.type==='studentTeams'&&rows.length&&rows[0].cells.filter(c=>clean(c.text)).length>=2){
  headers=rows[0].cells.map(c=>clean(c.text));headerSourceRow=rows[0];rows=rows.slice(1)
 }
 const maxCols=Math.max(headers.length,...rows.map(r=>r.cells.length),1);
 while(headers.length<maxCols)headers.push(`Column ${headers.length+1}`);
 return{headers,rows,maxCols,headerSourceRow}
}
function refreshDerivedTableViews(){
 const assignment=[],supplemental=[];
 for(const table of state.structuredTables||[]){
  if(table.type==='assignmentSchedule'){
   const entries=(table.rows||[]).filter(r=>r.cells.some(c=>clean(c.text))).map(r=>({category:clean(r.cells[0]?.text),items:(r.cells[1]?.lines||[]).map(clean).filter(Boolean),sourceTableIndex:table.tableIndex,sourceRowIndex:r.rowIndex,editorRowId:r.editorRowId||null}));
   assignment.push({...table,entries})
  }else if(['rubric','dueDateTopic','studentTeams'].includes(table.type)){
   supplemental.push({...table,rows:(table.rows||[]).filter(r=>r.cells.some(c=>clean(c.text)))})
  }
 }
 state.assignmentTables=assignment;state.supplementalTables=supplemental
}
function renderStructuredTableEditor(table,editors){
 const box=document.createElement('div');box.className='soft supplemental-editor section-anchor sb-structured-editor';box.id=`review-structured-${table.tableIndex}`;
 const title=structuredTableTitle(table.type),model=structuredDisplayModel(table);
 const note=table.type==='studentTeams'?'The first content row supplies the displayed team headers.':'Original Word row and column references are retained for existing cells.';
 box.innerHTML=`<div class="head"><div><h2 style="margin:0">${esc(title)} <span class="pill">Editable structured table</span></h2><div class="muted">${esc(note)}</div></div><button type="button" class="sb-btn no-print add-structured-row ft-btn">+ Add row</button></div><div class="tablewrap"><table class="supplemental-table sb-structured-table"><thead><tr>${model.headers.map(h=>`<th>${esc(h||'')}</th>`).join('')}<th class="no-print"></th></tr></thead><tbody></tbody></table></div><div class="assignment-note">Existing rows keep their source table/row/cell identifiers. New rows are marked as editor-created so a later DOCX write-back step can distinguish updates, additions, and deletions.</div>`;
 editors.appendChild(box);
 const tbody=box.querySelector('tbody');
 const draw=()=>{
  tbody.innerHTML='';const current=structuredDisplayModel(table),rows=current.rows;
  rows.forEach((row,ri)=>{
   const domRowId=row.editorRowId||`source-${table.tableIndex}-${row.rowIndex}`;
   const tr=document.createElement('tr');tr.dataset.editorRowId=domRowId;
   let cells='';
   for(let ci=0;ci<current.maxCols;ci++){
    const cell=row.cells[ci],value=tableCellValue(cell);
    cells+=`<td><textarea class="textarea sb-table-cell ft-textarea" data-col="${ci}" aria-label="${esc(title)} row ${ri+1}, column ${ci+1}">${esc(value)}</textarea></td>`
   }
   tr.innerHTML=cells+`<td class="no-print"><button type="button" class="sb-mini-remove" aria-label="Remove ${esc(title)} row ${ri+1}">×</button></td>`;
   tbody.appendChild(tr);
   tr.querySelectorAll('.sb-table-cell').forEach(ta=>{
    autoGrow(ta);
    const saveCell=()=>{
      const ci=+ta.dataset.col,value=ta.value.replace(/\r/g,'');
      let cell=row.cells[ci];
      if(!cell){cell={columnIndex:ci,text:'',lines:[''],sourceColumnIndex:null};row.cells[ci]=cell}
      setTableCellValue(cell,value);
      if(row.rowIndex==null)updateAddedRowMutation(table,row);else recordCellMutation(table,row,cell,value);
      refreshDerivedTableViews();markEditorChanged()
    };
    ta.addEventListener('input',()=>{autoGrow(ta);saveCell()});
    ta.addEventListener('change',saveCell)
   });
   tr.querySelector('.sb-mini-remove').onclick=()=>{
    const idx=table.rows.indexOf(row);if(idx>=0)table.rows.splice(idx,1);
    recordRemoveRow(table,row);refreshDerivedTableViews();draw();markEditorChanged()
   }
  });
  if(!rows.length)tbody.innerHTML=`<tr><td colspan="${current.maxCols+1}" class="muted">No rows remain in this structured table. Use Add row to create one.</td></tr>`
 };
 draw();
 box.querySelector('.add-structured-row').onclick=()=>{
  const current=structuredDisplayModel(table),row=makeStructuredRow(table,current.maxCols);
  table.rows.push(row);recordAddRow(table,row);refreshDerivedTableViews();draw();markEditorChanged();
  // Focus now, not on a later animation frame: a late frame could pull the cursor
  // back here after faculty had already moved to another cell and started typing.
  tbody.querySelector(`tr[data-editor-row-id="${row.editorRowId}"] textarea`)?.focus()
 };
 return box
}
function renderReview(){sourceName.textContent=state.sourceName;courseCode.value=state.course.code;courseTitle.value=state.course.title;courseYear.value=state.course.year;courseLocation.value=state.course.location;const counts={sections:state.sections.length,faculty:state.faculty.length,clos:state.clos.length,plos:state.cloMappings?.length||state.plos.length,assess:state.grading.length,schedule:state.schedule.length};$('mSections').textContent=counts.sections;$('mFaculty').textContent=counts.faculty;$('mClos').textContent=counts.clos;$('mPlos').textContent=counts.plos;$('mAssess').textContent=counts.assess;$('mSchedule').textContent=counts.schedule;$('extractSummary').textContent=`${counts.sections} section matches · ${counts.faculty} faculty · ${counts.clos} CLOs · ${counts.assess} assessment components · ${counts.schedule} schedule rows`;
 const facultyHost=$('facultyList');facultyHost.innerHTML='';$('facultyStatus').textContent=state.faculty.length?'Detected':'Not detected';
 const drawFaculty=()=>{facultyHost.innerHTML='';if(!state.faculty.length){facultyHost.innerHTML='<div class="muted">No faculty contact records were confidently extracted.</div>';return}state.faculty.forEach((f,i)=>{const d=document.createElement('div');d.className='faculty-edit-row';d.innerHTML=`<select class="select f-role ft-select" aria-label="Faculty role"><option value="coordinator"${f.role==='coordinator'?' selected':''}>Coordinator</option><option value="faculty"${f.role!=='coordinator'?' selected':''}>Course faculty</option></select><input class="input f-name ft-input" aria-label="Faculty name" value="${esc(f.name)}" placeholder="Faculty name"><input class="input f-email ft-input" aria-label="Faculty email" type="email" value="${esc(f.email)}" placeholder="Email"><button type="button" class="sb-mini-remove" aria-label="Remove ${esc(f.name||'faculty record')}">×</button>`;facultyHost.appendChild(d);const save=()=>{f.role=d.querySelector('.f-role').value;f.name=clean(d.querySelector('.f-name').value);f.email=clean(d.querySelector('.f-email').value);f.short=lastName(f.name)||f.short||`Faculty ${i+1}`;state.coordinator=state.faculty.find(x=>x.role==='coordinator')||null;markEditorChanged()};d.querySelectorAll('input,select').forEach(x=>x.addEventListener('change',()=>{save();drawFaculty()}));d.querySelector('.sb-mini-remove').onclick=()=>{state.faculty.splice(i,1);state.coordinator=state.faculty.find(x=>x.role==='coordinator')||null;drawFaculty();markEditorChanged()}})};drawFaculty();
 $('addFacultyRow').onclick=()=>{state.faculty.push({name:'',email:'',short:`Faculty ${state.faculty.length+1}`,role:'faculty',editorId:`faculty-new-${editorRowId()}`});drawFaculty();markEditorChanged()};
 const editors=$('editors');editors.innerHTML='';const cards=[['Student engagement','engagement',state.policies.engagement],['Required materials','materials',state.policies.materials],['Required hardware/software','hardware',state.policies.hardware],['Accessibility / accommodations','accessibility',state.policies.accessibility],['Program-wide assessment tools','programAssessment',state.policies.programAssessment],['Attendance/tardy policy','attendance',state.policies.attendance],['Assessment policy','assessmentPolicy',state.policies.assessmentPolicy],['Absence policy','absence',state.policies.absence],['Incomplete policy','incomplete',state.policies.incomplete],['Theft','theftPolicy',state.policies.theftPolicy],['Electronic devices','electronicPolicy',state.policies.electronicPolicy],['Professionalism','professionalismPolicy',state.policies.professionalismPolicy],['Course-specific policies','coursePolicies',state.policies.coursePolicies]];


 const descBox=document.createElement('div');descBox.className='soft editor section-anchor';descBox.id='review-description';descBox.innerHTML=`<h2>Course description <span class="pill">${clean(state.policies.description)?'Detected':'Not detected'}</span></h2><textarea class="textarea ft-textarea" data-key="description" placeholder="Nothing confidently extracted">${esc(state.policies.description)}</textarea>`;editors.appendChild(descBox);const descTa=descBox.querySelector('textarea');descTa.addEventListener('input',()=>autoGrow(descTa));descTa.onchange=()=>applyEditor('description',descTa.value);requestAnimationFrame(()=>autoGrow(descTa));

 const cloBox=document.createElement('div');cloBox.className='soft clo-editor section-anchor';cloBox.id='review-clos';cloBox.innerHTML=`<h2>Course Learning Outcomes &amp; PSLO Mapping <span class="pill">${state.clos.length?'Detected':'Not detected'}</span></h2><div class="clo-grid" id="cloGrid"><div class="clo-head">CLO</div><div class="clo-head">Learning outcome</div><div class="clo-head">PSLO mapping</div><div class="clo-head"></div></div><button type="button" class="sb-btn no-print ft-btn" id="addCloRow" style="margin-top:10px">+ Add CLO</button>`;editors.appendChild(cloBox);
 const cg=cloBox.querySelector('#cloGrid');
 const drawClos=()=>{cg.querySelectorAll('.clo-row,.clo-empty').forEach(x=>x.remove());if(state.clos.length){state.clos.forEach((raw,i)=>{const id=(raw.match(/\bCL?O\s*[-–—]?\s*(\d+)/i)||[])[1]||String(i+1),cloId='CLO'+id,text=clean(raw.replace(/^\s*CL?O\s*[-–—]?\s*\d+\s*[–—\-:.)]*\s*/i,'')),mapping=(state.cloMappings||[]).find(x=>String((x.clo||'').match(/\d+/)?.[0]||'')===String(id)),mapText=(mapping?.pslos||[]).join(', ');const row=document.createElement('div');row.className='clo-row';row.innerHTML=`<input class="input clo-id ft-input" aria-label="CLO identifier" value="${esc(cloId)}"><textarea class="textarea clo-text ft-textarea" aria-label="${esc(cloId)} text">${esc(text)}</textarea><input class="input clo-map ft-input" aria-label="${esc(cloId)} PSLO mapping" value="${esc(mapText)}" placeholder="e.g., 1.1, 1.4, 2.2"><button type="button" class="sb-mini-remove" aria-label="Remove ${esc(cloId)}">×</button>`;cg.appendChild(row);const save=()=>{const newId=clean(row.querySelector('.clo-id').value)||cloId,newText=clean(row.querySelector('.clo-text').value),pslos=[...row.querySelector('.clo-map').value.matchAll(/\d+(?:\.\d+)+/g)].map(x=>x[0]);state.clos[i]=`${newId} – ${newText}`;const currentNumber=String(id),existing=(state.cloMappings||[]).findIndex(x=>String((x.clo||'').match(/\d+/)?.[0]||'')===currentNumber);const record={clo:newId.replace(/\s+/g,''),cloText:newText,pslos:[...new Set(pslos)],source:'Edited in structured editor'};if(existing>=0)state.cloMappings[existing]=record;else state.cloMappings.push(record);state.plos=[...new Set(state.cloMappings.flatMap(x=>(x.pslos||[]).map(p=>'PSLO '+p)))];markEditorChanged()};row.querySelectorAll('input,textarea').forEach(x=>x.addEventListener('change',save));const ta=row.querySelector('.clo-text');ta.addEventListener('input',()=>autoGrow(ta));row.querySelector('.sb-mini-remove').onclick=()=>{state.clos.splice(i,1);state.cloEditorIds.splice(i,1);state.cloMappings=state.cloMappings.filter(x=>String((x.clo||'').match(/\d+/)?.[0]||'')!==String(id));state.plos=[...new Set(state.cloMappings.flatMap(x=>(x.pslos||[]).map(p=>'PSLO '+p)))];drawClos();markEditorChanged()};requestAnimationFrame(()=>autoGrow(ta))})}else{const empty=document.createElement('div');empty.className='muted clo-empty';empty.style.gridColumn='1/-1';empty.textContent='No course learning outcomes were confidently extracted.';cg.appendChild(empty)}};drawClos();
 cloBox.querySelector('#addCloRow').onclick=()=>{const nums=state.clos.map(c=>+(c.match(/\bCL?O\s*[-–—]?\s*(\d+)/i)||[])[1]||0),n=Math.max(0,...nums)+1;state.clos.push(`CLO${n} – New course learning outcome`);state.cloEditorIds.push(`clo-new-${editorRowId()}`);state.cloMappings.push({clo:`CLO${n}`,cloText:'New course learning outcome',pslos:[],source:'Added in structured editor'});drawClos();markEditorChanged()};

 const gradeBox=document.createElement('div');gradeBox.className='soft grade-editor section-anchor';gradeBox.id='review-assessments';gradeBox.innerHTML=`<h2>Grade Breakdown <span class="pill">${state.grading.length?'Detected':'Not detected'}</span></h2><div class="grade-grid" id="gradeGrid"><div class="grade-head">Type</div><div class="grade-head">Name</div><div class="grade-head">Date</div><div class="grade-head">Weight</div><div class="grade-head"></div></div><div class="grade-total" id="gradeTotal"></div><div class="grade-actions"><button type="button" class="sb-btn ft-btn" id="addGradeRow">+ Add grade item</button></div><div class="course-eval-block"><label for="courseEvaluationText">Course evaluation</label><textarea class="textarea ft-textarea" id="courseEvaluationText" data-key="courseEvaluation" placeholder="No Course Evaluation narrative confidently extracted">${esc(state.policies.courseEvaluation||courseEvaluationNarrative())}</textarea></div>`;
 editors.appendChild(gradeBox);
 const gg=gradeBox.querySelector('#gradeGrid');
 const drawGradeRows=()=>{gg.querySelectorAll('.grade-row,.grade-empty').forEach(x=>x.remove());if(state.grading.length){state.grading.forEach((g,i)=>{const row=document.createElement('div');row.className='grade-row';row.innerHTML=`<select class="select grade-type ft-select" aria-label="Assessment type"><option${g.type==='Exam'?' selected':''}>Exam</option><option${g.type==='Quiz'?' selected':''}>Quiz</option><option${g.type==='Reinforcement'?' selected':''}>Reinforcement</option><option${g.type==='Other'?' selected':''}>Other</option></select><input class="input grade-name ft-input" aria-label="Assessment name" value="${esc(g.label)}"><input class="input grade-date ft-input" aria-label="Assessment date" value="${esc(g.date||'')}" placeholder="Not detected"><div class="grade-weight-wrap"><input class="input grade-weight ft-input" aria-label="Assessment weight" inputmode="decimal" value="${esc(g.pct)}"></div><button type="button" class="grade-remove" aria-label="Remove ${esc(g.label||'grade item')}">×</button>`;gg.appendChild(row);
   // Set each box's value from the data after building the row. WebKit (Safari) can carry a
   // previously typed value into a rebuilt box (seen after Undo), so the markup alone is not enough.
   if(['Exam','Quiz','Reinforcement','Other'].includes(g.type))row.querySelector('.grade-type').value=g.type;row.querySelector('.grade-name').value=g.label||'';row.querySelector('.grade-date').value=g.date||'';row.querySelector('.grade-weight').value=g.pct??'';
   const save=()=>{g.type=row.querySelector('.grade-type').value;g.label=clean(row.querySelector('.grade-name').value);g.date=clean(row.querySelector('.grade-date').value);g.pct=+row.querySelector('.grade-weight').value||0;state.assessments=parseAssessments();updateGradeTotal();markEditorChanged()};row.querySelectorAll('input,select').forEach(x=>x.addEventListener('change',save));row.querySelector('.grade-remove').onclick=()=>{state.grading.splice(i,1);state.assessments=parseAssessments();drawGradeRows();updateGradeTotal();markEditorChanged()}})}else{const empty=document.createElement('div');empty.className='muted grade-empty';empty.style.gridColumn='1/-1';empty.textContent='No grading components were confidently extracted.';gg.appendChild(empty)}};drawGradeRows();
 gradeBox.querySelector('#addGradeRow').onclick=()=>{state.grading.push({type:'Other',label:'New grade item',date:'',pct:0,source:'Manual'});state.assessments=parseAssessments();drawGradeRows();updateGradeTotal();markEditorChanged()};

 const structuredEditors=[];
 editableStructuredTables().forEach(table=>structuredEditors.push(renderStructuredTableEditor(table,editors)));

 const evalTa=gradeBox.querySelector('#courseEvaluationText');evalTa.addEventListener('input',()=>autoGrow(evalTa));requestAnimationFrame(()=>autoGrow(evalTa));updateGradeTotal();

 for(const [title,key,val] of cards){const d=document.createElement('div');d.className='soft editor section-anchor';d.id='review-'+key;d.innerHTML=`<h2>${esc(title)} <span class="pill">${clean(val)?'Detected':'Not detected'}</span></h2><textarea class="textarea ft-textarea" data-key="${key}" placeholder="Nothing confidently extracted">${esc(val)}</textarea>`;editors.appendChild(d)}
 editors.querySelectorAll('textarea').forEach(t=>{t.addEventListener('input',()=>autoGrow(t));if(t.dataset.key)t.onchange=()=>applyEditor(t.dataset.key,t.value)});
 const nav=$('reviewNav');nav.innerHTML='<strong>Jump to</strong>';const navItems=[['Course information','review-course-info'],['Faculty','review-faculty'],['Course Description','review-description'],['CLOs & PSLO Mapping','review-clos'],['Grade Breakdown','review-assessments']];editableStructuredTables().forEach(tbl=>navItems.push([structuredTableTitle(tbl.type),`review-structured-${tbl.tableIndex}`]));navItems.push(...cards.map(x=>[x[0],'review-'+x[1]]),['Course schedule','review-schedule']);navItems.forEach(([label,id])=>{const a=document.createElement('a');a.href='#'+id;a.textContent=label;a.onclick=e=>{e.preventDefault();document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'})};nav.appendChild(a)});
 const mp=$('meetingPatterns');mp.innerHTML='';if(state.meetingPatterns?.length){state.meetingPatterns.forEach(x=>{const c=document.createElement('span');c.className='meeting-chip';c.textContent=`${x.day} · ${x.time}`;mp.appendChild(c)})}else mp.innerHTML='<span class="muted">No recurring meeting pattern was confidently extracted.</span>';
 const body=$('scheduleBody');
 const drawSchedule=()=>{body.innerHTML='';state.schedule.forEach((e,i)=>{const tr=document.createElement('tr');tr.innerHTML=`<td><input class="input s-date ft-input" aria-label="Schedule date" value="${esc(e.date)}"></td><td><select class="select s-day ft-select" aria-label="Schedule day">${['','Monday','Tuesday','Wednesday','Thursday','Friday'].map(d=>`<option value="${d}"${e.day===d?' selected':''}>${d||'—'}</option>`).join('')}</select></td><td><input class="input s-time ft-input" aria-label="Schedule time" value="${esc(e.time||'')}" placeholder="Not detected"></td><td><input class="input topic-edit s-topic ft-input" aria-label="Schedule topic" value="${esc(e.topic||'')}"></td><td><input class="input s-faculty ft-input" aria-label="Schedule faculty" value="${esc(e.faculty||'')}"></td><td class="no-print"><button type="button" class="sb-mini-remove" aria-label="Remove schedule row">×</button></td>`;body.appendChild(tr);const dateInput=tr.querySelector('.s-date'),daySelect=tr.querySelector('.s-day');const updateValidity=()=>{const ok=!!isoDate(dateInput.value);tr.classList.toggle('sb-schedule-invalid',!ok);dateInput.setAttribute('aria-invalid',ok?'false':'true');if(!ok){e.day='';daySelect.value=''}return ok};const saveField=(field,value)=>{e[field]=clean(value);if(field==='date'){e.day=dayFromDate(e.date)||'';daySelect.value=e.day;updateValidity();recordScheduleCellMutation(e,'day',e.day)}recordScheduleCellMutation(e,field,e[field]);markEditorChanged()};dateInput.addEventListener('input',x=>saveField('date',x.target.value));dateInput.addEventListener('change',x=>saveField('date',x.target.value));daySelect.addEventListener('change',x=>saveField('day',x.target.value));tr.querySelector('.s-time').addEventListener('change',x=>saveField('time',x.target.value));tr.querySelector('.s-topic').addEventListener('change',x=>saveField('topic',x.target.value));tr.querySelector('.s-faculty').addEventListener('change',x=>saveField('faculty',x.target.value));tr.querySelector('.sb-mini-remove').onclick=()=>{recordScheduleRemove(e);state.schedule.splice(i,1);drawSchedule();markEditorChanged()};updateValidity()});if(!state.schedule.length)body.innerHTML='<tr><td colspan="6" class="muted">No schedule rows were confidently extracted.</td></tr>'};drawSchedule();
 $('addScheduleRow').onclick=()=>{const e={date:'',day:'',time:'',topic:'New schedule event',faculty:'',raw:'Added in structured editor',editorId:`schedule-new-${editorRowId()}`};state.schedule.push(e);recordScheduleAdd(e);drawSchedule();markEditorChanged()};
 [['courseCode','code'],['courseTitle','title'],['courseYear','year'],['courseLocation','location']].forEach(([id,key])=>{$(id).onchange=e=>{state.course[key]=clean(e.target.value);markEditorChanged()}});
 $('revalidateNow').onclick=revalidateInEditor;$('resetEdits').onclick=async()=>{if(editorDiffCount()&& !await FTDialog.confirm('All structured edits will go back to what was originally extracted from the syllabus.',{title:'Reset all edits?',confirmLabel:'Reset edits',danger:true}))return;restoreEditorBaseline()};
 updateEditorStatus();showFixContext();
 requestAnimationFrame(()=>{editors.querySelectorAll('textarea').forEach(autoGrow);document.querySelectorAll('.clo-text').forEach(autoGrow)})
}

function updateGradeTotal(){const el=$('gradeTotal');if(!el)return;const total=(state.grading||[]).reduce((a,g)=>a+(+g.pct||0),0);el.textContent=`Total: ${Number.isInteger(total)?total:total.toFixed(1)}%`;el.className='grade-total '+(Math.abs(total-100)<.05?'is-good':'is-bad')}
function applyEditor(key,value){value=value.trim();if(key==='courseEvaluation'){state.policies.courseEvaluation=value;state.policies.courseEvaluationEdited=true;markEditorChanged();return}if(key==='clos')state.clos=value?value.split(/\n+/).map(clean).filter(Boolean):[];else if(key==='mappings'){state.cloMappings=value?value.split(/\n+/).map(clean).filter(Boolean).map(l=>{const m=l.match(/^(CLO\s*\d+)\s*(?:→|->|:)\s*(?:PSLO\s*)?(.+)$/i);return m?{clo:clean(m[1]).replace(/\s+/g,''),cloText:'',pslos:[...m[2].matchAll(/\d+(?:\.\d+)+/g)].map(x=>x[0]),source:l}:null}).filter(Boolean):[];state.plos=[...new Set(state.cloMappings.flatMap(x=>x.pslos.map(p=>'PSLO '+p)))]}else if(key==='plos')state.plos=value?value.split(/\n+/).map(clean).filter(Boolean):[];else if(key==='assessments'){state.grading=[];for(const l of value.split(/\n+/)){const m=l.match(/^(.+?):\s*(\d+(?:\.\d+)?)%?$/);if(m)state.grading.push({label:clean(m[1]),pct:+m[2],source:l})}state.assessments=state.grading.filter(x=>/exam|quiz|assignment|project|presentation|activity|participation|homework|assessment|case|paper|final/i.test(x.label))}else state.policies[key]=value;markEditorChanged()}

function safeId(s){return clean(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'item'}
function parseQuarterNumber(){const t=sectionText('quarter')||'';const m=t.match(/\b(?:quarter|q)\s*[:#-]?\s*(\d{1,2})\b/i);return m?+m[1]:null}
function isoDate(raw){const p=parseLooseDate(raw);if(!p)return'';let y=+(p.y||state.course.year);if(y<100)y+=2000;if(!y)return'';const dt=new Date(y,p.mo-1,p.d);if(dt.getFullYear()!==y||dt.getMonth()!==p.mo-1||dt.getDate()!==p.d)return'';return `${y}-${String(p.mo).padStart(2,'0')}-${String(p.d).padStart(2,'0')}`}
function hm24(h,ampm){h=+h;const p=String(ampm||'').toUpperCase();if(p==='AM')return h===12?0:h;if(p==='PM')return h===12?12:h+12;return h}
function normalizedTimeRange(text){
 const c=normalizeTimeText(text||''),m=c.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?\s*–\s*(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
 if(!m)return{startTime:'',endTime:'',timeText:clean(text)};
 let p1=(m[3]||'').toUpperCase(),p2=(m[6]||'').toUpperCase();
 if(!p1&&p2){const h1=+m[1],h2=+m[4];p1=(p2==='PM'&&h1<=h2)?'PM':'AM'}
 if(!p2&&p1)p2=p1;
 const h1=hm24(m[1],p1),h2=hm24(m[4],p2);
 return{startTime:`${String(h1).padStart(2,'0')}:${m[2]}`,endTime:`${String(h2).padStart(2,'0')}:${m[5]}`,timeText:clean(text)};
}
function sharedFaculty(){
 const seen=new Map;
 return (state.faculty||[]).map((f,i)=>{
   const short=clean(f.short||f.name?.split(/\s+/).at(-1)||`Faculty ${i+1}`),base=safeId(short),n=(seen.get(base)||0)+1;seen.set(base,n);
   return{id:n>1?`${base}-${n}`:base,name:clean(f.name),shortName:short,email:clean(f.email),role:f.role==='coordinator'?'coordinator':'faculty'};
 });
}
function facultyIdsForText(text,faculty){
 const n=norm(text),ids=[];
 for(const f of faculty){const terms=[f.shortName,f.name].map(norm).filter(Boolean);if(terms.some(t=>n.includes(t)||t.includes(n)))ids.push(f.id)}
 return [...new Set(ids)];
}
// A "(Quiz 1 due at 8 AM)" note is a deadline, not the meeting itself, and a review period that names an exam is still a class meeting.
function classifySharedEvent(topic){const t=norm(topic);if(/no class|holiday|thanksgiving|veteran/.test(t))return'no-class';const core=t.replace(/\([^)]*\bdue\b[^)]*\)/g,' ');if(/\breview\b/.test(core.replace(/\([^)]*\)/g,' ')))return'activity';if(/exam|quiz/.test(core))return'assessment';if(/reinforcement|activity|assignment/.test(core))return'activity';return'class'}
function buildFacultyBridgeCourse(){
 const faculty=sharedFaculty(),coords=faculty.filter(f=>f.role==='coordinator').map(f=>f.id),coord=coords[0]||null;
 const recurringSchedule=(state.meetingPatterns||[]).map((m,i)=>{const tr=normalizedTimeRange(m.time);return{id:`meeting-${i+1}`,day:m.day,startTime:tr.startTime,endTime:tr.endTime,timeText:tr.timeText,location:clean(state.course.location),source:{kind:m.source?.toLowerCase().includes('derived')?'inferred':'syllabus',text:clean(m.source)}}});
 const schedule=(state.schedule||[]).map((e,i)=>{const tr=normalizedTimeRange(e.time),facultyIds=facultyIdsForText(e.faculty,faculty);return{id:`event-${i+1}`,date:isoDate(e.date),rawDate:clean(e.date),day:clean(e.day),startTime:tr.startTime,endTime:tr.endTime,timeText:tr.timeText,type:classifySharedEvent(e.topic),title:clean(e.topic),topic:clean(e.topic),location:clean(state.course.location),facultyIds,facultyText:clean(e.faculty),source:{kind:'syllabus',tableIndex:null,rowIndex:i+1,raw:clean(e.raw)}}});
 const grading=(state.grading||[]).map((g,i)=>({id:`grade-${i+1}`,type:g.type||gradeType(g.label),name:clean(g.label),date:isoDate(g.date)||'',rawDate:clean(g.date),weight:+g.pct||0}));
 const learningOutcomes=(state.clos||[]).map((c,i)=>{const id=(c.match(/\bCL?O\s*[-–—]?\s*(\d+)/i)||[])[1]||String(i+1),map=(state.cloMappings||[]).find(x=>String((x.clo||'').match(/\d+/)?.[0]||'')===String(id));return{id:`CLO${id}`,text:clean(c.replace(/^\s*CL?O\s*[-–—]?\s*\d+\s*[–—\-:.)]*\s*/i,'')),psloMappings:[...(map?.pslos||[])]}});
 const validation=state.results?.length?state.results.reduce((a,r)=>{a[r.status]=(a[r.status]||0)+1;return a},{passed:0,warning:0,issue:0,'not-evaluated':0}):null;
 return{
  schema:'facultybridge.course',
  schemaVersion:'1.1.0',
  producer:{tool:'SyllabusBridge',version:'2.1.2',generatedAt:new Date().toISOString()},
  source:{fileName:state.sourceName,format:'docx'},
  course:{code:clean(state.course.code),title:clean(state.course.title),year:+state.course.year||null,quarter:parseQuarterNumber(),location:clean(state.course.location)},
  faculty,coordinatorId:coord,coordinatorIds:coords,recurringSchedule,schedule,
  grading,learningOutcomes,
  policies:{description:clean(state.policies.description),studentEngagement:clean(state.policies.engagement),attendance:clean(state.policies.attendance),assessment:clean(state.policies.assessmentPolicy),absence:clean(state.policies.absence),incomplete:clean(state.policies.incomplete),accessibility:clean(state.policies.accessibility),courseSpecific:clean(state.policies.coursePolicies),theft:clean(state.policies.theftPolicy),electronicDevices:clean(state.policies.electronicPolicy),professionalism:clean(state.policies.professionalismPolicy)},
  structuredTables:(state.structuredTables||[]).map(t=>({tableIndex:t.tableIndex,type:t.type,headers:t.headers,rows:t.rows})),
  tableMutations:structuredClone(state.tableMutations||[]),
  extraction:{scheduleCandidates:state.extraction?.scheduleCandidates||0,scheduleParsed:state.schedule.length,scheduleFailures:state.extraction?.scheduleFailures||[],cloCandidates:state.extraction?.cloCandidates||0,cloParsed:state.clos.length},
  validationSummary:validation||{status:'not-run',passed:null,warning:null,issue:null,'not-evaluated':null}
 };
}
function downloadText(text,name,type='application/json'){const blob=new Blob([text],{type}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},0)}
async function exportCourseJson(){
 syncCourseFields();state.results=validate();
 const blockers=handoffBlockingProblems();
 if(blockers.length){await FTDialog.alert(`${blockers.length} schedule entr${blockers.length===1?'y does':'ies do'} not have a usable date. CalendarBridge requires a date for every schedule event.\n\nCorrect the highlighted schedule row${blockers.length===1?'':'s'} before exporting.`,{title:'Course JSON cannot be exported yet'});renderReview();go('review');return}
 const issues=state.results.filter(r=>r.status==='issue'&&r.id!=='schedule-handoff-dates'&&r.id!=='schedule-internal');
 if(issues.length&&!await FTDialog.confirm(`This syllabus still has ${issues.length} validation issue${issues.length===1?'':'s'} that do not prevent CalendarBridge handoff.`,{title:'Export with validation issues?',confirmLabel:'Export anyway'}))return;
 const obj=buildFacultyBridgeCourse(),name=`${safeId(state.course.code||'course')}-FacultyBridge-Course-v1.json`;downloadText(JSON.stringify(obj,null,2),name)
}
// Change summary (v2.2): every net change, grouped by syllabus section, with the
// text before and after. Built from the same comparison as the "N net changes"
// count, so the two always agree (one summary row per counted change).
// Kinds of change (v2.2). Every change is a syllabus edit unless faculty mark it
// as a reading correction: SyllabusBridge misread the Word file, and the file was
// right. Reading corrections still fix the data (Course JSON, validation), but
// Word export (v2.5) must never write them into the syllabus.
// state.changeKinds maps a change's key to 'reading-correction'.
const CHANGE_KIND_READING='reading-correction';
function currentChangeKeys(){rebuildEditMutations();return new Set([...(state.editMutations||[]).map(m=>m.key),...activeStructuredMutations().map(m=>m.key)])}
// A mark belongs to a change that exists now. When the change goes away (undone or
// typed back to the original), its mark goes too, so a later change starts fresh.
// Finding links (v2.3, state.changeFindings) follow the same rule.
function pruneChangeKinds(){const maps=[state.changeKinds,state.changeFindings].filter(m=>m&&Object.keys(m).length);if(!maps.length)return;const live=currentChangeKeys();for(const m of maps)for(const key of Object.keys(m))if(!live.has(key))delete m[key]}
function changeKind(key){return state.changeKinds?.[key]===CHANGE_KIND_READING?CHANGE_KIND_READING:'syllabus-edit'}
function setChangeKind(key,reading){
 state.changeKinds=state.changeKinds||{};
 if(reading)state.changeKinds[key]=CHANGE_KIND_READING;else delete state.changeKinds[key];
 recordHistory();updateEditorStatus()
}
function changeSummary(){
 if(!state.editorBaseline)return[];
 rebuildEditMutations();
 const b=state.editorBaseline,c=editorSnapshot(),groups=new Map;
 let currentKey='';
 const add=(section,item)=>{if(!groups.has(section))groups.set(section,[]);groups.get(section).push({...item,key:currentKey,kind:changeKind(currentKey),finding:state.changeFindings?.[currentKey]||null})};
 const byId=arr=>new Map((arr||[]).map((x,i)=>[x.editorId||`index-${i}`,x]));
 const verb={add:'Added',remove:'Removed',update:'Changed'};
 const facultyText=f=>f?[clean(f.name),clean(f.email),f.role==='coordinator'?'Coordinator':'Course faculty'].filter(Boolean).join(' · '):'';
 // Built from comparableGrade, the same fields the change count compares, so a
 // counted change (type, name, date, or weight) always shows in the text.
 const gradeText=g=>{const x=comparableGrade(g);return x?`${x.label||'Grade item'} · ${x.type||'(no type)'} · ${x.date?`date ${x.date}`:'(no date)'} · ${x.pct}%`:''};
 const scheduleText=e=>e?[clean(e.date),clean(e.day),clean(e.time),clean(e.topic),clean(e.faculty)].filter(Boolean).join(' · '):'';
 const cloText=x=>x?`${x.clo}${x.pslos.length?` → PSLO ${x.pslos.join(', ')}`:''}`:'';
 const policyLabel=k=>k==='courseEvaluation'?'Course evaluation narrative':(SECTION_RULES.find(r=>r.key===k)?.label||k);
 const courseLabels={code:'Course code',title:'Course title',year:'Year',location:'Location'};
 const bf=byId(b.faculty),cf=byId(c.faculty),bg=byId(b.grading),cg=byId(c.grading),bs=byId(b.schedule),cs=byId(c.schedule);
 const bclo=new Map(cloRows(b).map(x=>[x.editorId,x])),cclo=new Map(cloRows(c).map(x=>[x.editorId,x]));
 for(const m of state.editMutations||[]){
  currentKey=m.key;
  const both=(bm,cm,fmt)=>({before:fmt(bm.get(m.id)),after:fmt(cm.get(m.id))});
  if(m.section==='course')add('Course information',{action:'Changed',what:courseLabels[m.field]||m.field,before:clean(b.course?.[m.field]),after:clean(c.course?.[m.field])});
  else if(m.section==='faculty')add('Coordinator & course faculty',{action:verb[m.action],what:clean((cf.get(m.id)||bf.get(m.id))?.name)||'Faculty member',...both(bf,cf,facultyText)});
  else if(m.section==='clo')add('Course learning outcomes',{action:verb[m.action],what:((cclo.get(m.id)||bclo.get(m.id))?.clo.match(/^CLO\s*\d+/i)||['Course learning outcome'])[0],...both(bclo,cclo,cloText)});
  else if(m.section==='grading')add('Grading',{action:verb[m.action],what:clean((cg.get(m.id)||bg.get(m.id))?.label)||'Grade item',...both(bg,cg,gradeText)});
  else if(m.section==='schedule'){const e=cs.get(m.id)||bs.get(m.id);add('Course schedule',{action:verb[m.action],what:[clean(e?.date),clean(e?.topic)].filter(Boolean).join(' · ')||'Schedule event',...both(bs,cs,scheduleText)})}
  else if(m.section==='policy')add('Policies and narrative sections',{action:'Changed',what:policyLabel(m.field),before:clean(b.policies?.[m.field]),after:clean(c.policies?.[m.field])});
 }
 for(const mu of activeStructuredMutations()){
  currentKey=mu.key;
  const section=structuredTableTitle(mu.tableType),cells=r=>(r?.cells||[]).map(tableCellValue).filter(Boolean).join(' | ');
  if(mu.action==='update-cell'){const head=clean(baselineTable(mu.tableIndex)?.headers?.[mu.sourceColumnIndex])||`Column ${(mu.sourceColumnIndex??0)+1}`;add(section,{action:'Changed',what:`Row ${mu.sourceRowIndex??'?'}, ${head}`,before:mu.originalValue||'',after:mu.newValue||''})}
  else if(mu.action==='add-row')add(section,{action:'Added',what:'New row',before:'',after:cells(mu.row)});
  else if(mu.action==='remove-row')add(section,{action:'Removed',what:`Row ${mu.sourceRowIndex??'?'}`,before:cells(mu.row),after:''});
 }
 return [...groups].map(([section,items])=>({section,items}))
}
function changeCountsText(n,reading,fixes){const e=n-reading;return `${n} change${n===1?'':'s'} compared with what SyllabusBridge read from <strong>${esc(state.sourceName)}</strong>: ${e} syllabus edit${e===1?'':'s'}, ${reading} reading correction${reading===1?'':'s'}.${fixes?` ${fixes} ${fixes===1?'was':'were'} made to fix a report finding.`:''}`}
function renderChangeSummary(el,{interactive=false}={}){
 const groups=changeSummary(),items=groups.flatMap(g=>g.items),n=items.length;
 const text=v=>v?esc(v).replace(/\n/g,'<br>'):'<span class="muted">(blank)</span>';
 if(!n){el.innerHTML='<p class="muted">No changes. Everything still matches what SyllabusBridge read from the Word syllabus.</p>';return n}
 const reading=items.filter(i=>i.kind===CHANGE_KIND_READING).length,fixes=items.filter(i=>i.finding).length;
 // A fix for a finding (v2.3) is still a syllabus edit or a reading correction; the link is shown with it.
 const fixLabel=i=>i.finding?`<div class="sb-fix-link">Fix for a finding: ${esc(i.finding.title)}</div>`:'';
 const kindCell=i=>(interactive
  ?`<label class="sb-kind"><input type="checkbox" class="sb-kind-reading" data-change-key="${esc(i.key)}"${i.kind===CHANGE_KIND_READING?' checked':''}> SyllabusBridge misread this</label>`
  :(i.kind===CHANGE_KIND_READING?'Reading correction':'Syllabus edit'))+fixLabel(i);
 el.innerHTML=`<p class="muted sb-change-counts">${changeCountsText(n,reading,fixes)}</p>`
  +(interactive?'<p class="muted sb-kind-help">Every change counts as a syllabus edit. Tick <strong>SyllabusBridge misread this</strong> when the Word file was right and you only corrected how SyllabusBridge read it. Reading corrections are never written into the Word syllabus.</p>':'')
  +groups.map(g=>`<section class="sb-change-group"><h3>${esc(g.section)} <span class="pill">${g.items.length}</span></h3><div class="ft-table-wrap"><table class="ft-table sb-change-table"><thead><tr><th scope="col">Change</th><th scope="col">Item</th><th scope="col">Before</th><th scope="col">After</th><th scope="col">Kind</th></tr></thead><tbody>${g.items.map(i=>`<tr><td><span class="pill sb-change-${i.action.toLowerCase()}">${esc(i.action)}</span></td><td>${esc(i.what)}</td><td>${i.action==='Added'?'<span class="muted">(new)</span>':text(i.before)}</td><td>${i.action==='Removed'?'<span class="muted">(removed)</span>':text(i.after)}</td><td>${kindCell(i)}</td></tr>`).join('')}</tbody></table></div></section>`).join('');
 if(interactive)el.querySelectorAll('.sb-kind-reading').forEach(box=>box.onchange=()=>{
  setChangeKind(box.dataset.changeKey,box.checked);
  const counts=el.querySelector('.sb-change-counts');
  if(counts)counts.innerHTML=changeCountsText(n,Object.keys(state.changeKinds||{}).length,fixes);
  const st=$('historyStatus');if(st)st.textContent=box.checked?'Marked as a reading correction.':'Marked as a syllabus edit.'
 });
 return n
}
function openChangeSummary(){renderChangeSummary($('changeSummaryBody'),{interactive:true});FTDialog.manage($('changeSummaryDialog')).open($('reviewChanges'))}
function renderReport(){renderChangeSummary($('reportChangesBody'));const rs=validate(),counts={passed:0,warning:0,issue:0,'not-evaluated':0};rs.forEach(x=>counts[x.status]++);$('passedCount').textContent=counts.passed;$('warningCount').textContent=counts.warning;$('issueCount').textContent=counts.issue;$('neCount').textContent=counts['not-evaluated'];const evaluated=rs.filter(x=>x.evaluated).length,total=rs.length,pct=Math.round(evaluated/total*100);$('coverageText').textContent=`${evaluated} of ${total} checks completed`;$('coverageBar').style.width=pct+'%';$('coverageNote').textContent=`${pct}% validation coverage. Not evaluated checks are excluded from pass/fail interpretation.`;$('reportTitle').textContent=`${state.course.code||'Course'} syllabus validation report`;$('reportSubtitle').textContent=`${state.sourceName} · SyllabusBridge v2.1.2`;const policy=policyProfile();$('reportPolicy').textContent=policy?`Checked against ${policyName(policy)}.`:'No syllabus policy profile was loaded; policy wording was not checked.';const filters=$('filters');filters.innerHTML='';[['all','All'],['passed','Passed'],['warning','Warnings'],['issue','Issues'],['not-evaluated','Not evaluated']].forEach(([v,l],i)=>{const b=document.createElement('button');b.className='sb-btn ft-btn filter'+(i===0?' active':'');b.textContent=l;b.onclick=()=>{document.querySelectorAll('.filter').forEach(x=>x.classList.remove('active'));b.classList.add('active');renderResults(v)};filters.appendChild(b)});renderValidationNav();renderResults('all')}
function renderValidationNav(){const nav=$('validationNav');if(!nav)return;nav.innerHTML='<h2>Validation checks</h2>';const icons={passed:'✓',warning:'⚠',issue:'✕','not-evaluated':'—'},labels={passed:'Passed',warning:'Warning',issue:'Issue','not-evaluated':'Not evaluated'};let last='';state.results.forEach(r=>{if(r.category!==last){const c=document.createElement('div');c.className='nav-category';c.textContent=r.category;nav.appendChild(c);last=r.category}const a=document.createElement('a');a.href='#check-'+r.id;a.setAttribute('aria-label',`${r.title}: ${labels[r.status]}`);a.innerHTML=`<span class="check-icon ${r.status}" aria-hidden="true">${icons[r.status]}</span><span>${esc(r.title)}</span>`;a.onclick=e=>{e.preventDefault();document.getElementById('check-'+r.id)?.scrollIntoView({behavior:'smooth',block:'start'})};nav.appendChild(a)})}
function renderResults(filter){const host=$('results');host.innerHTML='';const icon={passed:'✓',warning:'!',issue:'×','not-evaluated':'?'};const cls={passed:'passed',warning:'warning-status',issue:'issue','not-evaluated':'not-evaluated'};state.results.filter(r=>filter==='all'||r.status===filter).forEach(r=>{const d=document.createElement('div');d.className=`soft result ${cls[r.status]}`;d.id='check-'+r.id;const links=linkedChanges(r.id),fixable=(r.status==='warning'||r.status==='issue')&&fixTarget(r.id),fix=(links&&r.status==='passed'?`<div class="sb-resolved"><span aria-hidden="true">✓</span> Resolved by your edit${links===1?'':'s'}</div>`:'')+(links&&r.status!=='passed'?`<div class="muted sb-fix-note">${links} change${links===1?' was':'s were'} made for this finding; it still needs attention.</div>`:'')+(fixable?`<div class="no-print sb-fix-row"><button type="button" class="sb-btn ft-btn sb-fix" aria-label="Fix this: ${esc(r.title)}">Fix this</button></div>`:'');d.innerHTML=`<div class="status-icon">${icon[r.status]}</div><div><div class="category">${esc(r.category)}</div><h2>${esc(r.title)}</h2><div>${esc(r.summary)}</div><div class="evidence"><strong>Evidence:</strong> ${esc(r.evidence)}</div><div class="action"><strong>Suggested action:</strong> ${esc(r.action)}</div>${fix}</div><span class="pill">${r.status==='not-evaluated'?'Not evaluated':r.status[0].toUpperCase()+r.status.slice(1)}</span>`;d.querySelector('.sb-fix')?.addEventListener('click',()=>startFix(r.id));host.appendChild(d)})}
// "Fix this" (v2.3). Each finding in the report links to the editor field that
// fixes it. While fixing, every change made or altered is linked to that finding
// (state.changeFindings maps a change's key to {id,title}). A link belongs to a
// change that exists now, like a reading-correction mark. After revalidating, a
// finding that passes and has linked changes shows "Resolved by your edit".
function fixTarget(id){
 const own=(state.results||[]).find(x=>x.id===id)?.fixAt;if(own)return $(own.anchor)?own:null;
 const card=k=>({anchor:'review-'+k,focus:[`#review-${k} textarea`]});
 const scale=(state.structuredTables||[]).find(t=>t.type==='gradingScale'),scaleTarget=scale?{anchor:`review-structured-${scale.tableIndex}`,focus:[`#review-structured-${scale.tableIndex} textarea`,`#review-structured-${scale.tableIndex} .add-structured-row`]}:null;
 const faculty={anchor:'review-faculty',focus:['#facultyList .f-name','#addFacultyRow']},clos={anchor:'review-clos',focus:['#review-clos .clo-text','#addCloRow']},mapping={anchor:'review-clos',focus:['#review-clos .clo-map','#addCloRow']};
 const schedule={anchor:'review-schedule',focus:['#scheduleBody .sb-schedule-invalid .s-date','#scheduleBody .s-date','#addScheduleRow']},evaluation={anchor:'review-assessments',focus:['#courseEvaluationText']},course=f=>({anchor:'review-course-info',focus:['#'+f]});
 const map={'section-description':card('description'),'section-clos':clos,'section-plos':mapping,'clo-pslo':mapping,
  'section-coordinator':faculty,'section-faculty':faculty,'coordinator-record':faculty,'faculty-consistency':faculty,'faculty-contact-completeness':{anchor:'review-faculty',focus:['#facultyList .f-email','#addFacultyRow']},
  'section-timeLocation':course('courseLocation'),'course-code':course('courseCode'),'course-title':course('courseTitle'),'course-year':course('courseYear'),
  'section-grading':scaleTarget,'policy-grading-scale':scaleTarget,'section-assessment':evaluation,'evaluation-narrative':evaluation,'grading-total':{anchor:'review-assessments',focus:['#gradeGrid .grade-weight','#addGradeRow']},
  'section-schedule':schedule,'schedule-internal':schedule,'schedule-handoff-dates':schedule,'schedule-dates':schedule,'academic-integrity-reference':card('coursePolicies')};
 for(const k of ['materials','hardware','accessibility','engagement','programAssessment','coursePolicies','attendance','assessmentPolicy','absence','incomplete'])map['section-'+k]=card(k);
 const check=(policyProfile()?.contentChecks||[]).find(c=>'policy-'+c.id===id);
 const t=check?.fixField?card(check.fixField):map[id];
 return t&&$(t.anchor)?t:null
}
function fixSignatures(){const out=new Map;for(const g of changeSummary())for(const i of g.items)out.set(i.key,JSON.stringify([i.action,i.before,i.after]));return out}
function linkFixEdits(){
 const f=state.activeFix;if(!f)return;
 state.changeFindings=state.changeFindings||{};
 // Compare with the state when Fix this was clicked (never updated), so a change undone and typed again is linked again.
 for(const [key,sig] of fixSignatures())if(f.start.get(key)!==sig&&state.changeFindings[key]?.id!==f.id)state.changeFindings[key]={id:f.id,title:f.title}
}
function linkedChanges(id){return Object.values(state.changeFindings||{}).filter(x=>x.id===id).length}
function startFix(id){
 const r=(state.results||[]).find(x=>x.id===id),t=fixTarget(id);if(!r||!t)return;
 go('review');
 state.activeFix={id:r.id,title:r.title,start:fixSignatures()};showFixContext();
 document.querySelectorAll('.sb-fix-target').forEach(x=>x.classList.remove('sb-fix-target'));
 const el=$(t.anchor);el.classList.add('sb-fix-target');
 // A focus entry is a selector; "selector@n" means its nth match (a CLO or schedule row).
 const pick=x=>{const m=x.match(/^(.*)@(\d+)$/);return m?document.querySelectorAll(m[1])[+m[2]]:document.querySelector(x)};
 const field=t.focus.map(pick).find(Boolean);field?.focus({preventScroll:true});
 // Select the placeholder text the finding points at, so it can be typed over.
 const want=r.fixSelect&&field&&'value' in field?field.value.toLowerCase().indexOf(String(r.fixSelect).toLowerCase()):-1;if(want>=0)field.setSelectionRange(want,want+r.fixSelect.length);
 const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
 // Scroll the field to just below the sticky status bar (which now shows the Fixing note).
 requestAnimationFrame(()=>{const bar=$('editorStatus'),cs=getComputedStyle(bar),offset=cs.position==='sticky'?(parseFloat(cs.top)||0)+bar.offsetHeight+12:100;window.scrollTo({top:Math.max(0,el.getBoundingClientRect().top+window.scrollY-offset),behavior:reduce?'auto':'smooth'})})
}
function endFix(){if(!state.activeFix)return;state.activeFix=null;document.querySelectorAll('.sb-fix-target').forEach(x=>x.classList.remove('sb-fix-target'));showFixContext()}
function updateFixCount(){const el=$('fixLinkedCount'),f=state.activeFix;if(!el||!f)return;const n=linkedChanges(f.id);el.textContent=n?`${n} change${n===1?'':'s'} linked so far.`:''}
function showFixContext(message=''){
 const el=$('fixContext');if(!el)return;const f=state.activeFix;
 el.hidden=!f;if(!f){el.innerHTML='';return}
 el.innerHTML=`<div><strong>Fixing: ${esc(f.title)}</strong><div class="muted">Changes you make now are linked to this finding and marked “Fix for a finding” in the change summary. <span id="fixLinkedCount"></span></div>${message?`<div class="sb-fix-status">${message}</div>`:''}</div><div class="row"><button type="button" class="sb-btn ft-btn" id="fixDone">Revalidate and return to report</button><button type="button" class="sb-btn ft-btn" id="fixStop">Stop linking changes</button></div>`;
 updateFixCount();
 $('fixDone').onclick=()=>$('runValidation').click();
 $('fixStop').onclick=()=>{endFix();const st=$('historyStatus');if(st)st.textContent='Changes are no longer linked to a finding.'}
}
// After "Revalidate now" while fixing, say whether the finding now passes.
function showFixOutcome(){
 const f=state.activeFix;if(!f)return;const r=(state.results||[]).find(x=>x.id===f.id);if(!r)return;
 showFixContext(r.status==='passed'?(linkedChanges(f.id)?'<span aria-hidden="true">✓</span> This finding now passes. Resolved by your edit.':'<span aria-hidden="true">✓</span> This finding now passes.'):`Still needs attention: ${esc(r.summary)}`)
}
function go(step){if(step!=='review')endFix();['upload','review','report'].forEach(s=>$('screen-'+s).classList.toggle('active',s===step));document.querySelectorAll('.sb-step').forEach(b=>{const target=b.dataset.step,available=target==='upload'||state.lines.length>0;b.classList.toggle('active',target===step);b.classList.toggle('done',(target==='upload'&&state.lines.length>0)||(target==='review'&&state.reviewComplete));b.setAttribute('aria-disabled',available?'false':'true');if(target===step)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current')});if(step==='review')requestAnimationFrame(()=>document.querySelectorAll('#editors textarea').forEach(autoGrow));const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;window.scrollTo({top:0,behavior:reduce?'auto':'smooth'})}
function resetState(){state={sourceName:'',lines:[],sections:[],course:{code:'',title:'',year:'',location:''},faculty:[],coordinator:null,clos:[],plos:[],cloMappings:[],meetingPatterns:[],assessments:[],policies:{},schedule:[],grading:[],rawTables:[],structuredTables:[],assignmentTables:[],supplementalTables:[],redText:[],results:[],extraction:{scheduleFailures:[],scheduleCandidates:0,cloCandidates:0},dirty:false,reviewComplete:false,editorBaseline:null,tableMutations:[],editMutations:[],cloEditorIds:[]};}

function showLoading(on,text,pct){$('loading').classList.toggle('show',on);if(text)$('loadingText').textContent=text;$('bar').style.width=(pct||0)+'%'}function showError(msg,title='Word syllabus required'){$('uploadError').classList.add('show');$('uploadError').innerHTML=`<strong>${esc(title)}</strong><br>${esc(msg).replace(/\n/g,'<br>')}`}function clearError(){$('uploadError').classList.remove('show');$('uploadError').innerHTML=''}
// Unaccepted tracked changes (v2.2). Many syllabi, including the approved
// template, still carry Word tracked changes nobody accepted or rejected.
// SyllabusBridge reads them as if accepted, but later Word export can't safely
// edit those paragraphs, so faculty are told how to clear them. This reads the
// file on its own and never changes how the syllabus is parsed.
async function trackedChangesIn(file){
 try{
  const zip=await JSZip.loadAsync(file),xml=await zip.file('word/document.xml')?.async('string');
  if(!xml)return{changes:0,paragraphs:0};
  const marks=/<w:(?:ins|del|moveFrom|moveTo)\b[^>]*?(?:\/>|>)/g;
  const changes=(xml.match(marks)||[]).length;
  let paragraphs=0;for(const p of xml.match(/<w:p\b[^>]*?(?:\/>|>[\s\S]*?<\/w:p>)/g)||[])if(/<w:(?:ins|del|moveFrom|moveTo)\b/.test(p))paragraphs++;
  return{changes,paragraphs}
 }catch(e){return{changes:0,paragraphs:0}}
}
function trackedChangesMessage(t){
 const n=t.changes,p=t.paragraphs;
 return`This syllabus has <strong>${n} unaccepted tracked change${n===1?'':'s'}</strong>${p?` in ${p} paragraph${p===1?'':'s'}`:''}. Word shows them as colored, underlined, or crossed-out text. SyllabusBridge reads the syllabus as if every change were accepted, but <strong>Export edited Word syllabus</strong> cannot safely change those paragraphs; edits there are listed for you to make by hand.<br><strong>To clear them:</strong> in Word, open the <strong>Review</strong> tab, choose <strong>Accept ▸ Accept All Changes</strong> (or <strong>Reject ▸ Reject All Changes</strong>), save, and upload the file again. You can also keep working with this file.`
}
function showTrackedChanges(){
 const t=state.trackedChanges,has=!!t?.changes;
 for(const id of ['trackedChangesNotice','reportTrackedChanges']){const el=$(id);if(!el)continue;el.hidden=!has;el.innerHTML=has?trackedChangesMessage(t):''}
}
// Word export (v2.5). "Export edited Word syllabus" writes the syllabus edits into a
// NEW copy of the original Word file, each as a Word tracked change by "SyllabusBridge"
// that faculty accept or reject in Word. Reading corrections are never written.
// Each change below says where in the Word file it belongs (docx-export.js explains
// the target kinds). Anything that can't be placed safely is listed for faculty to
// make by hand; nothing is dropped silently. The original file is never changed.
const DOCX_TYPE='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
let wordExport=null;
function exportManual(reason){return[{type:'manual',reason}]}
function lastWordRow(tableIndex){return Math.max(0,(state.rawTables?.[tableIndex]?.length||1)-1)}
// Where a new table row goes: after the nearest row above it that came from the Word
// file, or after the table's last row when nothing from the file follows it.
function exportRowPosition(rows,index,tableIndex,sourceRow){
 const later=rows.slice(index+1).some(r=>sourceRow(r)!=null);
 if(!later)return lastWordRow(tableIndex);
 for(let k=index-1;k>=0;k--){const s=sourceRow(rows[k]);if(s!=null)return s}
 return 0
}
function cellLinesOf(cell){return cell?(cell.lines?.length?[...cell.lines]:[clean(cell.text)]):[]}
function structuredExportTargets(mu){
 const t=mu.tableIndex,base=baselineTable(t),cur=canonicalTable(t);
 const addRow=row=>{
  const rows=cur?.rows||[],i=rows.indexOf(row);if(!row||i<0)return exportManual('SyllabusBridge could not find this new row in its table.');
  const n=Math.max(0,...(row.cells||[]).map(c=>(c.columnIndex??0)+1)),cells=Array.from({length:n},(_,ci)=>tableCellValue((row.cells||[]).find(c=>c.columnIndex===ci)));
  return[{type:'add-row',tableIndex:t,afterRowIndex:exportRowPosition(rows,i,t,r=>r.rowIndex),order:i,id:row.editorRowId,cells}]
 };
 if(mu.action==='add-row'||(mu.action==='update-cell'&&mu.sourceRowIndex==null))return addRow((cur?.rows||[]).find(r=>r.editorRowId===mu.editorRowId));
 if(mu.action==='remove-row'){const cells=[];for(const c of mu.row?.cells||[])cells[c.columnIndex??cells.length]=cellLinesOf(c);return[{type:'delete-row',tableIndex:t,rowIndex:mu.sourceRowIndex,before:Array.from(cells,x=>x||[])}]}
 const cellIn=table=>((table?.rows||[]).find(r=>r.rowIndex===mu.sourceRowIndex)?.cells||[]).find(c=>c.columnIndex===mu.sourceColumnIndex);
 const before=cellIn(base),after=cellIn(cur);
 if(!before||!after)return exportManual('SyllabusBridge could not find this table cell in the Word file.');
 return[{type:'cell',tableIndex:t,rowIndex:mu.sourceRowIndex,columnIndex:mu.sourceColumnIndex,before:cellLinesOf(before),after:cellLinesOf(after)}]
}
const bodyLineIndexes=()=>{const table=new Set(state.tableLineIndexes||[]);return(state.lines||[]).map((_,i)=>i).filter(i=>!table.has(i))};
function wordExportTargets(key){
 const b=state.editorBaseline,c=editorSnapshot(),mu=activeStructuredMutations().find(m=>m.key===key);
 if(mu)return structuredExportTargets(mu);
 const [section,...rest]=key.split(':'),id=rest.join(':'),lines=state.lines||[];
 const blankBefore=label=>exportManual(`SyllabusBridge did not read ${label} from the Word file, so there is no place to put the new text. Add it in Word.`);
 if(section==='course'){
  const label={code:'a course code',title:'a course title',location:'a location'}[id];
  if(id==='year')return exportManual('SyllabusBridge works out the year from the file name or the syllabus heading, so it cannot tell which words to change. Change the year by hand in Word.');
  const from=b.course?.[id],to=c.course?.[id];if(!clean(from))return blankBefore(label);
  let at=[];
  if(id==='code'||id==='title'){let i=lines.findIndex(x=>/^[A-Z]{2,5}\s*\d{3,5}\s*[–-]\s*.+/i.test(x));if(i<0)i=lines.findIndex(x=>/^[A-Z]{2,5}\s*\d{3,5}\s+.+/i.test(x));if(i>=0)at=[i]}
  else{at=lines.slice(0,180).map((l,i)=>/^LOCATION\s*:\s*\S/i.test(clean(l))?i:-1).filter(i=>i>=0).slice(0,1);if(!at.length){const tl=lines.findIndex(x=>/^TIME AND LOCATION\s*:/i.test(clean(x)));if(tl>=0)for(let i=tl;i<=Math.min(lines.length-1,tl+12);i++)at.push(i)}}
  return[{type:'substitute',lines:at,from,to}]
 }
 if(section==='policy'){
  const key={courseEvaluation:'assessment'}[id]||id,range=sectionLineRange(key);
  if(!range&&!clean(b.policies?.[id])&&clean(c.policies?.[id]))return newSectionTargets(key,String(c.policies[id]).split('\n'));
  return[{type:'lines',start:range?range[0]:0,before:String(b.policies?.[id]??'').split('\n'),after:String(c.policies?.[id]??'').split('\n')}]
 }
 if(section==='faculty'){
  const bf=(b.faculty||[]).find(f=>f.editorId===id),cf=(c.faculty||[]).find(f=>f.editorId===id);
  if(!bf||!cf)return exportManual('SyllabusBridge cannot add or remove a whole faculty entry in the Word file yet. Make this change by hand in Word.');
  if((bf.role||'faculty')!==(cf.role||'faculty'))return exportManual('Moving someone between coordinator and course faculty changes where they are listed, which SyllabusBridge cannot do in the Word file yet. Make this change by hand in Word.');
  const out=[];
  for(const [k,label] of [['name','a name'],['email','an email address']])if(clean(bf[k])!==clean(cf[k])){if(!clean(bf[k]))return blankBefore(label);out.push({type:'substitute',lines:bodyLineIndexes(),from:bf[k],to:cf[k]})}
  return out
 }
 if(section==='clo'){
  const bc=cloRows(b).find(x=>x.editorId===id),cc=cloRows(c).find(x=>x.editorId===id);
  if(!bc||!cc)return exportManual('SyllabusBridge cannot add or remove a whole course learning outcome in the Word file yet. Make this change by hand in Word.');
  if(JSON.stringify(bc.pslos)!==JSON.stringify(cc.pslos))return exportManual('The PSLO mapping is in the Program Mapping table, which SyllabusBridge does not change in the Word file yet. Make this change by hand in Word.');
  const r=sectionLineRange('clos'),body=new Set(bodyLineIndexes()),at=[];if(r)for(let i=r[0];i<r[1];i++)if(body.has(i))at.push(i);
  return[{type:'substitute',lines:at,from:bc.clo,to:cc.clo}]
 }
 if(section==='grading'){
  const bg=(b.grading||[]).find(g=>g.editorId===id),cg=(c.grading||[]).find(g=>g.editorId===id);
  if(!bg||!cg)return exportManual('SyllabusBridge cannot add or remove a whole grading item in the Word file yet. Make this change by hand in Word.');
  const x=comparableGrade(bg),y=comparableGrade(cg);
  if(x.type!==y.type||x.date!==y.date)return exportManual('The type and date of a grading item are worked out by SyllabusBridge (for CalendarBridge); they are not written as such in the Word syllabus. Nothing in the Word file needs to change for them.');
  const bullet=s=>clean(s).replace(/^[•▪◦\-–—]\s*/,'');
  for(const [ti,rows] of (state.rawTables||[]).entries())for(const [ri,row] of rows.entries()){
   if(row.length<2||bullet(row[0]?.text)!==x.label||!(clean(row[1]?.text).match(/\d{1,3}(?:\.\d+)?/g)||[]).map(Number).includes(x.pct))continue;
   const out=[];if(x.label!==y.label)out.push({type:'cell-substitute',tableIndex:ti,rowIndex:ri,columnIndex:0,from:x.label,to:y.label});
   if(x.pct!==y.pct)out.push({type:'cell-substitute',tableIndex:ti,rowIndex:ri,columnIndex:1,from:String(x.pct),to:String(y.pct)});
   return out
  }
  return exportManual('SyllabusBridge could not find this grading item as its own row in a Word table, so it cannot place the change. Make it by hand in Word.')
 }
 if(section==='schedule'){
  const be=(b.schedule||[]).find(e=>e.editorId===id),ce=(c.schedule||[]).find(e=>e.editorId===id);
  if(be&&ce){
   const src=be.source;if(src?.tableIndex==null||src?.rowIndex==null)return exportManual('SyllabusBridge did not read this schedule entry from a table row, so it cannot place the change. Make it by hand in Word.');
   const out=[];
   for(const f of ['date','day','time','topic','faculty']){
    if(clean(be[f])===clean(ce[f]))continue;
    if(f==='day'){const t=scheduleDayTargets(be,ce,src);if(!t)return exportManual('SyllabusBridge could not tell which day to change in this row of the schedule table (the day is missing or appears more than once). Change the day by hand in Word.');out.push(...t);continue}
    const col=src.columnMap?.[f],what={date:'date',day:'day',time:'time',topic:'topic',faculty:'faculty'}[f];
    if(col==null)return exportManual(`The ${what} for this entry is not in its own column of the schedule table (SyllabusBridge filled it in from elsewhere), so it cannot place the change. Make it by hand in Word.`);
    const cell=((baselineTable(src.tableIndex)?.rows||[]).find(r=>r.rowIndex===src.rowIndex)?.cells||[]).find(x=>x.columnIndex===col);
    const cl=cellLinesOf(cell);
    if(!cl.some(l=>clean(l)))out.push({type:'cell',tableIndex:src.tableIndex,rowIndex:src.rowIndex,columnIndex:col,before:cl,after:[ce[f]]});
    else out.push({type:'cell-substitute',tableIndex:src.tableIndex,rowIndex:src.rowIndex,columnIndex:col,from:be[f],to:ce[f]})
   }
   return out
  }
  if(be){
   const src=be.source;if(src?.tableIndex==null||src?.rowIndex==null)return exportManual('SyllabusBridge did not read this schedule entry from a table row, so it cannot remove it. Remove it by hand in Word.');
   const same=e=>e.source?.tableIndex===src.tableIndex&&e.source?.rowIndex===src.rowIndex;
   if((c.schedule||[]).some(same))return exportManual('This table row also holds other schedule entries that you kept, so SyllabusBridge cannot remove only this one. Remove it by hand in Word.');
   const row=(baselineTable(src.tableIndex)?.rows||[]).find(r=>r.rowIndex===src.rowIndex),cells=[];for(const x of row?.cells||[])cells[x.columnIndex]=cellLinesOf(x);
   return[{type:'delete-row',tableIndex:src.tableIndex,rowIndex:src.rowIndex,before:Array.from(cells,x=>x||[])}]
  }
  if(ce){
   const sourced=(b.schedule||[]).filter(e=>e.source?.tableIndex!=null),t=primaryCourseScheduleTable()?.tableIndex??sourced[0]?.source.tableIndex;
   const map=sourced.find(e=>e.source.tableIndex===t)?.source.columnMap;
   if(t==null||t<0||!map)return exportManual('SyllabusBridge did not find a schedule table in the Word file to add this entry to. Add it by hand in Word.');
   const n=(state.rawTables?.[t]||[]).reduce((m,r)=>Math.max(m,r.length),0),cells=Array.from({length:n},()=>[]);
   // Every value typed for the new entry needs its own column in the Word table;
   // otherwise the whole entry is listed, never written with values missing. The
   // day is worked out from the date, so a table without a Day column may leave it out.
   const missing=[];
   for(const f of ['date','day','time','topic','faculty']){
    const v=clean(ce[f]),col=map[f];if(!v)continue;
    if(col!=null&&col<n)cells[col].push(v);
    else if(!(f==='day'&&v===dayFromDate(ce.date)))missing.push(f)
   }
   if(missing.length)return exportManual(`The schedule table in the Word file has no ${missing.join(missing.length===2?' or ':', ')} column, so SyllabusBridge cannot add this entry without leaving part of it out. Add it by hand in Word.`);
   const list=c.schedule||[],i=list.indexOf(list.find(e=>e.editorId===id));
   return[{type:'add-row',tableIndex:t,afterRowIndex:exportRowPosition(list,i,t,e=>e.source?.tableIndex===t?e.source.rowIndex:null),order:i,id,cells:cells.map(x=>x.join(' '))}]
  }
 }
 return exportManual('SyllabusBridge cannot place this kind of edit in the Word file yet. Make it by hand in Word.')
}
// A section the Word file does not have, written in the editor: it goes where the
// template puts it, at the end of the nearest earlier section the file does have,
// with its heading (unless the faculty member typed one) formatted like the next
// heading, and its text formatted like the earlier section's text.
function newSectionTargets(key,after){
 const rule=SECTION_RULES.find(r=>r.key===key),order=SECTION_RULES.map(r=>r.key),table=new Set(state.tableLineIndexes||[]),lines=state.lines||[];
 const label=rule?.label||key,manual=exportManual(`The Word file has no “${label}” section, and SyllabusBridge could not tell where it belongs. Add the heading and text by hand in Word.`);
 if(!rule)return manual;
 let prev=null;for(let k=order.indexOf(key)-1;k>=0&&!prev;k--){const r=sectionLineRange(order[k]);if(r)prev=r}
 if(!prev)return manual;
 const text=after.map(clean).filter(Boolean),typed=rule.patterns.some(p=>p.test(text[0]||''));
 const heading=typed?null:`${label.toUpperCase()}:`;
 let body=prev[0];for(let i=prev[0]+1;i<prev[1];i++)if(!table.has(i)){body=i;break}
 const end=prev[1];
 if(end<lines.length&&!table.has(end))return[{type:'new-section',before:end,heading,lines:text,headingLike:end,bodyLike:body,order:order.indexOf(key)}];
 if(!table.has(end-1))return[{type:'new-section',after:end-1,heading,lines:text,headingLike:prev[0],bodyLike:body,order:order.indexOf(key)}];
 return manual
}
// The day can be printed in the date cell ("Friday 2/13/26"), a Day column, or
// both, in full or short ("Fri"). Changing the date changes the day in every
// one of those cells, in the same form. If a cell names the old day more than
// once, it is not clear which to change, so the whole change is listed. A day
// printed nowhere, and worked out from the date, needs no change.
const DAY_FORMS={Monday:['Monday','Mon'],Tuesday:['Tuesday','Tues','Tue'],Wednesday:['Wednesday','Wed'],Thursday:['Thursday','Thurs','Thur','Thu'],Friday:['Friday','Fri'],Saturday:['Saturday','Sat'],Sunday:['Sunday','Sun']};
function scheduleDayTargets(be,ce,src){
 const cellOf=col=>cellLinesOf(((baselineTable(src.tableIndex)?.rows||[]).find(r=>r.rowIndex===src.rowIndex)?.cells||[]).find(x=>x.columnIndex===col));
 const target=col=>({tableIndex:src.tableIndex,rowIndex:src.rowIndex,columnIndex:col});
 const newForms=DAY_FORMS[ce.day]||null,out=[];
 for(const col of [...new Set([src.columnMap?.day,src.columnMap?.date].filter(x=>x!=null))]){
  const text=cellOf(col).join('\n');
  // Every form of the old day in this cell ("Friday" and "Fri" count together).
  const found=(DAY_FORMS[be.day]||[]).flatMap((form,i)=>(text.match(new RegExp(`\\b${form}\\b`,'gi'))||[]).map(m=>({m,i})));
  if(found.length>1)return null;
  if(!found.length)continue;
  const {m,i}=found[0];
  let to=newForms?(i===0?newForms[0]:newForms.at(-1)):'';
  if(m===m.toUpperCase())to=to.toUpperCase();
  out.push({type:'cell-substitute',...target(col),from:m,to})
 }
 if(out.length)return out;
 const dayCol=src.columnMap?.day;
 if(dayCol!=null){const cl=cellOf(dayCol);return cl.some(l=>clean(l))?null:[{type:'cell',...target(dayCol),before:cl,after:[ce.day]}]}
 return clean(ce.day)===dayFromDate(ce.date)?[]:null
}
function wordExportInput(){
 return{lines:state.lines||[],changes:changeSummary().flatMap(g=>g.items.map(i=>({...i,section:g.section,targets:wordExportTargets(i.key)})))}
}
function wordExportName(){return `${String(state.sourceName||'Syllabus.docx').replace(/\.docx$/i,'')||'Syllabus'}-SyllabusBridge-edits.docx`}
async function buildWordExport(){
 syncCourseFields();
 if(!state.sourceBytes)throw new Error('The original Word file is no longer available. Upload it again, then export.');
 const result=await SyllabusDocxExport.exportDocx(JSZip,SyllabusDocxWriter,state.sourceBytes,wordExportInput(),{tracked:true,author:'SyllabusBridge'});
 return{...result,name:wordExportName()}
}
function renderWordExport(r){
 const body=$('wordExportBody'),btn=$('downloadWord'),n=r.placed.length,k=r.unplaced.length,m=r.skipped.length,s=x=>x===1?'':'s';
 const text=v=>v?esc(v).replace(/\n/g,'<br>'):'<span class="muted">(blank)</span>';
 let html=`<p>SyllabusBridge writes your syllabus edits into a <strong>new copy</strong> of <strong>${esc(state.sourceName)}</strong>, named <strong>${esc(r.name)}</strong>. Each edit appears in Word as a <strong>tracked change</strong> by “SyllabusBridge”. Your original file is not changed.</p><ul class="sb-export-counts">`
  +`<li><span class="check-icon passed" aria-hidden="true">✓</span> <span><strong>${n} syllabus edit${s(n)}</strong> will be written as tracked changes.</span></li>`
  +(m?`<li><span class="check-icon not-evaluated" aria-hidden="true">—</span> <span><strong>${m} reading correction${s(m)}</strong> ${m===1?'is':'are'} not written: the Word file was already right there.</span></li>`:'')
  +(k?`<li><span class="check-icon warning" aria-hidden="true">!</span> <span><strong>${k} syllabus edit${s(k)} could not be placed</strong> safely. Make ${k===1?'it':'them'} by hand in Word (listed below).</span></li>`:'')+'</ul>';
 if(k)html+=`<section class="sb-export-unplaced" aria-labelledby="wordExportUnplacedTitle"><h3 id="wordExportUnplacedTitle">Make these by hand in Word</h3><div class="ft-table-wrap"><table class="ft-table sb-change-table"><thead><tr><th scope="col">Item</th><th scope="col">Before</th><th scope="col">After</th><th scope="col">Why it was not placed</th></tr></thead><tbody>${r.unplaced.map(({change:c,reason})=>`<tr><td><div class="muted">${esc(c.section)}</div>${esc(c.action)}: ${esc(c.what)}</td><td>${c.action==='Added'?'<span class="muted">(new)</span>':text(c.before)}</td><td>${c.action==='Removed'?'<span class="muted">(removed)</span>':text(c.after)}</td><td>${esc(reason)}</td></tr>`).join('')}</tbody></table></div></section>`;
 if(state.trackedChanges?.changes)html+=`<div class="notice warning">This syllabus already had ${state.trackedChanges.changes} unaccepted tracked change${s(state.trackedChanges.changes)} from before. SyllabusBridge does not change those paragraphs; edits there are in the list above. They stay in the new copy for you to accept or reject.</div>`;
 if(n)html+='<p class="muted">Next: open the new file in Word. On the <strong>Review</strong> tab, use <strong>Next</strong> to go through each change and choose <strong>Accept</strong> or <strong>Reject</strong>. Keep your SyllabusBridge project too, in case you want to export again.</p>';
 else html+=`<div class="notice info">${r.placed.length+k?'None of your syllabus edits could be placed in the Word file, so there is nothing to download. Make the edits listed above by hand in Word.':m?'All your changes are reading corrections, which are never written into the Word file, so there is nothing to download.':'You have not made any syllabus edits yet, so there is nothing to export.'}</div>`;
 body.innerHTML=html+'<p class="sb-export-done" id="wordExportDone" role="status"></p>';
 btn.disabled=!n
}
async function openWordExport(opener){
 const body=$('wordExportBody'),btn=$('downloadWord');
 wordExport=null;btn.disabled=true;body.innerHTML='<p class="muted" role="status">Preparing the edited Word syllabus…</p>';
 FTDialog.manage($('wordExportDialog')).open(opener);
 try{wordExport=await buildWordExport();renderWordExport(wordExport)}
 catch(e){console.error(e);body.innerHTML=`<div class="notice error" role="alert"><strong>The edited Word syllabus could not be made.</strong><br>${esc(e?.message||'Unknown error')}<br>Your edits are still here. Save your SyllabusBridge project, then try again or send a screenshot of this message to the FacultyBridge project owner.</div>`}
}
function downloadWordExport(){
 if(!wordExport?.placed.length)return;
 downloadText(wordExport.bytes,wordExport.name,DOCX_TYPE);
 const done=$('wordExportDone'),k=wordExport.unplaced.length;
 if(done)done.textContent=`Downloaded ${wordExport.name}.${k?` Remember the ${k} edit${k===1?'':'s'} to make by hand, listed above.`:''}`
}
// SyllabusBridge project files (v2.2). A project saves the structured editor's
// work so faculty can close the browser and continue later. It records which
// Word file it belongs to (name, size, SHA-256 fingerprint); reopening asks for
// that Word file again, reads it fresh, then puts the saved edits back. Edit
// locations only make sense against that exact file (see
// docs/SYLLABUSBRIDGE-ROUNDTRIP.md), so a different file gets a warning first.
// Format 2 (v2.2) adds changeKinds. Format 1 files still open; their changes are syllabus edits.
// Format 3 (v2.3) adds changeFindings (changes made from a report finding's "Fix this").
// Format 1 and 2 files still open, with no changes linked to findings.
const PROJECT_FORMAT='SyllabusBridge project',PROJECT_FORMAT_VERSION=3;
let pendingProject=null;
const projectWork=FTUnsavedWork.track(()=>state.dirty?JSON.stringify(historySnapshot()):null);
function toolVersion(){return (window.FacultyBridgeBuild?.tools||[]).find(t=>t.id==='syllabusbridge')?.version||'2.1.2'}
async function fileFingerprint(file){
 const size=file.size;
 try{if(!globalThis.crypto?.subtle)return{sha256:null,size};const buf=await file.arrayBuffer(),hash=await crypto.subtle.digest('SHA-256',buf);return{sha256:[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join(''),size}}
 catch(e){return{sha256:null,size}}
}
function buildProject(){
 syncCourseFields();
 return{format:PROJECT_FORMAT,formatVersion:PROJECT_FORMAT_VERSION,savedAt:new Date().toISOString(),
  savedBy:{tool:'SyllabusBridge',version:toolVersion(),suiteVersion:window.FacultyBridgeBuild?.suiteVersion||''},
  source:{fileName:state.sourceName,size:state.sourceFingerprint?.size??null,sha256:state.sourceFingerprint?.sha256??null},
  editor:historySnapshot().editor,tableMutations:structuredClone(state.tableMutations||[]),changeKinds:(pruneChangeKinds(),structuredClone(state.changeKinds||{})),changeFindings:structuredClone(state.changeFindings||{}),baseline:structuredClone(state.editorBaseline)}
}
function saveProject(){
 if(!state.lines.length)return;
 const project=buildProject(),base=(state.course.code||state.sourceName.replace(/\.docx$/i,'')||'Syllabus').replace(/[^\w.-]+/g,'_'),name=`${base}-SyllabusBridge-project.json`;
 downloadText(JSON.stringify(project,null,2),name);projectWork.markSaved();
 const st=$('historyStatus');if(st)st.textContent=`Project saved as ${name}. Keep it with the Word syllabus; reopening needs both.`
}
// Checks every saved field SyllabusBridge will use, before anything on screen
// changes. Returns a plain description of the first problem, or ''.
const PROJECT_EDITOR_FIELDS=['course','faculty','coordinator','clos','cloMappings','plos','grading','assessments','policies','schedule','meetingPatterns','structuredTables','cloEditorIds'];
function projectDataProblem(obj){
 const isObj=v=>!!v&&typeof v==='object'&&!Array.isArray(v),isStr=v=>typeof v==='string',optStr=v=>v===undefined||v===null||isStr(v);
 const isInt=v=>Number.isInteger(v),strings=v=>Array.isArray(v)&&v.every(isStr);
 const objsWith=(v,check)=>Array.isArray(v)&&v.every(x=>isObj(x)&&check(x));
 const e=obj.editor;
 const cell=c=>isObj(c)&&isInt(c.columnIndex)&&isStr(c.text)&&(c.lines===undefined||strings(c.lines));
 const row=r=>isObj(r)&&(r.rowIndex===null||r.rowIndex===undefined||isInt(r.rowIndex))&&(r.rowIndex!=null||isStr(r.editorRowId))&&optStr(r.editorRowId)&&Array.isArray(r.cells)&&r.cells.every(cell);
 const checks=[
  ['course details',()=>isObj(e.course)&&['code','title','year','location'].every(k=>optStr(e.course[k]))],
  ['faculty',()=>objsWith(e.faculty,f=>isStr(f.name)&&['email','short','role','editorId'].every(k=>optStr(f[k])))&&(e.coordinator===null||e.coordinator===undefined||isObj(e.coordinator))],
  ['course learning outcomes',()=>strings(e.clos)&&strings(e.plos||[])&&strings(e.cloEditorIds||[])&&objsWith(e.cloMappings||[],m=>optStr(m.clo)&&(m.pslos===undefined||strings(m.pslos)))],
  ['grading',()=>objsWith(e.grading,g=>optStr(g.label)&&(g.pct===undefined||typeof g.pct==='number'))&&objsWith(e.assessments||[],()=>true)],
  ['course policies',()=>e.policies===undefined||isObj(e.policies)&&Object.values(e.policies).every(v=>isStr(v)||typeof v==='boolean')],
  ['course schedule',()=>objsWith(e.schedule,x=>['date','day','time','topic','faculty','raw','editorId'].every(k=>optStr(x[k]))&&(x.source===undefined||x.source===null||isObj(x.source)))&&objsWith(e.meetingPatterns||[],()=>true)],
  ['structured tables',()=>objsWith(e.structuredTables,t=>isInt(t.tableIndex)&&isStr(t.type)&&strings(t.headers||[])&&Array.isArray(t.rows)&&t.rows.every(row))],
  ['kinds of change',()=>obj.changeKinds===undefined||isObj(obj.changeKinds)&&Object.entries(obj.changeKinds).every(([k,v])=>isStr(k)&&v===CHANGE_KIND_READING)],
  ['links to findings',()=>obj.changeFindings===undefined||isObj(obj.changeFindings)&&Object.values(obj.changeFindings).every(v=>isObj(v)&&isStr(v.id)&&isStr(v.title))],
  ['change records',()=>objsWith(obj.tableMutations,m=>isStr(m.key)&&['update-cell','add-row','remove-row'].includes(m.action)&&isInt(m.tableIndex)&&(m.action!=='add-row'||isStr(m.editorRowId)&&row(m.row)))],
 ];
 for(const [where,ok] of checks){let good=false;try{good=!!ok()}catch(err){good=false}if(!good)return`This SyllabusBridge project file is damaged (problem found in: ${where}), so it was not opened. Open an earlier saved copy, or start again from the Word syllabus.`}
 return''
}
function projectProblem(obj){
 if(!obj||typeof obj!=='object'||obj.format!==PROJECT_FORMAT)return'This is not a SyllabusBridge project file. Choose a file saved with "Save SyllabusBridge project". (A Course JSON export cannot be reopened here.)';
 if(!Number.isInteger(obj.formatVersion)||obj.formatVersion<1)return'This SyllabusBridge project file is damaged: its format version is missing.';
 if(obj.formatVersion>PROJECT_FORMAT_VERSION)return`This project was saved by a newer SyllabusBridge (version ${obj.savedBy?.version||'unknown'}). Open it in that version or later.`;
 const e=obj.editor;
 if(!e||typeof e!=='object'||!e.course||!['faculty','clos','grading','schedule','structuredTables'].every(k=>Array.isArray(e[k]))||!Array.isArray(obj.tableMutations))return'This SyllabusBridge project file is damaged: some saved edits are missing.';
 return projectDataProblem(obj)
}
async function openProjectFile(file){
 clearError();pendingProject=null;showProjectPending();
 let obj;
 try{obj=JSON.parse(await file.text())}catch(e){showError('This file could not be read as a SyllabusBridge project. It may be damaged, or it may not be a project file.','Project could not be opened');return}
 const problem=projectProblem(obj);if(problem){showError(problem,'Project could not be opened');return}
 pendingProject=obj;showProjectPending()
}
function showProjectPending(){
 const box=$('projectPending');if(!box)return;
 if(!pendingProject){box.hidden=true;box.innerHTML='';return}
 const p=pendingProject,when=p.savedAt?new Date(p.savedAt).toLocaleString():'an unknown date',name=p.source?.fileName||'the original Word syllabus';
 box.hidden=false;
 box.innerHTML=`<strong>Project opened (saved ${esc(when)}).</strong><br>Now choose the Word syllabus it was made from: <strong>${esc(name)}</strong>. SyllabusBridge reads it again, then puts your saved edits back.<div class="row" style="margin-top:10px"><button type="button" class="sb-btn primary ft-btn ft-btn-primary" id="chooseProjectDocx">Choose ${esc(name)}</button><button type="button" class="sb-btn ft-btn" id="cancelProject">Cancel</button></div>`;
 $('chooseProjectDocx').onclick=()=>$('file').click();
 $('cancelProject').onclick=()=>{pendingProject=null;showProjectPending()}
}
// A newer SyllabusBridge can read schedule entries from the same Word file that the
// project's own starting point (its saved baseline) did not have, such as a final
// exam dated "TBD" (read since v2.3). Entries are matched by where they are in the
// Word file (table, row, line). Matching entries take their saved identifiers, so
// saved edits still line up; entries the project never had are added, not dropped.
// The faculty member could not have removed them: they never saw them.
// Returns the added entries.
function addNewlyReadScheduleEntries(savedBaseline){
 const base=state.editorBaseline;
 if(!base||!Array.isArray(base.schedule)||!Array.isArray(savedBaseline?.schedule))return[];
 const loc=e=>e&&typeof e==='object'&&e.source&&Number.isInteger(e.source.tableIndex)&&Number.isInteger(e.source.rowIndex)?`${e.source.tableIndex}:${e.source.rowIndex}:${e.source.lineIndex??0}`:null;
 const savedIds=new Map(savedBaseline.schedule.map(e=>[loc(e),e?.editorId]).filter(([k,id])=>k&&typeof id==='string'));
 const known=new Set((state.schedule||[]).map(e=>e.editorId));
 const added=[];
 for(const e of base.schedule){
  const k=loc(e);
  if(k&&savedIds.has(k)){e.editorId=savedIds.get(k);continue}
  if(!k)continue;
  let n=added.length+1;while(known.has(`schedule-found-${n}`))n++;
  e.editorId=`schedule-found-${n}`;known.add(e.editorId);added.push(e)
 }
 state.schedule=[...(state.schedule||[]),...structuredClone(added)];
 return added
}
async function applyPendingProject(){
 const p=pendingProject,fp=state.sourceFingerprint||{},src=p.source||{};
 // Only two matching SHA-256 fingerprints prove it is the same file. A name and
 // size can match for different files, so without both fingerprints, ask.
 const verified=!!(src.sha256&&fp.sha256),sameFile=verified&&src.sha256===fp.sha256;
 const consequence='If you continue, the saved edits replace what SyllabusBridge read from this file, and the change count compares them with this file.';
 if(!sameFile){
  const ok=verified
   ?await FTDialog.confirm(`This project was saved from "${src.fileName||'another Word file'}", but the file you chose${state.sourceName&&state.sourceName!==src.fileName?` ("${state.sourceName}")`:''} is different. It may be another version of the syllabus.\n\n${consequence}`,{title:'Different Word file?',confirmLabel:'Open project anyway'})
   :await FTDialog.confirm(`SyllabusBridge could not confirm that "${state.sourceName}" is the Word file this project was saved from ("${src.fileName||'unknown'}"). ${src.sha256?'This browser could not check the file you chose.':'The project was saved without a file fingerprint.'} A file with the same name can still be a different version.\n\n${consequence}`,{title:'Word file not verified',confirmLabel:'Open project anyway'});
  if(!ok)return false
 }
 const before=state;let newlyRead=[];
 try{
  // Restore only the fields the editor uses, from a copy of the checked project.
  state={...state};
  const saved=structuredClone(p.editor);
  for(const k of PROJECT_EDITOR_FIELDS)if(saved[k]!==undefined)state[k]=saved[k];
  state.coordinator=(state.faculty||[]).find(f=>saved.coordinator?.editorId&&f.editorId===saved.coordinator.editorId)||(state.faculty||[]).find(f=>f.role==='coordinator')||null;
  state.tableMutations=structuredClone(p.tableMutations);state.changeKinds=structuredClone(p.changeKinds||{});state.changeFindings=structuredClone(p.changeFindings||{});state.cloEditorIds=[...(saved.cloEditorIds||[])];
  // Keep entries this SyllabusBridge reads that the project never had (see above).
  state.editorBaseline=structuredClone(state.editorBaseline);
  newlyRead=addNewlyReadScheduleEntries(p.baseline);
  // Meeting times are not edited in the editor: a newer reading of the Word file wins
  // unless the project's own copy differs from its saved starting point.
  if(p.baseline&&JSON.stringify(saved.meetingPatterns)===JSON.stringify(p.baseline.meetingPatterns))state.meetingPatterns=structuredClone(before.meetingPatterns);
  refreshDerivedTableViews();
  // Against a different Word file some saved changes can disappear (the file already
  // says the same thing). Drop their marks before the fresh history starts.
  pruneChangeKinds();renderReview();resetHistory()
 }catch(err){
  console.warn('SyllabusBridge project could not be restored',err);
  state=before;pendingProject=null;showProjectPending();
  showError('This SyllabusBridge project file is damaged, so it was not opened. Open an earlier saved copy, or start again from the Word syllabus.','Project could not be opened');
  return false
 }
 state.openedProject=true;pendingProject=null;showProjectPending();
 updateEditorStatus();projectWork.markSaved();
 const notes=[`Opened the project saved ${p.savedAt?new Date(p.savedAt).toLocaleString():'earlier'}.`];
 if(!sameFile)notes.push('It was saved from a different Word file.');
 if(newlyRead.length)notes.push(`This version of SyllabusBridge also reads ${newlyRead.length} schedule entr${newlyRead.length===1?'y':'ies'} the project did not have: ${newlyRead.map(e=>`${clean(e.date)||'no date'} · ${clean(e.topic)||'untitled'}`).join('; ')}. ${newlyRead.length===1?'It was':'They were'} added to Course schedule; check ${newlyRead.length===1?'it':'them'}.`);
 if(p.savedBy?.version&&p.savedBy.version!==toolVersion())notes.push(`It was saved with SyllabusBridge ${p.savedBy.version}; this is ${toolVersion()}.`);
 state.projectNote=notes.join(' ');
 return true
}
async function handleFile(file){clearError();resetState();go('upload');if(!file?.name?.toLowerCase().endsWith('.docx')){showError('SyllabusBridge accepts .docx Word syllabi only.');return}showLoading(true,'Reading Word syllabus…',15);try{const fingerprint=await fileFingerprint(file),tracked=await trackedChangesIn(file);await parseDocx(file);promoteGradingScaleTables();state.sourceFingerprint=fingerprint;state.sourceBytes=await file.arrayBuffer();state.trackedChanges=tracked;showLoading(true,'Extracting syllabus structure…',72);captureEditorBaseline();if(pendingProject&&!await applyPendingProject()){showLoading(false);resetState();go('upload');return}renderReview();showTrackedChanges();if(state.openedProject){const st=$('historyStatus');if(st)st.textContent=state.projectNote||''}showLoading(true,'Extraction complete',100);setTimeout(()=>{showLoading(false);go('review')},180)}catch(e){console.error(e);showLoading(false);if(e instanceof SyllabusFileError)showError(e.message,'Word syllabus could not be read');else showError(`Something went wrong while reading this syllabus. SyllabusBridge v2.1.2.\n\nTechnical detail: ${e?.message||'Unknown error'}\n\nPlease send a screenshot of this message and the syllabus filename to the FacultyBridge project owner.`,'SyllabusBridge encountered an internal error')}}
$('exportCourseJson').onclick=exportCourseJson;if($('exportCourseJsonReport'))$('exportCourseJsonReport').onclick=exportCourseJson;$('choose').onclick=()=>$('file').click();$('openProject').onclick=()=>$('projectFile').click();$('projectFile').onchange=e=>{const f=e.target.files[0];e.target.value='';if(f)openProjectFile(f)};$('saveProject').onclick=saveProject;$('saveProjectReport').onclick=saveProject;$('file').onchange=e=>{const f=e.target.files[0];e.target.value='';if(f)handleFile(f)};['dragenter','dragover'].forEach(ev=>$('drop').addEventListener(ev,e=>{e.preventDefault();$('drop').classList.add('drag')}));['dragleave','drop'].forEach(ev=>$('drop').addEventListener(ev,e=>{e.preventDefault();$('drop').classList.remove('drag')}));$('drop').addEventListener('drop',e=>e.dataTransfer.files[0]&&handleFile(e.dataTransfer.files[0]));$('runValidation').onclick=()=>{state.reviewComplete=true;syncCourseFields();renderReport();updateEditorStatus();go('report')};document.querySelectorAll('.sb-step').forEach(b=>b.onclick=()=>{if(b.getAttribute('aria-disabled')==='true')return;if(b.dataset.step==='report'){renderReport()}go(b.dataset.step)});const root=document.documentElement;const savedTheme=localStorage.getItem('ft-theme')||'light';root.dataset.theme=savedTheme;root.dataset.ftTheme=savedTheme;$('theme').onclick=()=>{const dark=root.dataset.theme==='dark',next=dark?'light':'dark';root.dataset.theme=next;root.dataset.ftTheme=next;localStorage.setItem('ft-theme',next)};
// Undo/redo buttons and keyboard shortcuts. Inside a text box, Ctrl+Z / Cmd+Z
// keeps doing the browser's own typing undo.
$('undoEdit').onclick=undoEdit;$('redoEdit').onclick=redoEdit;$('reviewChanges').onclick=openChangeSummary;
// Word export (v2.5): preview what will be written, then download.
for(const id of ['exportWord','exportWordReport'])if($(id))$(id).onclick=e=>openWordExport(e.currentTarget);$('downloadWord').onclick=downloadWordExport;
document.addEventListener('keydown',e=>{
 if(!$('screen-review').classList.contains('active')||!(e.ctrlKey||e.metaKey)||e.altKey||typingTarget(e.target)||e.target?.tagName==='SELECT'||document.querySelector('dialog[open]'))return;
 const k=e.key.toLowerCase();
 if(k==='z'&&!e.shiftKey){e.preventDefault();undoEdit()}else if((k==='z'&&e.shiftKey)||(k==='y'&&!e.shiftKey)){e.preventDefault();redoEdit()}
});
// Shared unsaved-work warning: see projectWork (edits not yet saved in a project).
go('upload');
