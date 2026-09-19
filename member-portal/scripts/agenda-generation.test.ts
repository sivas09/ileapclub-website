import { buildAgendaRtf } from "../src/server/services/agenda.js";

const agenda = buildAgendaRtf({
  title: "Clean Agenda Layout",
  templateType: "Senior Regular Meeting",
  meetingDate: new Date("2026-09-19T00:00:00.000Z"),
  startTime: "10:00",
  location: "Club Room",
  club: { name: "Test Club", centre: { name: "Test Centre" } },
  roleSlots: [
    assignedRole("iChair", "Avery", "Chair", 1),
    assignedRole("Prepared Speech 1", "Sam", "Speaker", 2),
    assignedRole("Prepared Speech Evaluator 1", "Evelyn", "Evaluator", 3),
    assignedRole("Prepared Speech Evaluator 2", "Emery", "Evaluator", 4),
    assignedRole("Prepared Presentation 1", "Priya", "Presenter", 5),
    assignedRole("Prepared Presentation Evaluator 1", "Parker", "Evaluator", 6),
    assignedRole("iThink on My Feet Master", "Morgan", "Master", 7),
    assignedRole("iThink on My Feet Participant 1", "Taylor", "Thinker", 8),
    assignedRole("iThink on My Feet Evaluator 1", "Jordan", "Evaluator", 9),
    assignedRole("iStory and Joke Master", "Casey", "Master", 10),
    assignedRole("iStory and Joke Speaker 1", "Riley", "Storyteller", 11),
    assignedRole("iStory and Joke Evaluator 1", "Alex", "Evaluator", 12)
  ]
} as any);

assertNotIncludes(agenda, "Prepared Speech 1:", "prepared speech slot labels are omitted");
assertNotIncludes(agenda, "Prepared Speech Evaluator 1:", "prepared speech evaluator labels are omitted");
assertNotIncludes(agenda, "Prepared Presentation 1:", "prepared presentation slot labels are omitted");
assertNotIncludes(agenda, "Prepared Presentation Evaluator 1:", "prepared presentation evaluator labels are omitted");
assertNotIncludes(agenda, "iThink on My Feet Participant 1:", "impromptu participant labels are omitted");
assertNotIncludes(agenda, "iThink on My Feet Evaluator 1:", "impromptu evaluator labels are omitted");

assertIncludes(
  agenda,
  pairedRow(1, "Sam Speaker", "Evelyn Evaluator"),
  "speech speaker and evaluator share numbered row one"
);
assertIncludes(
  agenda,
  pairedRow(1, "Priya Presenter", "Parker Evaluator"),
  "presentation speaker and evaluator share numbered row one"
);
assertIncludes(
  agenda,
  pairedRow(1, "Taylor Thinker", "Jordan Evaluator"),
  "iThink participant and evaluator share numbered row one"
);
assertIncludes(
  agenda,
  pairedRow(1, "Riley Storyteller", "Alex Evaluator"),
  "story speaker and evaluator share numbered row one"
);
assertIncludes(agenda, pairedRow(2, "None", "Emery Evaluator"), "unassigned speaker remains in row two as None");
assertIncludes(agenda, pairedRow(2, "None", "None"), "fully unassigned paired slots remain visible as None");

assertIncludes(agenda, "iChair Introduction (2 min)", "speech and presentation introductions retain the iChair label");
assertIncludes(agenda, "Avery Chair", "iChair assignment is retained");
assertIncludes(agenda, "iThink on My Feet Master (2 min)", "iThink master label and duration are retained");
assertIncludes(agenda, "Morgan Master", "iThink master assignment is retained");
assertIncludes(agenda, "Speech evaluator: Evelyn Evaluator", "scoring maps the existing speech evaluator assignment");
assertIncludes(agenda, "Presentation evaluator: Parker Evaluator", "scoring maps the existing presentation evaluator assignment");

console.log("Agenda generation tests passed.");

function assignedRole(roleName: string, firstName: string, lastName: string, sortOrder: number) {
  return {
    id: `role-${sortOrder}`,
    sortOrder,
    slotLabel: roleName,
    roleDefinition: { name: roleName },
    assignedStudent: { user: { firstName, lastName } }
  };
}

function pairedRow(number: number, speakerName: string, evaluatorName: string) {
  return [
    `\\intbl ${number}.\\cell`,
    `\\intbl ${speakerName}\\cell`,
    "\\intbl __________________\\cell",
    `\\intbl ${evaluatorName}\\cell`
  ].join("");
}

function assertIncludes(value: string, expected: string, label: string) {
  if (!value.includes(expected)) {
    throw new Error(`${label}: expected agenda to include ${JSON.stringify(expected)}`);
  }
}

function assertNotIncludes(value: string, unexpected: string, label: string) {
  if (value.includes(unexpected)) {
    throw new Error(`${label}: expected agenda not to include ${JSON.stringify(unexpected)}`);
  }
}
