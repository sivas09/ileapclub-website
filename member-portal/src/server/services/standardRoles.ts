export const standardIleapRoleDefinitions = [
  ["iChair", "Lead the meeting, transitions, introductions, and closing."],
  ["iGrammarian", "Introduce the phrase or idiom of the day and report language usage."],
  ["iFiller Counter", "Track filler words and repeated phrases."],
  ["iFinesMaster", "Lead the fine, quiz, or participation challenge."],
  ["iTimer", "Track timing and present the timer report."],
  ["Prepared Speech 1", "Deliver prepared speech 1."],
  ["Prepared Speech 2", "Deliver prepared speech 2."],
  ["Prepared Speech 3", "Deliver prepared speech 3."],
  ["Prepared Speech 4", "Deliver prepared speech 4."],
  ["Prepared Speech Evaluator 1", "Evaluate prepared speech 1."],
  ["Prepared Speech Evaluator 2", "Evaluate prepared speech 2."],
  ["Prepared Speech Evaluator 3", "Evaluate prepared speech 3."],
  ["Prepared Speech Evaluator 4", "Evaluate prepared speech 4."],
  ["Prepared Presentation 1", "Deliver prepared presentation 1."],
  ["Prepared Presentation 2", "Deliver prepared presentation 2."],
  ["Prepared Presentation 3", "Deliver prepared presentation 3."],
  ["Prepared Presentation 4", "Deliver prepared presentation 4."],
  ["Prepared Presentation Evaluator 1", "Evaluate prepared presentation 1."],
  ["Prepared Presentation Evaluator 2", "Evaluate prepared presentation 2."],
  ["Prepared Presentation Evaluator 3", "Evaluate prepared presentation 3."],
  ["Prepared Presentation Evaluator 4", "Evaluate prepared presentation 4."],
  ["iThink on My Feet Master", "Lead the impromptu speaking segment."],
  ["iThink on My Feet Participant 1", "Complete impromptu speaking participant role 1."],
  ["iThink on My Feet Participant 2", "Complete impromptu speaking participant role 2."],
  ["iThink on My Feet Participant 3", "Complete impromptu speaking participant role 3."],
  ["iThink on My Feet Participant 4", "Complete impromptu speaking participant role 4."],
  ["iThink on My Feet Evaluator 1", "Evaluate impromptu participant 1."],
  ["iThink on My Feet Evaluator 2", "Evaluate impromptu participant 2."],
  ["iThink on My Feet Evaluator 3", "Evaluate impromptu participant 3."],
  ["iThink on My Feet Evaluator 4", "Evaluate impromptu participant 4."],
  ["iStory and Joke Master", "Lead the story and joke segment."],
  ["iStory and Joke Speaker 1", "Deliver story or joke role 1."],
  ["iStory and Joke Speaker 2", "Deliver story or joke role 2."],
  ["iStory and Joke Evaluator 1", "Evaluate story or joke role 1."],
  ["iStory and Joke Evaluator 2", "Evaluate story or joke role 2."],
  ["Case Study Lead (20 Mins)", "Lead the 20-minute case study discussion."],
  ["iChair Report", "Present the chair report."],
  ["iGrammarian Report", "Present the grammarian report."],
  ["iFiller Counter Report", "Present the filler counter report."],
  ["iFinesMaster Report", "Present the fines master report."],
  ["iTimer Report", "Present the timer report."]
] as const;

export const standardIleapRoleNames = standardIleapRoleDefinitions.map(([name]) => name);

export const standardRoleResourceKeys = [
  "iChair",
  "iGrammarian",
  "iFiller Counter",
  "iFinesMaster",
  "iTimer",
  "Prepared Speech",
  "Prepared Speech Evaluator",
  "Prepared Presentation",
  "Prepared Presentation Evaluator",
  "iThink on My Feet Master",
  "iThink on My Feet Participant",
  "iThink on My Feet Evaluator",
  "iStory and Joke Master",
  "iStory and Joke Speaker",
  "iStory and Joke Evaluator",
  "Case Study Lead",
  "iChair Report",
  "iGrammarian Report",
  "iFiller Counter Report",
  "iFinesMaster Report",
  "iTimer Report"
] as const;

export function roleResourceKey(roleName: string) {
  const normalizedRoleName = normalizeRoleKey(roleName);
  const exactKey = standardRoleResourceKeys.find((key) => normalizeRoleKey(key) === normalizedRoleName);

  if (exactKey) {
    return exactKey;
  }

  return standardRoleResourceKeys.find((key) => normalizedRoleName.startsWith(`${normalizeRoleKey(key)} `)) ?? roleName;
}

function normalizeRoleKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+\d+$/g, "")
    .replace(/\s+/g, " ");
}
