import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildAgendaRtf } from "../src/server/services/agenda.js";

const generatedAgenda = buildAgendaRtf({
  title: "Clean Agenda Layout",
  templateType: "Senior Regular Meeting",
  meetingDate: new Date("2026-09-19T00:00:00.000Z"),
  startTime: "10:00",
  location: "Club Room",
  club: { name: "Test Club", centre: { name: "Test Centre" } },
  roleSlots: [
    assignedRole("iChair", "Avery", "Chair", 1),
    assignedRole("Prepared Speech 1", "Harini", "Sakthivel", 2),
    assignedRole("Prepared Speech Evaluator 1", "Nayanar", "Ragulendran", 3),
    assignedRole("Prepared Speech Evaluator 2", "Emery", "Evaluator", 4),
    assignedRole("Prepared Speech 4", "Nailah", "Shaikmulla", 5),
    assignedRole("Prepared Presentation 1", "Aaditya", "Muthukumarasamy", 6),
    assignedRole("Prepared Presentation Evaluator 1", "Parker", "Evaluator", 7),
    assignedRole("iThink on My Feet Master", "Morgan", "Master", 8),
    assignedRole("iThink on My Feet Participant 1", "Taylor", "Thinker", 9),
    assignedRole("iThink on My Feet Evaluator 1", "Jordan", "Evaluator", 10),
    assignedRole("iStory and Joke Master", "Casey", "Master", 11),
    assignedRole("iStory and Joke Speaker 1", "Riley", "Storyteller", 12),
    assignedRole("iStory and Joke Evaluator 1", "Alex", "Evaluator", 13)
  ]
} as any);
const agenda = roundTripRtfFixture(generatedAgenda);

assertIncludes(
  agenda,
  "\\trowd\\trgaph80\\trleft0\\trautofit0\\cellx1200\\cellx3900\\cellx10440",
  "main agenda table keeps its compact fixed Roles/Members boundary"
);

assertNotIncludes(agenda, "Prepared Speech 1:", "prepared speech slot labels are omitted");
assertNotIncludes(agenda, "Prepared Speech Evaluator 1:", "prepared speech evaluator labels are omitted");
assertNotIncludes(agenda, "Prepared Presentation 1:", "prepared presentation slot labels are omitted");
assertNotIncludes(agenda, "Prepared Presentation Evaluator 1:", "prepared presentation evaluator labels are omitted");
assertNotIncludes(agenda, "iThink on My Feet Participant 1:", "impromptu participant labels are omitted");
assertNotIncludes(agenda, "iThink on My Feet Evaluator 1:", "impromptu evaluator labels are omitted");

assertIncludes(
  agenda,
  pairedRow(1, "Harini Sakthivel", "Nayanar Ragulendran"),
  "speech speaker and evaluator share numbered row one"
);
assertIncludes(agenda, pairedRow(4, "Nailah Shaikmulla", "None"), "long speech name remains on numbered row four");
assertIncludes(
  agenda,
  pairedRow(1, "Aaditya Muthukumarasamy", "Parker Evaluator"),
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
assertIncludes(
  agenda,
  `${pairedRow(1, "Harini Sakthivel", "Nayanar Ragulendran")}${pairedRow(2, "None", "Emery Evaluator")}`,
  "numbered speaker and evaluator rows are adjacent without blank paragraphs"
);
for (const [title, nextTitle] of [
  ["SPEECHES", "PRESENTATIONS"],
  ["PRESENTATIONS", "CASE STUDY"],
  ["ITHINK ON MY FEET", "QUIZ"],
  ["STORY & JOKE", "REPORTS"]
]) {
  const block = sectionBlock(agenda, title, nextTitle);
  assertIncludes(
    block,
    "\\cellx500\\cellx4200\\cellx4800\\cellx10440",
    `${title} uses the compact evaluator column position`
  );
  assertNotIncludes(block, "\\cellx5700", `${title} does not use the former wide evaluator position`);
  assertNotMatches(block, /\\row\\par(?=[^a-z])/, `${title} rows do not insert blank paragraphs`);
  assertNotIncludes(block, "\\row\\pard\\sa", `${title} rows do not inherit paragraph-after spacing`);
  assertNotIncludes(block, "__________________", `${title} does not contain a long underline leader`);
  assertNotIncludes(block, "\\line", `${title} does not insert a second visual line in paired rows`);
}
assertIncludes(
  agenda,
  "\\row\\pard\\sb160\\sa20\\b\\fs26 PRESENTATIONS",
  "major sections retain a deliberate gap before their headings"
);
assertIncludes(
  agenda,
  "\\pard\\intbl\\sb0\\sa0\\sl240\\slmult1 1.\\cell",
  "numbered rows explicitly use compact paragraph and line spacing"
);

assertIncludes(agenda, "iChair Introduction (2 min)", "speech and presentation introductions retain the iChair label");
assertIncludes(agenda, "Avery Chair", "iChair assignment is retained");
assertIncludes(agenda, "iThink on My Feet Master (2 min)", "iThink master label and duration are retained");
assertIncludes(agenda, "Morgan Master", "iThink master assignment is retained");
assertIncludes(agenda, "Speech evaluator: Nayanar Ragulendran", "scoring maps the existing speech evaluator assignment");
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
    "\\trowd\\trgaph40\\trleft0\\trautofit0\\trkeep",
    "\\cellx500\\cellx4200\\cellx4800\\cellx10440",
    compactCell(`${number}.`),
    compactCell(speakerName),
    compactCell("........"),
    compactCell(evaluatorName),
    "\\row"
  ].join("");
}

function compactCell(value: string) {
  return `\\pard\\intbl\\sb0\\sa0\\sl240\\slmult1 ${value}\\cell`;
}

function sectionBlock(value: string, title: string, nextTitle: string) {
  const start = value.indexOf(`\\fs26 ${title}`);
  const end = value.indexOf(`\\fs26 ${nextTitle}`, start + 1);

  if (start === -1 || end === -1) {
    throw new Error(`unable to find agenda section boundaries for ${title}`);
  }

  return value.slice(start, end);
}

function roundTripRtfFixture(value: string) {
  const fixturePath = join(tmpdir(), `ileap-agenda-layout-${process.pid}.rtf`);

  writeFileSync(fixturePath, value, "utf8");
  try {
    return readFileSync(fixturePath, "utf8");
  } finally {
    unlinkSync(fixturePath);
  }
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

function assertNotMatches(value: string, unexpected: RegExp, label: string) {
  if (unexpected.test(value)) {
    throw new Error(`${label}: expected agenda not to match ${unexpected}`);
  }
}
