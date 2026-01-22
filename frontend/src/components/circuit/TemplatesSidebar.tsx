import { useState } from 'react'
import { CellData, ModelSlot, InputMode } from './CircuitBoard'

export interface NotebookTemplate {
  id: string
  name: string
  description: string
  icon: string
  category: 'thinking' | 'writing' | 'music' | 'data' | 'code' | 'scripts'
  cells: Omit<CellData, 'id' | 'status'>[]
}

const CATEGORIES = [
  { id: 'thinking', label: 'THINK', icon: '🧠' },
  { id: 'writing', label: 'WRITE', icon: '✍️' },
  { id: 'music', label: 'MUSIC', icon: '🎵' },
  { id: 'data', label: 'DATA', icon: '📁' },
  { id: 'code', label: 'CODE', icon: '💻' },
  { id: 'scripts', label: 'SCRIPT', icon: '⚙️' },
] as const

// Cell helpers with optional inputMode
const ai = (
  label: string, 
  content: string, 
  slot: ModelSlot = 'A', 
  inputMode: InputMode = 'previous'
): Omit<CellData, 'id' | 'status'> => ({
  type: 'ai_processor', label, content, output: '', modelSlot: slot, inputMode,
})

const input = (label: string, content: string): Omit<CellData, 'id' | 'status'> => ({
  type: 'data_input', label, content, output: '', inputMode: 'none',
})

const output = (label: string = 'OUTPUT', inputMode: InputMode = 'previous'): Omit<CellData, 'id' | 'status'> => ({
  type: 'log_entry', label, content: '', output: '', inputMode,
})

const script = (label: string, content: string, inputMode: InputMode = 'previous'): Omit<CellData, 'id' | 'status'> => ({
  type: 'script_execution', label, content, output: '', inputMode,
})

const data = (label: string, filePath: string, readMode: string = 'raw', inputMode: InputMode = 'none'): Omit<CellData, 'id' | 'status'> => ({
  type: 'data_loader', label, content: filePath, output: '', readMode, inputMode,
})

