import type { Prisma } from "@prisma/client";
import { mainRoleNameForReportRole } from "../../shared/portalConstants.js";
import { publicUserSelect } from "./safeUser.js";

type AgendaMeeting = Prisma.MeetingGetPayload<{
  include: {
    club: { include: { centre: true } };
    roleSlots: {
      include: {
        roleDefinition: true;
        assignedStudent: {
          include: { user: { select: typeof publicUserSelect } };
        };
      };
    };
  };
}>;

export function buildAgendaRtf(meeting: AgendaMeeting) {
  const roleSlots = [...meeting.roleSlots].sort((left, right) => left.sortOrder - right.sortOrder);
  const agendaRows = agendaSectionsForTemplate(meeting.templateType)
    .flatMap((section) => renderSection(section, roleSlots))
    .join("");

  return [
    "{\\rtf1\\ansi\\deff0",
    "{\\fonttbl{\\f0 Calibri;}{\\f1 Arial;}}",
    "\\viewkind4\\uc1\\paperw12240\\paperh15840\\margl900\\margr900\\margt720\\margb720\\pard\\f0\\fs22",
    heading("iLEAP Club Meeting Agenda", 40),
    detailLine("MEETING DATE", formatDate(meeting.meetingDate)),
    detailLine("SESSION", meeting.title),
    detailLine("CLUB", meeting.club.name),
    detailLine("CENTRE", meeting.club.centre.name),
    meeting.startTime ? detailLine("TIME", meeting.startTime) : "",
    meeting.location ? detailLine("LOCATION / ONLINE LINK", meeting.location) : "",
    "\\par",
    tableHeader(["Time", "Agenda Item", "Roles / Members"]),
    agendaRows,
    "\\par",
    "}"
  ].join("");
}

export function agendaFileName(meeting: Pick<AgendaMeeting, "title" | "meetingDate">) {
  const date = meeting.meetingDate.toISOString().slice(0, 10);
  const slug = meeting.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "meeting-agenda";

  return `${date}-${slug}.rtf`;
}

function heading(value: string, size: number) {
  return `\\pard\\sa120\\b\\fs${size} ${escapeRtf(value)}\\b0\\fs22\\par`;
}

function detailLine(label: string, value: string) {
  return `\\pard\\sa40\\b ${escapeRtf(label)}:\\b0 ${escapeRtf(value)}\\par`;
}

function tableHeader(values: string[]) {
  return tableRow(values, true);
}

function tableRow(values: string[], isHeader = false) {
  const escapedValues = values.map(escapeRtf);
  const boldStart = isHeader ? "\\b " : "";
  const boldEnd = isHeader ? "\\b0 " : "";

  return [
    "\\trowd\\trgaph80\\trleft0",
    "\\cellx1200\\cellx3900\\cellx10440",
    ...escapedValues.map((value) => `\\intbl ${boldStart}${value}${boldEnd}\\cell`),
    "\\row"
  ].join("");
}

function sectionHeading(title: string) {
  return `\\pard\\sb120\\sa40\\b\\fs26 ${escapeRtf(title.toUpperCase())}\\b0\\fs22\\par`;
}

function renderSection(section: AgendaSection, roleSlots: AgendaRoleSlot[]) {
  if (section.pairedRoles) {
    return renderPairedSection(section.title, section.pairedRoles, roleSlots);
  }

  return [
    sectionHeading(section.title),
    ...section.items.map((item) => tableRow([
      item.duration,
      item.activity,
      item.roles.map((roleName, index) => {
        const displayLabel = item.roleDisplayLabels?.[index] ?? roleName;
        return `${displayLabel}: ${assignedMemberForRole(roleSlots, roleName)}`;
      }).join("; ") || "All members"
    ]))
  ];
}

function renderPairedSection(title: string, layout: PairedRoleLayout, roleSlots: AgendaRoleSlot[]) {
  const rows = layout.speakers.map((speakerRole, index) => pairedRoleRow(
    index + 1,
    assignedMemberForRole(roleSlots, speakerRole),
    assignedMemberForRole(roleSlots, layout.evaluators[index])
  ));

  return [
    sectionHeading(title),
    compactAssignmentLine(layout.introductionLabel, layout.introductionDuration, assignedMemberForRole(roleSlots, layout.introductionRole)),
    pairedRoleHeader(layout.speakerDuration),
    ...rows
  ];
}

function compactAssignmentLine(label: string, duration: string, memberName: string) {
  return [
    "\\trowd\\trgaph40\\trleft0",
    "\\cellx4300\\cellx6500\\cellx10440",
    `\\intbl ${escapeRtf(`${label} (${duration})`)}\\cell`,
    "\\intbl __________________\\cell",
    `\\intbl ${escapeRtf(memberName)}\\cell`,
    "\\row"
  ].join("");
}

