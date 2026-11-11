// SUSOP Syllabus Policy profile, updated 2026-09-28 (SyllabusBridge v2.3).
//
// This file holds DATA ONLY: the policy rules SyllabusBridge checks a syllabus
// against. It is a .js file (not .json) so the single-file offline build can
// carry it; everything inside the object below is plain JSON.
//
// When the policy changes, copy this file to a new dated name, edit the copy,
// and add it to index.html. Keep the old file so earlier reports still name it.
//
// "confirmed": false marks wording or values that were not copied from the
// official policy document. Check them against the policy before release and
// then set "confirmed" to true. Unconfirmed parts are named in the report.
//
// Patterns are regular expressions, matched without regard to capital letters.
// Each requirement passes when ANY of its patterns is found.
(globalThis.SyllabusBridgePolicyProfiles = globalThis.SyllabusBridgePolicyProfiles || []).push({
  "id": "susop-syllabus-policy-2026-09-28",
  "name": "SUSOP Syllabus Policy",
  "updated": "2026-09-28",

  "campus": {
    "_note": "Campus-specific settings. Leave a value blank to skip that comparison; the report then says it was not compared. studentAffairsContact: a name the accessibility statement must give. Left blank on purpose (no staff names are kept in the repository), so any contact is accepted and the report says the contact was not compared.",
    "studentAffairsContact": ""
  },

  "gradingScale": {
    "title": "Grading scale matches the official scale",
    "confirmed": true,
    "_note": "The official SUSOP grading scale, as supplied with the v2.3 QA review (2026-11-11). 70-89% go down by 0.1 per percent; 65-69% go down by 0.2 per percent.",
    "rows": [
      { "min": 90, "max": 100, "gpa": 4.0 },
      { "min": 89, "max": 89, "gpa": 3.9 }, { "min": 88, "max": 88, "gpa": 3.8 },
      { "min": 87, "max": 87, "gpa": 3.7 }, { "min": 86, "max": 86, "gpa": 3.6 },
      { "min": 85, "max": 85, "gpa": 3.5 }, { "min": 84, "max": 84, "gpa": 3.4 },
      { "min": 83, "max": 83, "gpa": 3.3 }, { "min": 82, "max": 82, "gpa": 3.2 },
      { "min": 81, "max": 81, "gpa": 3.1 }, { "min": 80, "max": 80, "gpa": 3.0 },
      { "min": 79, "max": 79, "gpa": 2.9 }, { "min": 78, "max": 78, "gpa": 2.8 },
      { "min": 77, "max": 77, "gpa": 2.7 }, { "min": 76, "max": 76, "gpa": 2.6 },
      { "min": 75, "max": 75, "gpa": 2.5 }, { "min": 74, "max": 74, "gpa": 2.4 },
      { "min": 73, "max": 73, "gpa": 2.3 }, { "min": 72, "max": 72, "gpa": 2.2 },
      { "min": 71, "max": 71, "gpa": 2.1 }, { "min": 70, "max": 70, "gpa": 2.0 },
      { "min": 69, "max": 69, "gpa": 1.8 }, { "min": 68, "max": 68, "gpa": 1.6 },
      { "min": 67, "max": 67, "gpa": 1.4 }, { "min": 66, "max": 66, "gpa": 1.2 },
      { "min": 65, "max": 65, "gpa": 1.0 },
      { "min": 0, "max": 64, "gpa": 0 }
    ]
  },

  "contentChecks": [
    {
      "id": "accessibility",
      "title": "Accessibility statement wording",
      "sections": ["accessibility"],
      "fixField": "accessibility",
      "confirmed": true,
      "_note": "The approved statement from the syllabus template (supplied 2026-11-11). Each sentence must appear in the syllabus; capital letters, punctuation, and spacing are ignored. {studentAffairsContact} marks the campus-specific part, which may differ; the configured campus contact is then checked separately.",
      "campusSetting": "studentAffairsContact",
      "approvedText": "South University provides accommodations to qualified students with disabilities. The Disability Services office assists qualified students with disabilities in acquiring reasonable and appropriate accommodations and in supporting equal access to services, programs, and activities at South University. Students who seek reasonable accommodations should notify the Student Affairs Office, {studentAffairsContact}. Students should let the Student Affairs Office know of their specific limitations and, if known, their specific requested accommodations. Students will be asked to supply medical documentation of the need for accommodation. Classroom accommodations are not retroactive, but are effective only upon the student sharing approved accommodations with the instructor. Therefore, students are encouraged to request accommodations as early as feasible with the Student Affairs Office to allow time to gather necessary documentation. Complaints will be handled in accordance with the school’s Internal Grievance Procedure for Complaints of Discrimination and Harassment included in the General Complaint Procedure section of the Academic Catalog.",
      "action": "Replace the statement with the approved accessibility wording from the syllabus template, keeping your campus Student Affairs contact details."
    },
    {
      "id": "engagement",
      "title": "Student engagement hours",
      "sections": ["engagement"],
      "fixField": "engagement",
      "confirmed": true,
      "requirements": [
        { "label": "10 hours of instruction", "patterns": ["(?:\\b10\\b|\\bten\\b)(?:\\s*\\(10\\))?\\s*(?:clock\\s+)?(?:hours?|hrs?)\\b[^.]{0,80}\\b(?:instruction|instructional|in[- ]class|classroom|contact)", "(?:\\b10\\b|\\bten\\b)(?:\\s*\\(10\\))?\\s+(?:instructional|contact|classroom|in[- ]class)\\s+(?:hours?|hrs?)\\b"] },
        { "label": "20 hours of outside work", "patterns": ["(?:\\b20\\b|\\btwenty\\b)(?:\\s*\\(20\\))?\\s*(?:clock\\s+)?(?:hours?|hrs?)\\b[^.]{0,80}\\b(?:outside|out[- ]of[- ]class|preparation|independent|homework)", "(?:\\b20\\b|\\btwenty\\b)(?:\\s*\\(20\\))?\\s+(?:outside|out[- ]of[- ]class|independent|preparation)\\s+(?:hours?|hrs?)\\b"] },
        { "label": "per quarter credit hour", "patterns": ["\\bquarter\\s+credit\\s+hours?\\b"] }
      ],
      "action": "State the student engagement expectation: 10 hours of instruction and 20 hours of outside work for each quarter credit hour."
    },
    {
      "id": "hardware",
      "title": "Required hardware and software",
      "sections": ["hardware", "materials"],
      "fixField": "hardware",
      "confirmed": true,
      "requirements": [
        { "label": "ExamSoft", "patterns": ["\\bexam\\s*soft\\b"] },
        { "label": "a current annual ExamSoft subscription", "patterns": ["\\bannual\\s+(?:subscription|license|licence)\\b"] },
        { "label": "a privacy filter", "patterns": ["\\bprivacy\\s+(?:filter|screen)s?\\b"] }
      ],
      "action": "List ExamSoft (with a current annual subscription) and a privacy filter under Required Hardware and Software."
    },
    {
      "id": "library",
      "title": "Library resources for research assignments",
      "sections": ["materials"],
      "searchWholeSyllabus": true,
      "fixField": "materials",
      "confirmed": true,
      "onlyWhen": {
        "label": "assignments involve research",
        "_note": "The standard Student Engagement wording mentions \"all research associated with completing assignments\" in every syllabus, so it is not read as a research assignment.",
        "ignoreSections": ["engagement"],
        "patterns": ["\\bresearch\\b", "\\bliterature\\s+(?:search|review|evaluation)\\b", "\\bjournal\\s+club\\b", "\\bdrug\\s+information\\s+(?:question|request|assignment|response)s?\\b", "\\bprimary\\s+literature\\b", "\\bscholarly\\b"]
      },
      "requirements": [
        { "label": "points to South University Library resources", "patterns": ["\\bsouth\\s+university\\s+(?:online\\s+)?library\\b", "\\bsouth\\s+university\\b[^.]{0,60}\\blibrary\\b"] }
      ],
      "action": "Because assignments involve research, point students to South University Library resources (for example under Required Textbooks and Related Materials)."
    },
    {
      "id": "programAssessment",
      "title": "Program-wide assessment tools",
      "sections": ["programAssessment"],
      "fixField": "programAssessment",
      "confirmed": true,
      "requirements": [
        { "label": "ExamSoft", "patterns": ["\\bexam\\s*soft\\b"] },
        { "label": "the end-of-course survey", "patterns": ["\\bend[-\\s]+of[-\\s]+(?:the[-\\s]+)?(?:course|quarter)\\s+(?:survey|evaluation)s?\\b"] },
        { "label": "course-embedded assessments", "patterns": ["\\bcourse[-\\s]+embedded\\s+(?:\\w+\\s+){0,2}assessments?\\b"] }
      ],
      "action": "Mention ExamSoft, the end-of-course survey, and course-embedded assessments under Program-wide Assessment Tools."
    },
    {
      "id": "coursePolicies",
      "title": "Handbook references in course-specific policies",
      "sections": ["coursePolicies", "attendance", "assessmentPolicy", "absence", "incomplete", "integrity", "theftPolicy", "electronicPolicy", "professionalismPolicy"],
      "_note": "The handbook sentence often sits under a bulleted list SyllabusBridge reads as separate sections, so the whole syllabus is searched.",
      "searchWholeSyllabus": true,
      "fixField": "coursePolicies",
      "confirmed": true,
      "requirements": [
        { "label": "the SUSOP Student Handbook", "patterns": ["\\bSUSOP\\s+Student\\s+Handbook\\b", "\\bSchool\\s+of\\s+Pharmacy\\s+Student\\s+Handbook\\b"] },
        { "label": "the University Handbook", "patterns": ["\\bUniversity\\s+(?:Student\\s+)?Handbook\\b"] }
      ],
      "action": "Reference the SUSOP Student Handbook and the University Handbook policies in Course Specific Policies."
    }
  ]
});