export const NOTEBOOK_TEMPLATES: NotebookTemplate[] = [
  // ============================================
  // THINKING - Sharp reasoning tools
  // ============================================
  {
    id: 'steelman',
    name: 'Steel Man',
    description: 'Best case for, best case against, decide',
    icon: '⚔️',
    category: 'thinking',
    cells: [
      input('CLAIM', 'Should I quit my job to start a company?'),
      ai('FOR', 'Strongest argument FOR. Best evidence, most charitable interpretation. Make it compelling.', 'A'),
      ai('AGAINST', 'Strongest argument AGAINST. Real risks, what could go wrong. Be harsh.', 'B'),
      ai('VERDICT', 'Read both arguments above. Weigh them. What\'s the honest answer? What would change it?', 'B', 'all'),
      output('DECISION'),
    ]
  },
  {
    id: 'inversion',
    name: 'Inversion',
    description: 'How to fail → avoid that → succeed',
    icon: '🔃',
    category: 'thinking',
    cells: [
      input('GOAL', 'Launch a successful product'),
      ai('FAIL', 'How to GUARANTEE failure? List every way to screw this up.', 'B'),
      ai('AVOID', 'Flip each failure into a success rule. These are your non-negotiables.', 'A'),
      output('SUCCESS PATH'),
    ]
  },
  {
    id: 'second-order',
    name: 'Second Order',
    description: 'What happens after what happens?',
    icon: '🌊',
    category: 'thinking',
    cells: [
      input('ACTION', 'We\'re going to raise prices by 20%'),
      ai('FIRST', 'Immediate effects. What happens right away?', 'C'),
      ai('THEN', 'Second order: How do customers adapt? Competitors? What feedback loops start?', 'B'),
      ai('EQUILIBRIUM', 'Review the first and second order effects. Where does this settle? Net: worth it?', 'B', 'all'),
      output('ANALYSIS'),
    ]
  },
  {
    id: 'fence',
    name: 'Chesterton\'s Fence',
    description: 'Why does this exist before killing it?',
    icon: '🚧',
    category: 'thinking',
    cells: [
      input('TO REMOVE', 'This legacy approval process that slows everything down'),
      ai('WHY', 'Why was this created? What problem? Who benefits? What breaks without it?', 'B'),
      ai('SAFE CHANGE', 'Given this context, how to get what you want while preserving the original function?', 'A', 'all'),
      output('APPROACH'),
    ]
  },
  {
    id: 'five-whys',
    name: 'Five Whys',
    description: 'Dig to the root cause',
    icon: '🔍',
    category: 'thinking',
    cells: [
      input('PROBLEM', 'Our best engineer just quit'),
      ai('DIG', 'Ask "why" 5 times. Each answer becomes the next question. Find the systemic cause.', 'B'),
      ai('FIX', 'What action addresses the ROOT, not symptoms?', 'A'),
      output('ROOT CAUSE'),
    ]
  },
  {
    id: 'first-principles',
    name: 'First Principles',
    description: 'Strip to physics, rebuild',
    icon: '🧱',
    category: 'thinking',
    cells: [
      input('PROBLEM', 'Electric car batteries are too expensive'),
      ai('ASSUMPTIONS', 'What does everyone assume? List every "that\'s just how it is."', 'B'),
      ai('PHYSICS', 'What\'s actually TRUE? What are the fundamental constraints?', 'B'),
      ai('REBUILD', 'Given the problem and the physics, design from fundamentals only. Ignore convention.', 'A', 'all'),
      output('BREAKTHROUGH'),
    ]
  },
  {
    id: 'premortem',
    name: 'Pre-Mortem',
    description: 'It failed. Why? Now prevent it.',
    icon: '💀',
    category: 'thinking',
    cells: [
      input('PLAN', 'We\'re launching the new feature next month'),
      ai('OBITUARY', 'It\'s 6 months later. Project is dead. Write the post-mortem. What killed it?', 'B'),
      ai('PREVENT', 'For each cause of death: what action NOW would prevent it?', 'A'),
      output('SAFEGUARDS'),
    ]
  },
  {
    id: 'red-team',
    name: 'Red Team',
    description: 'Attack your idea, then fortify',
    icon: '🎯',
    category: 'thinking',
    cells: [
      input('IDEA', 'We should expand into the European market'),
      ai('DESTROY', 'You\'re the opposition. Tear this apart. Find every weakness.', 'B'),
      ai('DEFEND', 'Review the original idea and the attacks. Address each attack. Strengthen or admit the limitation.', 'A', 'all'),
      output('BATTLE-TESTED'),
    ]
  },
  {
    id: 'opportunity-cost',
    name: 'Opportunity Cost',
    description: 'What are you NOT doing?',
    icon: '⚖️',
    category: 'thinking',
    cells: [
      input('CHOICE', 'Spending 3 months building feature X'),
      ai('ALTERNATIVES', 'What ELSE could you do with 3 months? List all options including "nothing."', 'A'),
      ai('BEST ALT', 'What\'s the single best alternative? What\'s its value?', 'B'),
      ai('TRUE COST', 'Review the choice and alternatives. Feature X costs = best alternative forgone. Still worth it?', 'B', 'all'),
      output('DECISION'),
    ]
  },

  // ============================================
  // WRITING - Actually useful writing tools
  // ============================================
  {
    id: 'memo',
    name: 'One-Pager',
    description: 'Amazon-style memo: context, problem, solution',
    icon: '📝',
    category: 'writing',
    cells: [
      input('TOPIC', 'Proposal to switch from Slack to Discord for company chat'),
      ai('DRAFT', 'Write a one-page memo: CONTEXT (why now), PROBLEM (what\'s broken), SOLUTION (what to do), TRADEOFFS (costs), ASK (decision needed).', 'A'),
      ai('EDIT', 'Cut it in half. Remove weasel words. Make every sentence earn its place.', 'B'),
      output('MEMO'),
    ]
  },
  {
    id: 'cold-email',
    name: 'Cold Email',
    description: 'Get replies from strangers',
    icon: '📧',
    category: 'writing',
    cells: [
      input('GOAL', 'Get a meeting with VP of Engineering at Stripe to discuss partnership'),
      ai('RESEARCH', 'What would this person care about? What\'s their likely pain? What makes you credible?', 'B'),
      ai('DRAFT', 'Write the email. Short. Specific value prop. Clear ask. No fluff.', 'A'),
      ai('SUBJECT', 'Write 5 subject lines. Pick the one that would make YOU open it.', 'A'),
      output('EMAIL'),
    ]
  },
  {
    id: 'explain',
    name: 'Explain Complex Thing',
    description: 'Make hard things simple',
    icon: '🎓',
    category: 'writing',
    cells: [
      input('CONCEPT', 'Explain how transformers (the AI architecture) work'),
      ai('SIMPLE', 'Explain to a smart 12-year-old. Analogies. No jargon. Build up step by step.', 'A'),
      ai('GAPS', 'What did that explanation skip? What would a curious person ask next?', 'B'),
      ai('COMPLETE', 'Fill the gaps without losing clarity.', 'A'),
      output('EXPLANATION'),
    ]
  },
  {
    id: 'thread',
    name: 'Twitter Thread',
    description: 'Idea → viral thread',
    icon: '🧵',
    category: 'writing',
    cells: [
      input('INSIGHT', 'Most productivity advice is backwards - you should do less, not optimize more'),
      ai('HOOK', 'Write 5 opening tweets. Controversial, specific, makes people want to read more.', 'A'),
      ai('THREAD', 'Build the thread: hook → story/evidence → counterintuitive insight → takeaway. 8-12 tweets.', 'A'),
      ai('SHARPEN', 'Make each tweet punchier. Remove filler. Add one specific example.', 'B'),
      output('THREAD'),
    ]
  },
  {
    id: 'story-spine',
    name: 'Story Spine',
    description: 'Pixar structure for any narrative',
    icon: '📖',
    category: 'writing',
    cells: [
      input('SEED', 'Startup founder burns out, loses everything, rebuilds differently'),
      ai('SPINE', 'Fill in: Once upon a time... Every day... Until one day... Because of that... Until finally... And ever since then... The moral is...', 'A'),
      ai('FLESH', 'Add specific details, dialogue, sensory moments. Make it vivid.', 'A'),
      ai('TRIM', 'Cut 30%. Keep only what advances plot or reveals character.', 'B'),
      output('STORY'),
    ]
  },
  {
    id: 'compress',
    name: 'Compress',
    description: '→ paragraph → sentence → word',
    icon: '📦',
    category: 'writing',
    cells: [
      input('SOURCE', 'Paste long text here...'),
      ai('PARA', 'Compress to ONE paragraph. What\'s the core?', 'B'),
      ai('SENTENCE', 'Now ONE sentence.', 'B'),
      ai('WORD', 'Now ONE word that captures the essence.', 'B'),
      output('COMPRESSED'),
    ]
  },
  {
    id: 'debate',
    name: 'Debate Prep',
    description: 'Know all sides before the fight',
    icon: '🥊',
    category: 'writing',
    cells: [
      input('POSITION', 'AI will create more jobs than it destroys'),
      ai('YOUR CASE', 'Build your argument: claims, evidence, logic.', 'A'),
      ai('THEIR CASE', 'Build the BEST opposing argument. What would destroy you?', 'B'),
      ai('REBUTTALS', 'Prepare responses to their strongest points.', 'A'),
      output('PREP'),
    ]
  },

  // ============================================
  // MUSIC - Practical songwriting
  // ============================================
  {
    id: 'concept-song',
    name: 'Concept → Song',
    description: 'Feeling to finished lyrics',
    icon: '💭',
    category: 'music',
    cells: [
      input('CONCEPT', 'The exhaustion of pretending to be okay at work'),
      ai('IMAGES', '10 specific images/moments that embody this. Be visceral.', 'A'),
      ai('HOOK', 'The chorus hook - one phrase that says it all. 5 options.', 'A'),
      ai('LYRICS', 'Full lyrics: V1, Chorus, V2, Chorus, Bridge, Chorus. Use the images. No clichés.', 'A'),
      output('SONG'),
    ]
  },
  {
    id: 'rewrite-lyrics',
    name: 'Rewrite Lyrics',
    description: 'Fix what\'s not working',
    icon: '✏️',
    category: 'music',
    cells: [
      input('LYRICS', 'Paste your current lyrics...'),
      ai('DIAGNOSE', 'What\'s weak? Clichés, vague lines, rhythm issues, missing emotion?', 'B'),
      ai('FIX', 'Rewrite the weak parts. Keep what works. Show alternatives.', 'A'),
      output('IMPROVED'),
    ]
  },
  {
    id: 'chord-mood',
    name: 'Mood → Chords',
    description: 'Emotion to musical language',
    icon: '🎹',
    category: 'music',
    cells: [
      input('MOOD', 'Nostalgic but not sad - like looking at old photos and smiling'),
      ai('QUALITIES', 'Tempo, major/minor, sparse/full, rhythm feel, register. Be specific.', 'B'),
      ai('PROGRESSIONS', '3 chord progressions that nail this mood. Show the chords.', 'A'),
      output('MUSIC'),
    ]
  },
  {
    id: 'hook-lab',
    name: 'Hook Lab',
    description: 'Forge an earworm',
    icon: '🪝',
    category: 'music',
    cells: [
      input('THEME', 'Song about finally leaving a toxic relationship'),
      ai('HOOKS', '15 potential hook lines. Questions, statements, twists on clichés, unexpected angles.', 'A'),
      ai('RANK', 'Rank by: memorable? singable? captures essence? Pick top 3.', 'B'),
      ai('POLISH', 'Refine top 3: better syllables, stronger vowels for singing.', 'A'),
      output('HOOKS'),
    ]
  },
  {
    id: 'bridge-writer',
    name: 'Write the Bridge',
    description: 'The turn that saves the song',
    icon: '🌉',
    category: 'music',
    cells: [
      input('SONG', 'Paste V1, Chorus, V2 here... [what\'s the song about?]'),
      ai('ANALYZE', 'What has the song said so far? What HASN\'T been said? What twist would elevate it?', 'B'),
      ai('BRIDGES', 'Write 3 different bridges: 1) new perspective 2) confession/reveal 3) zoom out/bigger picture', 'A'),
      output('BRIDGE'),
    ]
  },
  {
    id: 'genre-flip',
    name: 'Genre Flip',
    description: 'Same song, different universe',
    icon: '🔀',
    category: 'music',
    cells: [
      input('SONG', 'Describe song or paste lyrics/chords'),
      input('GENRES', 'bossa nova, trap, 80s synth ballad'),
      ai('FLIP', 'Reimagine in each genre: tempo, instruments, production, vocal style. Be specific.', 'A'),
      output('VERSIONS'),
    ]
  },
  {
    id: 'production-notes',
    name: 'Production Notes',
    description: 'Arrangement and texture ideas',
    icon: '🎛️',
    category: 'music',
    cells: [
      input('SONG', 'Describe: structure, chords, tempo, mood. Current arrangement?'),
      ai('LAYERS', 'What instruments when? Build dynamics through the song. Entrances, exits.', 'A'),
      ai('DETAILS', 'Specific production moments: effects, transitions, ear candy. What makes each section distinct?', 'A'),
      output('PRODUCTION'),
    ]
  },

  // ============================================
  // DATA - Real files, real analysis
  // ============================================
  {
    id: 'seattle-wages',
    name: 'Seattle Wage Analysis',
    description: 'Analyze city salary data',
    icon: '💰',
    category: 'data',
    cells: [
      data('LOAD', 'City_of_Seattle_Wage_Data.csv', 'stats'),
      ai('FINDINGS', 'From these stats: What stands out? Highest/lowest paid? Any surprises?', 'A'),
      ai('QUESTIONS', 'What follow-up analysis would be interesting? Gender gaps? Department comparisons?', 'B'),
      output('ANALYSIS'),
    ]
  },
  {
    id: 'wildlife-strikes',
    name: 'FAA Wildlife Strikes',
    description: 'Preview and analyze aviation incidents',
    icon: '🦅',
    category: 'data',
    cells: [
      data('PREVIEW', 'faa-wildlife-strikes.csv', 'preview'),
      ai('UNDERSTAND', 'What is this data? Key columns? How should we analyze it?', 'C'),
      input('QUESTION', 'What do you want to know? (e.g., Which airports have most strikes? What species?)'),
      ai('ANALYZE', 'Review the data preview and the question above. Answer based on what you can see.', 'A', 'all'),
      output('FINDINGS'),
    ]
  },
  {
    id: 'alice-summary',
    name: 'Summarize Alice',
    description: 'AI-summarize a classic book',
    icon: '📚',
    category: 'data',
    cells: [
      data('BOOK', 'alice.pdf', 'summarize'),
      ai('THEMES', 'From this summary: What are the major themes? What is Carroll saying?', 'A'),
      ai('MODERN', 'Review the summary and themes. How is this story relevant today? What would a modern retelling look like?', 'A', 'all'),
      output('ANALYSIS'),
    ]
  },
  {
    id: 'qa-alice',
    name: 'Ask Alice',
    description: 'Query a document',
    icon: '❓',
    category: 'data',
    cells: [
      data('BOOK', 'alice.pdf', 'raw'),
      input('QUESTION', 'What advice does the Cheshire Cat give Alice?'),
      ai('ANSWER', 'You have the book and the question. Answer using ONLY the document. Quote relevant passages.', 'A', 'all'),
      output('ANSWER'),
    ]
  },
  {
    id: 'csv-to-json',
    name: 'CSV → JSON',
    description: 'Convert data formats',
    icon: '🔄',
    category: 'data',
    cells: [
      data('CSV', 'City_of_Seattle_Wage_Data.csv', 'preview'),
      ai('CONVERT', 'Convert the first 10 rows to clean JSON. Use sensible field names.', 'A'),
      script('WRAP', '{\n  "data": [\n{{input}}\n  ]\n}'),
      output('JSON'),
    ]
  },
  {
    id: 'structure-explore',
    name: 'Explore File Structure',
    description: 'Understand what you\'re working with',
    icon: '🔬',
    category: 'data',
    cells: [
      data('FILE', 'faa-wildlife-strikes.csv', 'structure'),
      ai('INSIGHTS', 'From this structure: What questions can this data answer? What would be interesting to explore?', 'A'),
      output('IDEAS'),
    ]
  },
  {
    id: 'compare-csvs',
    name: 'Compare Datasets',
    description: 'Two files, find differences',
    icon: '⚖️',
    category: 'data',
    cells: [
      data('FILE 1', 'City_of_Seattle_Wage_Data.csv', 'structure'),
      data('FILE 2', 'faa-wildlife-strikes.csv', 'structure'),
      ai('COMPARE', 'You have the structure of two datasets. Compare them: similar/different? Could they be joined?', 'B', 'all'),
      output('COMPARISON'),
    ]
  },
  {
    id: 'data-story',
    name: 'Data → Story',
    description: 'Turn numbers into narrative',
    icon: '📰',
    category: 'data',
    cells: [
      data('DATA', 'City_of_Seattle_Wage_Data.csv', 'stats'),
      ai('STORY', 'Write a compelling 2-paragraph story a journalist might tell from this data. Find the human angle.', 'A'),
      ai('HEADLINE', 'Review the data and story. Write 5 headlines that make people want to click.', 'A', 'all'),
      output('ARTICLE'),
    ]
  },

  // ============================================
  // CODE - Developer workflows
  // ============================================
  {
    id: 'debug',
    name: 'Debug',
    description: 'Systematic bug hunt',
    icon: '🐛',
    category: 'code',
    cells: [
      input('BUG', 'Error: "Cannot read property \'map\' of undefined" on line 42'),
      ai('HYPOTHESES', '5 likely causes, ranked. What would confirm each?', 'B'),
      ai('FIX', 'For the most likely cause: show the exact fix.', 'A'),
      output('SOLUTION'),
    ]
  },
  {
    id: 'review',
    name: 'Code Review',
    description: 'Catch bugs, improve clarity',
    icon: '👁️',
    category: 'code',
    cells: [
      input('CODE', 'Paste code to review...'),
      ai('ISSUES', 'Bugs, edge cases, code smells. Be specific with line numbers.', 'B'),
      ai('IMPROVED', 'Show the refactored version with comments explaining changes.', 'A'),
      output('REVIEW'),
    ]
  },
  {
    id: 'architect',
    name: 'Architect',
    description: 'Design before building',
    icon: '🏗️',
    category: 'code',
    cells: [
      input('REQUIREMENTS', 'Build a URL shortener that handles 10k requests/second'),
      ai('DESIGN', 'High-level architecture. Components, how they connect. ASCII diagram.', 'A'),
      ai('TRADEOFFS', 'What could go wrong? Scaling bottlenecks? What decisions need more thought?', 'B'),
      output('ARCHITECTURE'),
    ]
  },
  {
    id: 'name-things',
    name: 'Name Things',
    description: 'Finally, good names',
    icon: '🏷️',
    category: 'code',
    cells: [
      input('THING', 'A function that checks if a user can access a resource based on their role and the resource\'s permissions'),
      ai('OPTIONS', '10 names. Verbs for functions. Clear > clever. Consider: canAccessResource, hasPermission, checkAuthorization...', 'A'),
      ai('PICK', 'Rank them. Why is #1 best? What context matters?', 'B'),
      output('NAME'),
    ]
  },
  {
    id: 'explain-code',
    name: 'Explain Code',
    description: 'Understand unfamiliar code',
    icon: '🔬',
    category: 'code',
    cells: [
      input('CODE', 'Paste confusing code...'),
      ai('OVERVIEW', 'What does this do? One sentence.', 'C'),
      ai('WALKTHROUGH', 'Step by step, what happens? Explain tricky parts.', 'A'),
      ai('IMPROVE', 'How would you make this clearer?', 'B'),
      output('EXPLAINED'),
    ]
  },
  {
    id: 'regex',
    name: 'Regex Builder',
    description: 'Finally understand that regex',
    icon: '🎭',
    category: 'code',
    cells: [
      input('NEED', 'Match email addresses, but only .com and .org domains'),
      ai('REGEX', 'Write the regex. Explain each part.', 'A'),
      ai('TEST', 'Show 5 strings that match and 5 that don\'t.', 'B'),
      output('REGEX'),
    ]
  },

  // ============================================
  // SCRIPTS - Transformations and formats
  // ============================================
  {
    id: 'commit',
    name: 'Commit Message',
    description: 'Conventional commit from diff',
    icon: '📌',
    category: 'scripts',
    cells: [
      input('CHANGES', 'Added error handling to user auth, fixed null pointer in checkout'),
      ai('ANALYZE', 'Type (feat/fix/refactor), scope, summary. Breaking changes?', 'C'),
      ai('MESSAGE', 'Write conventional commit:\n<type>(<scope>): <subject>\n\n<body>', 'C'),
      output('COMMIT'),
    ]
  },
  {
    id: 'pr-desc',
    name: 'PR Description',
    description: 'Summarize for reviewers',
    icon: '📋',
    category: 'scripts',
    cells: [
      input('CHANGES', 'Describe what you changed and why'),
      ai('PR', 'Write PR description:\n## Summary\n## Changes\n## Testing\n## Screenshots (if applicable)', 'A'),
      output('PR DESC'),
    ]
  },
  {
    id: 'sql',
    name: 'SQL Builder',
    description: 'English → SQL',
    icon: '🗃️',
    category: 'scripts',
    cells: [
      input('QUESTION', 'Find all users who signed up last month and made at least 3 purchases'),
      ai('SQL', 'Write the SQL. Use clear aliases. Add comments.', 'A'),
      ai('OPTIMIZE', 'Any performance concerns? Suggest indexes.', 'B'),
      output('QUERY'),
    ]
  },
  {
    id: 'test-cases',
    name: 'Test Cases',
    description: 'Generate test scenarios',
    icon: '🧪',
    category: 'scripts',
    cells: [
      input('FUNCTION', 'describe the function: calculateShipping(weight, zone, isPrime)'),
      ai('CASES', 'List test cases: happy path, edge cases, error cases. Inputs → expected output.', 'B'),
      ai('CODE', 'Write the tests (Jest).', 'A'),
      output('TESTS'),
    ]
  },
  {
    id: 'api-docs',
    name: 'API Docs',
    description: 'Document an endpoint',
    icon: '📡',
    category: 'scripts',
    cells: [
      input('ENDPOINT', 'POST /api/users - creates a new user with email, password, name'),
      ai('DOCS', 'Write API docs: description, request body, response, errors, example curl.', 'A'),
      script('FORMAT', '## {{input}}'),
      output('DOCUMENTATION'),
    ]
  },
  {
    id: 'cron',
    name: 'Cron Expression',
    description: 'Human time → cron syntax',
    icon: '⏰',
    category: 'scripts',
    cells: [
      input('SCHEDULE', 'Every weekday at 9am, every Sunday at midnight, first of every month at 6pm'),
      ai('CRON', 'Write the cron expressions. Explain each part.', 'A'),
      output('CRON'),
    ]
  },
  {
    id: 'changelog',
    name: 'Changelog',
    description: 'Technical → user-friendly',
    icon: '📰',
    category: 'scripts',
    cells: [
      input('CHANGES', 'fixed auth race condition, added dark mode, refactored user service, upgraded React to 18'),
      ai('CHANGELOG', 'User-facing changelog: Added, Changed, Fixed. Write for users, not developers.', 'A'),
      script('FORMAT', '## [1.2.0] - {{DATE}}\n\n{{input}}'),
      output('CHANGELOG'),
    ]
  },
  {
    id: 'prompt-craft',
    name: 'Prompt Craft',
    description: 'Build better AI prompts',
    icon: '🎯',
    category: 'scripts',
    cells: [
      input('GOAL', 'I want an AI that helps write marketing copy for SaaS products'),
      ai('PROMPT', 'Write the system prompt: role, context, constraints, examples, output format.', 'A'),
      ai('TEST', 'Test with a sample input. Does it work? What\'s missing?', 'B'),
      output('PROMPT'),
    ]
  },
]