function pairedRoleHeader(speakerDuration: string) {
  return [
    "\\trowd\\trgaph40\\trleft0\\trkeep",
    "\\cellx500\\cellx4800\\cellx6500\\cellx10440",
    "\\intbl \\cell",
    `\\intbl \\b ${escapeRtf(`Speakers (${speakerDuration})`)}\\b0 \\cell`,
    "\\intbl \\cell",
    "\\intbl \\b Evaluators\\b0 \\cell",
    "\\row"
  ].join("");
}

function pairedRoleRow(number: number, speakerName: string, evaluatorName: string) {
  return [
    "\\trowd\\trgaph40\\trleft0\\trkeep",
    "\\cellx500\\cellx4800\\cellx6500\\cellx10440",
    `\\intbl ${number}.\\cell`,
    `\\intbl ${escapeRtf(speakerName)}\\cell`,
    "\\intbl __________________\\cell",
    `\\intbl ${escapeRtf(evaluatorName)}\\cell`,
    "\\row"
  ].join("");
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC"
  }).format(value);
}

function escapeRtf(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/{/g, "\\{")
    .replace(/}/g, "\\}")
    .replace(/\n/g, "\\par ");
}

type AgendaSection = {
  offset: string;
  title: string;
  items: AgendaItem[];
  pairedRoles?: PairedRoleLayout;
};

type PairedRoleLayout = {
  introductionLabel: string;
  introductionDuration: string;
  introductionRole: string;
  speakerDuration: string;
  speakers: string[];
  evaluators: string[];
};

type AgendaItem = {
  duration: string;
  activity: string;
  roles: string[];
  notes: string;
  roleDisplayLabels?: string[];
};

type AgendaRoleSlot = AgendaMeeting["roleSlots"][number];

