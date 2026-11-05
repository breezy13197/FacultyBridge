// These functions also run inside page.evaluate: keep them self-contained and
// return aggregate counts only, never course content or answer text.
export function coordinatorSummary({ faculty = [], coordinator = null, coordinatorIds = [] } = state) {
  const coordinators = faculty.some(f => f.role === 'coordinator')
    ? faculty.filter(f => f.role === 'coordinator').length
    : new Set(coordinatorIds.filter(id => faculty.some(f => f.id === id))).size || (coordinator ? 1 : 0);
  return { coordinators, coordinatorDetected: coordinators > 0 };
}

export function questionAnswerSummary(questions = state.questions) {
  const byType = {}, confidence = {};
  let withDetectedAnswer = 0, withoutDetectedAnswer = 0, notApplicable = 0;
  for (const q of questions) {
    const nonempty = value => String(value ?? '').trim().length > 0;
    let detected;
    if (['mc', 'mr', 'tf'].includes(q.type)) {
      detected = (q.answers || []).some(a => a.correct && nonempty(a.text));
    } else if (q.type === 'sa') {
      detected = (q.accepted || []).some(nonempty);
    } else if (q.type === 'fitb') {
      detected = (q.blanks || []).some(b => (b.accepted || []).some(nonempty));
    } else {
      notApplicable++;
      continue;
    }
    const counts = byType[q.type] ||= { withDetectedAnswer: 0, withoutDetectedAnswer: 0 };
    if (detected) { withDetectedAnswer++; counts.withDetectedAnswer++; }
    else { withoutDetectedAnswer++; counts.withoutDetectedAnswer++; }
    const level = ['high', 'medium', 'low', 'review'].includes(q.confidence) ? q.confidence : 'unknown';
    confidence[level] = (confidence[level] || 0) + 1;
  }
  return { detected: withDetectedAnswer > 0, withDetectedAnswer, withoutDetectedAnswer,
    notApplicable, byType, confidence };
}

export function syllabusExtractionSummary(s = state) {
  const contacts = list => ({ withEmail: list.filter(f => String(f.email || '').trim()).length,
    withoutEmail: list.filter(f => !String(f.email || '').trim()).length });
  return {
    scheduleCoverage: { candidates: s.extraction?.scheduleCandidates ?? 0,
      parsed: s.schedule.length, failed: s.extraction?.scheduleFailures?.length ?? 0 },
    cloCoverage: { candidates: s.extraction?.cloCandidates ?? 0, parsed: s.clos.length },
    contacts: { faculty: contacts(s.faculty), coordinators: contacts(s.faculty.filter(f => f.role === 'coordinator')) },
    courseStructure: { cloMappings: s.cloMappings.length, plos: s.plos.length,
      meetingPatterns: s.meetingPatterns.length, gradingRows: s.grading.length,
      gradingPercentTotal: Math.round(s.grading.reduce((n, g) => n + (Number(g.pct) || 0), 0) * 10000) / 10000 },
  };
}

export function calendarExtractionSummary(s = state, issuesFor = eventIssues) {
  const issues = Object.fromEntries(['date', 'weekday', 'time', 'inferred-time', 'event',
    'faculty', 'continuation-row', 'other'].map(k => [k, 0]));
  const byType = Object.fromEntries(['lecture', 'assessment', 'activity', 'no-class', 'other'].map(k => [k, 0]));
  const seen = new Set();
  let included = 0, missingLocation = 0, duplicates = 0, unresolvedFacultyEvents = 0;
  const facultyIds = new Set(s.faculty.map(f => f.id));
  const coordinators = s.coordinatorIds || [];
  for (const e of s.events) {
    if (e.include) included++;
    for (const issue of new Set(issuesFor(e))) issues[Object.hasOwn(issues, issue) ? issue : 'other']++;
    byType[Object.hasOwn(byType, e.type) ? e.type : 'other']++;
    if (!String(e.location || '').trim()) missingLocation++;
    if ((e.facultyIds || []).some(id => id === '__coordinator__'
      ? !coordinators.some(cid => facultyIds.has(cid))
      : id === '__all__' ? !facultyIds.size : !facultyIds.has(id))) unresolvedFacultyEvents++;
    // Compare exact scheduling content; retain only the number of extra copies.
    const key = JSON.stringify([e.date, e.time, e.topic, e.location, e.type, [...new Set(e.facultyIds || [])].sort()]);
    if (seen.has(key)) duplicates++;
    seen.add(key);
  }
  return { issues, eventCoverage: { included, excluded: s.events.length - included,
    missingLocation, duplicates, byType },
    facultyCoverage: { faculty: s.faculty.length, unresolvedFacultyEvents,
      unresolvedCoordinatorReferences: new Set(coordinators.filter(id => !facultyIds.has(id))).size } };
}

