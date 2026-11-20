/** Message categories: must match the list in firestore.rules (messages.category). */
export const MESSAGE_CATEGORIES = ['Job Inquiry', 'Collaboration', 'Technical Question', 'Feedback', 'General'] as const;
export type MessageCategory = (typeof MESSAGE_CATEGORIES)[number];

/**
 * Keyword rules for sorting contact messages without asking the visitor to pick a
 * topic. Entries are lowercase words or short phrases; a trailing "*" matches any
 * ending (e.g. "recruit*" -> recruiter, recruiting). Order = tie-break priority.
 */
export const CATEGORY_KEYWORDS: [Exclude<MessageCategory, 'General'>, string[]][] = [
  ['Job Inquiry', [
    'job*', 'hire', 'hiring', 'hired', 'recruit*', 'role', 'roles', 'position*', 'opening*', 'vacanc*', 'intern', 'interns', 'internship*',
    'full-time', 'full time', 'part-time', 'part time', 'interview*', 'offer letter', 'job offer', 'salary', 'ctc', 'stipend', 'compensation',
    'resume', 'cv', 'candidate*', 'apply', 'application', 'placement*', 'onboard*', 'joining', 'talent', 'hr', 'career*', 'employ*', 'opportunit*',
  ]],
  ['Collaboration', [
    'collab*', 'partner*', 'team up', 'teaming up', 'work together', 'working together', 'build together', 'join our team', 'join us', 'co-found*',
    'cofound*', 'startup', 'side project', 'open source', 'open-source', 'contribut*', 'hackathon', 'joint', 'together on', 'freelanc*', 'project idea',
  ]],
  ['Technical Question', [
    'how do', 'how did', 'how does', 'how can', 'how to', 'why does', 'error*', 'exception', 'bug', 'bugs', 'issue*', 'code', 'source code',
    'github', 'repo', 'repository', 'dataset*', 'model', 'models', 'accuracy', 'implement*', 'architecture', 'deploy*', 'api', 'python', 'pytorch',
    'tensorflow', 'react', 'fastapi', 'ollama', 'llm', 'rag', 'train*', 'fine-tun*', 'algorithm*', 'doubt', 'explain', 'technical', 'question*',
  ]],
  ['Feedback', [
    'feedback', 'love', 'loved', 'great', 'awesome', 'amazing', 'nice', 'impressive', 'impressed', 'beautiful', 'cool', 'well done', 'good work',
    'great work', 'suggest*', 'improve*', 'typo', 'broken link', 'your portfolio', 'your website', 'your site', 'the website', 'design', 'animation*',
  ]],
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const MATCHERS = CATEGORY_KEYWORDS.map(([cat, words]) => [
  cat,
  words.map((w) => new RegExp(`(?:^|[^a-z0-9])${escape(w.replace(/\*$/, '')).replace(/\\ /g, '\\s+')}${w.endsWith('*') ? '[a-z-]*' : ''}(?![a-z0-9])`, 'gi')),
] as const);

/** Score each category (subject hits count double) and return the best, else General. */
export function classifyMessage(subject: string, message: string): MessageCategory {
  const s = ` ${subject.toLowerCase()} `;
  const m = ` ${message.toLowerCase()} `;
  let best: MessageCategory = 'General';
  let bestScore = 0;
  for (const [cat, res] of MATCHERS) {
    let score = 0;
    for (const re of res) {
      score += (s.match(re)?.length ?? 0) * 2 + (m.match(re)?.length ?? 0);
    }
    if (score > bestScore) { best = cat; bestScore = score; } // strict ">" keeps the priority order on ties
  }
  return best;
}