interface TemplatesSidebarProps {
  onSelectTemplate: (template: NotebookTemplate) => void
  isCollapsed: boolean
  onToggleCollapse: () => void
}

export function TemplatesSidebar({ onSelectTemplate, isCollapsed, onToggleCollapse }: TemplatesSidebarProps) {
  const [activeCategory, setActiveCategory] = useState<typeof CATEGORIES[number]['id']>('thinking')
  
  const filteredTemplates = NOTEBOOK_TEMPLATES.filter(t => t.category === activeCategory)

  return (
    <div 
      className={`h-full bg-slate border-r border-terminal-border transition-all duration-200 flex flex-col ${
        isCollapsed ? 'w-10' : 'w-56'
      }`}
    >
      {/* Header */}
      <div className="p-2 border-b border-terminal-border flex items-center justify-between">
        {!isCollapsed && (
          <span className="text-[10px] text-terminal-muted tracking-widest">TEMPLATES</span>
        )}
        <button
          onClick={onToggleCollapse}
          className="text-terminal-muted hover:text-phosphor text-xs p-1"
          title={isCollapsed ? 'Expand' : 'Collapse'}
        >
          {isCollapsed ? '▶' : '◀'}
        </button>
      </div>

      {/* Category Tabs */}
      {!isCollapsed && (
        <div className="flex border-b border-terminal-border">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex-1 py-2 text-[9px] tracking-wider transition-colors ${
                activeCategory === cat.id
                  ? 'text-phosphor border-b-2 border-phosphor bg-void/50'
                  : 'text-terminal-muted hover:text-phosphor'
              }`}
              title={cat.label}
            >
              <span className="block text-sm mb-0.5">{cat.icon}</span>
              {cat.label}
            </button>
          ))}
        </div>
      )}

      {/* Template List */}
      {!isCollapsed && (
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredTemplates.map((template) => (
            <button
              key={template.id}
              onClick={() => onSelectTemplate(template)}
              className="w-full text-left p-2 hover:bg-void group transition-colors"
              title={template.description}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm">{template.icon}</span>
                <span className="text-xs text-terminal-muted group-hover:text-phosphor truncate">
                  {template.name}
                </span>
              </div>
              <p className="text-[9px] text-terminal-muted/60 mt-1 line-clamp-2 pl-6">
                {template.description}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Collapsed view */}
      {isCollapsed && (
        <div className="flex-1 flex flex-col">
          <div className="border-b border-terminal-border">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`w-full p-2 flex justify-center transition-colors ${
                  activeCategory === cat.id
                    ? 'text-phosphor bg-void/50'
                    : 'text-terminal-muted hover:text-phosphor'
                }`}
                title={cat.label}
              >
                <span className="text-sm">{cat.icon}</span>
              </button>
            ))}
          </div>
          
          <div className="flex-1 overflow-y-auto py-2">
            {filteredTemplates.map((template) => (
              <button
                key={template.id}
                onClick={() => onSelectTemplate(template)}
                className="w-full p-2 hover:bg-void flex justify-center"
                title={`${template.name}: ${template.description}`}
              >
                <span className="text-sm">{template.icon}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      {!isCollapsed && (
        <div className="p-2 border-t border-terminal-border">
          <div className="flex items-center justify-center gap-3 text-[9px]">
            <span style={{ color: '#33ff00' }}>A</span>
            <span style={{ color: '#00bfff' }}>B</span>
            <span style={{ color: '#ff9500' }}>C</span>
          </div>
        </div>
      )}
    </div>
  )
}