export function answerCompletenessSummary(questions = state.questions, blankTokens = detectBlankTokens) {
  const completeness = { complete: 0, partial: 0, missing: 0, invalid: 0, notApplicable: 0 };
  const correctChoiceCounts = {};
  let answerChoices = 0, blankFields = 0, answeredBlankFields = 0;
  const nonempty = value => String(value ?? '').trim().length > 0;
  for (const q of questions) {
    let status;
    if (['mc', 'mr', 'tf'].includes(q.type)) {
      const choices = (q.answers || []).filter(a => nonempty(a.text));
      const correct = choices.filter(a => a.correct).length;
      answerChoices += choices.length;
      correctChoiceCounts[correct] = (correctChoiceCounts[correct] || 0) + 1;
      status = (q.answers || []).some(a => a.correct && !nonempty(a.text)) ||
        (q.type !== 'mr' && correct > 1) ? 'invalid' : !correct ? 'missing' : 'complete';
    } else if (q.type === 'sa') {
      status = (q.accepted || []).some(nonempty) ? 'complete' : 'missing';
    } else if (q.type === 'fitb') {
      const expected = blankTokens(q.stem).length, blanks = q.blanks || [];
      const answered = blanks.filter(b => (b.accepted || []).some(nonempty)).length;
      blankFields += blanks.length;
      answeredBlankFields += answered;
      status = !expected || blanks.length > expected ? 'invalid' : !answered ? 'missing'
        : blanks.length === expected && answered === expected ? 'complete' : 'partial';
    } else status = 'notApplicable';
    completeness[status]++;
  }
  return { completeness, answerChoices, correctChoiceCounts, blankFields, answeredBlankFields };
}

// App validation messages have no stable IDs. Map known messages to fixed test
// codes, and count unrecognized messages as other; never store message text.
export function questionIssueSummary({ questions = state.questions, platforms = Object.keys(platformDefs),
  validate = validateQuestion } = {}) {
  const rules = [
    ['empty-stem', /^Question stem is empty/], ['negative-points', /^Point value cannot/],
    ['too-few-choices', /^At least two/], ['missing-correct', /^Select at least one/],
    ['single-correct-required', /^Select exactly one/], ['missing-short-answer', /^Add at least one accepted short/],
    ['missing-blank-marker', /^Add at least one blank marker/],
    ['missing-blank-answer', /^(?:Add an accepted answer for each|Blank \d+ needs)/],
    ['duplicate-numbering', /^Question numbering restarts/], ['confidence', /^Parsing confidence:/],
    ['unsupported-fitb', /^Brightspace Question Library CSV does not support/],
    ['image-path', /^Image requires a Brightspace/], ['images-unsupported', /^(?:Legacy ExamSoft RTF import does not import images|Images cannot be included|Poll Everywhere CSV import cannot upload images)/],
    ['short-answer-conversion', /^Short Answer is exported/], ['scientific-notation', /^Superscript\/subscript/],
    ['unsupported-type', /^Kahoot spreadsheet import supports/], ['stem-too-long', /^(?:Kahoot question text|Poll Everywhere question title) is/],
    ['answer-too-long', /^Answer \d+ exceeds/], ['too-many-choices', /^Kahoot supports up to/],
    ['open-ended-conversion', /^(?:Fill in the Blank will be converted|Question will be converted)/],
    ['multiple-response-conversion', /^Multiple-response is exported/], ['spreadsheet-formula', /^A field begins with/],
  ];
  return { parseWarnings: { questions: questions.filter(q => q.parseWarnings?.length).length,
    total: questions.reduce((n, q) => n + (q.parseWarnings?.length || 0), 0) },
    platforms: Object.fromEntries(platforms.map(p => {
      const counts = {};
      for (const q of questions) for (const issue of validate(q, p)) {
        const code = rules.find(([, pattern]) => pattern.test(issue.msg))?.[0] || 'other';
        const levels = counts[code] ||= { error: 0, warning: 0 };
        levels[issue.level === 'error' ? 'error' : 'warning']++;
      }
      return [p, counts];
    })) };
}