const regularMeetingSections: AgendaSection[] = [
  {
    offset: "+0 min",
    title: "Arrival and Agenda Changes",
    items: [
      { duration: "5 min", activity: "Arrival, seating, agenda changes", roles: ["iChair"], notes: "Confirm attendance and role coverage." }
    ]
  },
  {
    offset: "+5 min",
    title: "Introduction",
    items: [
      { duration: "2 min", activity: "Welcome remarks", roles: ["iChair"], notes: "Open the meeting and introduce the theme." },
      { duration: "2 min", activity: "Phrase or idiom of the day", roles: ["iGrammarian"], notes: "Share the language focus for members to use." },
      { duration: "2 min", activity: "Filler word briefing", roles: ["iFiller Counter"], notes: "Explain what will be tracked." },
      { duration: "2 min", activity: "Fine or quiz challenge", roles: ["iFinesMaster"], notes: "Explain the participation challenge." },
      { duration: "2 min", activity: "Timing rules", roles: ["iTimer"], notes: "Review timing signals and limits." }
    ]
  },
  {
    offset: "+10 min",
    title: "Speeches",
    items: [],
    pairedRoles: {
      introductionLabel: "iChair Introduction",
      introductionDuration: "2 min",
      introductionRole: "iChair",
      speakerDuration: "4 min",
      speakers: ["Prepared Speech 1", "Prepared Speech 2", "Prepared Speech 3", "Prepared Speech 4"],
      evaluators: ["Prepared Speech Evaluator 1", "Prepared Speech Evaluator 2", "Prepared Speech Evaluator 3", "Prepared Speech Evaluator 4"]
    }
  },
  {
    offset: "+35 min",
    title: "Presentations",
    items: [],
    pairedRoles: {
      introductionLabel: "iChair Introduction",
      introductionDuration: "2 min",
      introductionRole: "iChair",
      speakerDuration: "4 min",
      speakers: ["Prepared Presentation 1", "Prepared Presentation 2", "Prepared Presentation 3", "Prepared Presentation 4"],
      evaluators: ["Prepared Presentation Evaluator 1", "Prepared Presentation Evaluator 2", "Prepared Presentation Evaluator 3", "Prepared Presentation Evaluator 4"]
    }
  },
  {
    offset: "+60 min",
    title: "Case Study",
    items: [
      { duration: "20 min", activity: "Case study discussion", roles: ["Case Study Lead (20 Mins)"], notes: "Lead discussion, decision-making, and summary." }
    ]
  },
  {
    offset: "+80 min",
    title: "iThink on My Feet",
    items: [],
    pairedRoles: {
      introductionLabel: "iThink on My Feet Master",
      introductionDuration: "2 min",
      introductionRole: "iThink on My Feet Master",
      speakerDuration: "2 min",
      speakers: ["iThink on My Feet Participant 1", "iThink on My Feet Participant 2", "iThink on My Feet Participant 3", "iThink on My Feet Participant 4"],
      evaluators: ["iThink on My Feet Evaluator 1", "iThink on My Feet Evaluator 2", "iThink on My Feet Evaluator 3", "iThink on My Feet Evaluator 4"]
    }
  },
  {
    offset: "+92 min",
    title: "Quiz",
    items: [
      { duration: "5 min", activity: "Quiz or fine challenge", roles: ["iFinesMaster"], notes: "Run the quiz or participation challenge." }
    ]
  },
  {
    offset: "+97 min",
    title: "Story & Joke",
    items: [],
    pairedRoles: {
      introductionLabel: "iStory and Joke Master",
      introductionDuration: "2 min",
      introductionRole: "iStory and Joke Master",
      speakerDuration: "3 min",
      speakers: ["iStory and Joke Speaker 1", "iStory and Joke Speaker 2"],
      evaluators: ["iStory and Joke Evaluator 1", "iStory and Joke Evaluator 2"]
    }
  },
  {
    offset: "+110 min",
    title: "Reports",
    items: [
      { duration: "2 min", activity: "iChair report", roles: ["iChair Report"], notes: "Summarize meeting flow and member participation." },
      { duration: "2 min", activity: "iGrammarian report", roles: ["iGrammarian Report"], notes: "Report phrase usage and strong language." },
      { duration: "2 min", activity: "iFiller Counter report", roles: ["iFiller Counter Report"], notes: "Report filler words and repeated phrases." },
      { duration: "2 min", activity: "iFinesMaster report", roles: ["iFinesMaster Report"], notes: "Report fines, quiz, or participation challenge results." },
      { duration: "2 min", activity: "iTimer report", roles: ["iTimer Report"], notes: "Report timings for meeting segments and roles." }
    ]
  },
  {
    offset: "+120 min",
    title: "Scoring and Remarks",
    items: [
      {
        duration: "5 min",
        activity: "Evaluator scoring and facilitator remarks",
        roles: ["iChair", "Prepared Speech Evaluator 1", "Prepared Presentation Evaluator 1"],
        roleDisplayLabels: ["iChair", "Speech evaluator", "Presentation evaluator"],
        notes: "Record scores and final feedback."
      }
    ]
  },
  {
    offset: "+125 min",
    title: "Conclusions",
    items: [
      { duration: "3 min", activity: "Meeting conclusions and acknowledgements", roles: ["iChair"], notes: "Recognize members and summarize the meeting." }
    ]
  },
  {
    offset: "+128 min",
    title: "Closing",
    items: [
      { duration: "2 min", activity: "Closing thought and announcements", roles: ["iChair"], notes: "Confirm next meeting and close." }
    ]
  }
];

const debateMeetingSections: AgendaSection[] = [
  {
    offset: "+0 min",
    title: "Opening",
    items: [
      { duration: "5 min", activity: "Arrival, agenda changes, debate motion", roles: ["iChair"], notes: "Confirm teams, rules, and speaking order." },
      { duration: "2 min", activity: "Timer briefing", roles: ["iTimer"], notes: "Review signals for each debate segment." }
    ]
  },
  {
    offset: "+10 min",
    title: "Debate",
    items: [
      { duration: "4 min each", activity: "Opening arguments", roles: ["Prepared Speech 1", "Prepared Speech 2"], notes: "Each side presents its opening position." },
      { duration: "3 min each", activity: "Rebuttals", roles: ["Prepared Speech 3", "Prepared Speech 4"], notes: "Respond directly to the opposing argument." },
      { duration: "8 min", activity: "Audience questions", roles: ["iThink on My Feet Master"], notes: "Moderate concise questions from members." },
      { duration: "5 min", activity: "Result and response", roles: ["iChair Report"], notes: "Announce result and key takeaways." }
    ]
  },
  {
    offset: "+45 min",
    title: "Evaluation and Closing",
    items: [
      { duration: "2 min each", activity: "Debate feedback", roles: ["Prepared Speech Evaluator 1", "Prepared Speech Evaluator 2"], notes: "Evaluate reasoning, delivery, and listening." },
      { duration: "5 min", activity: "Results and closing", roles: ["iChair", "iTimer Report"], notes: "Announce result and close the meeting." }
    ]
  }
];

const townHallMeetingSections: AgendaSection[] = [
  {
    offset: "+0 min",
    title: "Town Hall Setup",
    items: [
      { duration: "5 min", activity: "Arrival, agenda changes, scenario briefing", roles: ["iChair", "Case Study Lead (20 Mins)"], notes: "Introduce the leadership challenge." },
      { duration: "2 min", activity: "Timer briefing", roles: ["iTimer"], notes: "Set speaking limits for proposals and responses." }
    ]
  },
  {
    offset: "+10 min",
    title: "Leadership Challenge",
    items: [
      { duration: "5 min", activity: "Problem statement", roles: ["Case Study Lead (20 Mins)"], notes: "Frame the decision members must solve." },
      { duration: "4 min each", activity: "Member proposals", roles: ["Prepared Presentation 1", "Prepared Presentation 2", "Prepared Presentation 3", "Prepared Presentation 4"], notes: "Present a clear recommendation with reasons." },
      { duration: "10 min", activity: "Moderated discussion", roles: ["iChair"], notes: "Invite questions and compare options." }
    ]
  },
  {
    offset: "+55 min",
    title: "Decision and Reflection",
    items: [
      { duration: "5 min", activity: "Vote or consensus", roles: ["iChair Report"], notes: "Record the selected recommendation." },
      { duration: "2 min each", activity: "Leadership feedback", roles: ["Prepared Presentation Evaluator 1", "Prepared Presentation Evaluator 2"], notes: "Evaluate clarity, teamwork, and decision quality." },
      { duration: "5 min", activity: "Closing thought", roles: ["iChair"], notes: "Summarize lessons and next steps." }
    ]
  }
];

function agendaSectionsForTemplate(templateType: string) {
  const normalizedTemplate = normalize(templateType);

  if (normalizedTemplate.includes("debate")) {
    return debateMeetingSections;
  }

  if (normalizedTemplate.includes("townhall")) {
    return townHallMeetingSections;
  }

  return regularMeetingSections;
}

function assignedMemberName(slot: AgendaRoleSlot) {
  return slot.assignedStudent
    ? `${slot.assignedStudent.user.firstName} ${slot.assignedStudent.user.lastName}`
    : "None";
}

function assignedMemberForRole(roleSlots: AgendaRoleSlot[], requestedRole: string) {
  const pairedMainRole = mainRoleNameForReportRole(requestedRole);

  if (pairedMainRole) {
    const mainSlot = roleSlots.find((candidate) => (
      normalize(roleSlotName(candidate)) === normalize(pairedMainRole)
      || normalize(candidate.roleDefinition.name) === normalize(pairedMainRole)
    ));

    if (mainSlot?.assignedStudent) {
      return assignedMemberName(mainSlot);
    }
  }

  const slot = roleSlots.find((candidate) => roleMatches(roleSlotName(candidate), requestedRole));

  return slot ? assignedMemberName(slot) : "None";
}

function roleSlotName(slot: AgendaRoleSlot) {
  return slot.slotLabel || slot.roleDefinition.name;
}

function roleMatches(actualRole: string, requestedRole: string) {
  const actual = normalize(actualRole);
  const requested = normalize(requestedRole);
  const aliases = roleAliases[requested] ?? [requested];

  return aliases.some((alias) => actual === alias || actual.includes(alias));
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const roleAliases: Record<string, string[]> = {
  chair: ["chair", "ichair"],
  ichair: ["ichair", "chair"],
  grammarian: ["grammarian", "igrammarian"],
  igrammarian: ["igrammarian", "grammarian"],
  ahcounter: ["ahcounter", "fillercounter", "ifillercounter"],
  ifillercounter: ["ifillercounter", "ahcounter", "fillercounter"],
  finemaster: ["finemaster", "finesmaster", "ifinesmaster", "quizmaster"],
  finesmaster: ["finesmaster", "ifinesmaster", "finemaster", "quizmaster"],
  ifinesmaster: ["ifinesmaster", "finesmaster", "finemaster", "quizmaster"],
  quizmaster: ["quizmaster", "finemaster", "finesmaster", "ifinesmaster"],
  timer: ["timer", "itimer"],
  itimer: ["itimer", "timer"],
  speaker1: ["speaker1", "preparedspeech1"],
  speaker2: ["speaker2", "preparedspeech2"],
  speaker3: ["speaker3", "preparedspeech3"],
  speaker4: ["speaker4", "preparedspeech4"],
  evaluator1: ["evaluator1", "preparedspeechevaluator1"],
  evaluator2: ["evaluator2", "preparedspeechevaluator2"],
  evaluator3: ["evaluator3", "preparedspeechevaluator3"],
  evaluator4: ["evaluator4", "preparedspeechevaluator4"],
  debatemoderator: ["debatemoderator"],
  townhalllead: ["townhalllead"]
};
