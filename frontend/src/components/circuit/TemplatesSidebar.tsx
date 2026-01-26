import { useState, useEffect, useCallback } from 'react'
import { CellData, ModelSlot, InputMode } from './CircuitBoard'
import { loadSavedCircuits, deleteCircuit, refreshCircuitsFromBackend, SavedCircuit } from '../../hooks/useCircuitRunner'

export interface NotebookTemplate {
  id: string
  name: string
  description: string
  icon: string
  category: 'thinking' | 'writing' | 'music' | 'data' | 'knowledge' | 'code' | 'scripts' | 'mine'
  cells: Omit<CellData, 'id' | 'status'>[]
}

const CATEGORIES = [
  { id: 'mine', label: 'MINE', icon: '★' },
  { id: 'thinking', label: 'THINK', icon: '🧠' },
  { id: 'writing', label: 'WRITE', icon: '✍️' },
  { id: 'music', label: 'MUSIC', icon: '🎵' },
  { id: 'data', label: 'DATA', icon: '📁' },
  { id: 'knowledge', label: 'KNOW', icon: '📚' },
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

const conditional = (
  label: string,
  conditionType: 'regex' | 'keyword' | 'length' | 'contains' | 'ai_check',
  conditionValue: string,
  onPass?: string,
  onFail?: string,
  inputMode: InputMode = 'previous',
  loopBackTo?: number,
  loopBackMax?: number
): Omit<CellData, 'id' | 'status'> => ({
  type: 'conditional',
  label,
  content: '',
  output: '',
  conditionType,
  conditionValue,
  onPass,
  onFail,
  inputMode,
  loopBackTo,
  loopBackMax,
})

const webFetch = (
  label: string,
  url: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  headers?: string,
  body?: string,
  inputMode: InputMode = 'previous'
): Omit<CellData, 'id' | 'status'> => ({
  type: 'web_fetch',
  label,
  content: url,
  output: '',
  fetchMethod: method,
  fetchHeaders: headers,
  fetchBody: body,
  inputMode,
})

const imageGen = (
  label: string,
  negativePrompt: string = '',
  inputMode: InputMode = 'previous'
): Omit<CellData, 'id' | 'status'> => ({
  type: 'image_gen',
  label,
  content: negativePrompt,
  output: '',
  inputMode,
})

const vectorIndex = (
  label: string,
  filePath: string = '',
  inputMode: InputMode = 'none'
): Omit<CellData, 'id' | 'status'> => ({
  type: 'vector_index',
  label,
  content: filePath,
  output: '',
  inputMode,
})

const vectorSearch = (
  label: string,
  query: string = '',
  inputMode: InputMode = 'none'
): Omit<CellData, 'id' | 'status'> => ({
  type: 'vector_search',
  label,
  content: query,
  output: '',
  inputMode,
})

const terminalHistory = (
  label: string,
  query: string = '',
  inputMode: InputMode = 'none'
): Omit<CellData, 'id' | 'status'> => ({
  type: 'terminal_history',
  label,
  content: query,
  output: '',
  inputMode,
})

export const NOTEBOOK_TEMPLATES: NotebookTemplate[] = [
  // ============================================
  // THINKING - Sharp reasoning tools
  // ============================================
  {
    id: 'steelman',
    name: 'Steel Man',
    description: 'Best case for, best case against, then decide',
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
    description: 'How to fail, then invert each into a rule to succeed',
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
    id: 'five-whys-root-gate',
    name: 'Five Whys (Root? Gate)',
    description: 'Loop until it’s root, not a symptom — “Is this the real cause?”',
    icon: '🔍',
    category: 'thinking',
    cells: [
      input('PROBLEM', 'Our best engineer just quit'),
      ai('DIG', 'Ask "why" 5 times. Each answer becomes the next question. Stop at the systemic cause.', 'B'),
      conditional(
        'ROOT?',
        'ai_check',
        'Is this the actual root cause, or is it still a symptom of something deeper? Could we ask "why" one more time meaningfully? Answer only YES or NO.',
        undefined,
        'Max revisions reached.',
        'previous',
        2, // loop back to DIG (1-based)
        3
      ),
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
    id: 'red-team-fortified',
    name: 'Red Team (Fortified Gate)',
    description: 'Don’t stop until every attack is answered — loop back to DEFEND if not',
    icon: '🛡️',
    category: 'thinking',
    cells: [
      input('IDEA', 'We should expand into the European market'),
      ai('DESTROY', 'You\'re the opposition. Tear this apart. Find every weakness.', 'B'),
      ai('DEFEND', 'Review the original idea and the attacks. Address each attack. Strengthen or admit the limitation.', 'A', 'all'),
      conditional(
        'FORTIFIED?',
        'ai_check',
        'Have we addressed every serious attack? Is there any gap an opponent could exploit? Answer only YES or NO.',
        undefined,
        'Max revisions reached.',
        'previous',
        3, // loop back to DEFEND (1-based)
        3
      ),
      output('BATTLE-TESTED'),
    ]
  },
  {
    id: 'idea-refiner',
    name: 'Idea Refiner (Quality Loop)',
    description: 'Expand the idea, gate: “Is it compelling?” — loops back to refine if not',
    icon: '🔄',
    category: 'thinking',
    cells: [
      input('IDEA', 'An app that helps people remember dreams'),
      ai('EXPAND', 'Flesh this out: problem, solution, why it matters. Make it clear and compelling.', 'A'),
      conditional(
        'COMPELLING?',
        'ai_check',
        'Is this idea compelling and clear? Would someone get it in 30 seconds? Answer only YES or NO.',
        undefined,
        'Max revisions reached.',
        'previous',
        2,  // loop back to EXPAND (1-based)
        3
      ),
      output('IDEA'),
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
  {
    id: 'fetch-red-team',
    name: 'Fetch & Red Team',
    description: 'Fetch article URL, attack the main claim',
    icon: '🌐',
    category: 'thinking',
    cells: [
      input('URL', 'https://example.com/op-ed-or-article'),
      webFetch('FETCH', '{{input}}', 'GET'),
      ai('CLAIM', 'Extract the main argument or claim from this text in one sentence.', 'B'),
      ai('DESTROY', 'You\'re the opposition. Tear this claim apart. Find every weakness.', 'B'),
      ai('DEFEND', 'Address each attack. Strengthen or admit the limitation.', 'A', 'all'),
      output('BATTLE-TESTED'),
    ]
  },
  {
    id: 'fetch-index-red-team',
    name: 'Fetch, Index & Red Team',
    description: 'Fetch URL, index it, then attack the claim',
    icon: '🌐',
    category: 'knowledge',
    cells: [
      input('URL', 'https://example.com/op-ed-or-article'),
      webFetch('FETCH', '{{input}}', 'GET'),
      vectorIndex('INDEX', '{{input}}', 'previous'),
      ai('CLAIM', 'Extract the main argument or claim from this text in one sentence.', 'B', 'previous'),
      vectorSearch('SEARCH', '{{input}}', 'previous'),
      ai('DESTROY', 'You\'re the opposition. Tear this claim apart. Use the search results to find weaknesses.', 'B', 'all'),
      ai('DEFEND', 'Address each attack. Strengthen or admit the limitation.', 'A', 'all'),
      output('BATTLE-TESTED'),
    ]
  },
  {
    id: 'idea-visual',
    name: 'Idea → Visual',
    description: 'One visual metaphor for your idea, then generate the image',
    icon: '🎨',
    category: 'thinking',
    cells: [
      input('IDEA', 'Compound interest is the 8th wonder of the world'),
      ai('METAPHOR', 'One visual metaphor that captures this. Concrete: objects, setting, light. No abstract shapes.', 'A'),
      ai('PROMPT', 'Turn it into a detailed image prompt. Photographic or illustration. One paragraph.', 'A'),
      imageGen('VISUAL', 'blurry, text, generic'),
      output('ART'),
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
      ai('EDIT', 'Cut it in half. Remove weasel words. Make every sentence earn its place. Target ~300 words.', 'B'),
      output('MEMO'),
    ]
  },
  {
    id: 'memo-one-page-gate',
    name: 'One-Pager (One Page Gate)',
    description: 'Gate: under ~300 words and scannable? Loop back to EDIT if not',
    icon: '📄',
    category: 'writing',
    cells: [
      input('TOPIC', 'Proposal to switch from Slack to Discord for company chat'),
      ai('DRAFT', 'Write a one-page memo: CONTEXT, PROBLEM, SOLUTION, TRADEOFFS, ASK.', 'A'),
      ai('EDIT', 'Cut to ~300 words. Remove weasel words. Make it scannable.', 'B'),
      conditional(
        'ONE PAGE?',
        'ai_check',
        'Is this under ~300 words and scannable with clear sections? Would a busy exec get the ASK in 30 seconds? Answer only YES or NO.',
        undefined,
        'Max revisions reached.',
        'previous',
        3, // loop back to EDIT (1-based)
        3
      ),
      output('MEMO'),
    ]
  },
  {
    id: 'cold-email',
    name: 'Cold Email',
    description: 'Gate: need @ — then research, draft, and 5 subject lines',
    icon: '📧',
    category: 'writing',
    cells: [
      input('GOAL', 'Get a meeting with VP of Engineering at Stripe to discuss partnership'),
      conditional('HAS_CONTEXT', 'contains', '@', undefined, '[FILTERED: need email address]'),
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
    id: 'explain-until-simple',
    name: 'Explain (Simplicity Gate)',
    description: 'Keep simplifying until a 12-year-old would get it — loop back if not',
    icon: '🔄',
    category: 'writing',
    cells: [
      input('CONCEPT', 'Explain how quantum entanglement works'),
      ai('SIMPLE', 'Explain to a smart 12-year-old. Analogies only. No jargon. One short pass.', 'A'),
      conditional(
        'SIMPLE ENOUGH?',
        'ai_check',
        'Would a smart 12-year-old understand this without looking anything up? Answer only YES or NO.',
        undefined,
        'Max revisions reached.',
        'previous',
        2, // loop back to SIMPLE (1-based)
        3
      ),
      ai('GAPS', 'What would they ask next? Add one short paragraph to answer it.', 'B'),
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
    id: 'thread-gate',
    name: 'Thread (Quality Loop)',
    description: 'Thread with “is it compelling?” gate — loops back to Hook if not',
    icon: '🔄',
    category: 'writing',
    cells: [
      input('INSIGHT', 'Most productivity advice is backwards - you should do less, not optimize more'),
      ai('HOOK', 'Write 5 opening tweets. Controversial, specific, makes people want to read more.', 'A'),
      ai('THREAD', 'Build the thread: hook → story/evidence → counterintuitive insight → takeaway. 8-12 tweets.', 'A'),
      conditional(
        'COMPELLING?',
        'ai_check',
        'Is this thread compelling? Would people keep scrolling? Answer only YES or NO.',
        undefined,
        'Max revisions reached.',
        'previous',
        2,  // loop back to HOOK (1-based)
        3
      ),
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
    id: 'story-scene-art',
    name: 'Story → Scene Art',
    description: 'One vivid scene from your story, turned into an image',
    icon: '🎨',
    category: 'writing',
    cells: [
      input('SEED', 'Startup founder burns out, loses everything, rebuilds differently'),
      ai('SCENE', 'Pick the single most vivid moment. One paragraph: setting, light, gesture, emotion. No abstraction.', 'A'),
      ai('PROMPT', 'Turn this scene into a detailed image prompt. Cinematic, specific. Style: concept art or film still.', 'A'),
      imageGen('SCENE', 'blurry, text, cartoon'),
      output('ART'),
    ]
  },
  {
    id: 'fetch-mimic-voice',
    name: 'Fetch & Mimic Voice',
    description: 'URL of a piece you love → analyze tone → rewrite your draft in that voice',
    icon: '🌐',
    category: 'writing',
    cells: [
      input('URL', 'https://example.com/article-or-landing-page-you-love'),
      webFetch('FETCH', '{{input}}', 'GET'),
      ai('VOICE', 'Analyze: sentence length, rhythm, word choice, tone, structure. What makes it distinctive? One short rubric.', 'B'),
      input('DRAFT', 'Your draft to rewrite in that voice...'),
      ai('REWRITE', 'Rewrite the DRAFT to match the VOICE. Keep the same content, change the sound.', 'A', 'all'),
      output('REWRITE'),
    ]
  },
  {
    id: 'fetch-index-mimic',
    name: 'Fetch, Index & Mimic',
    description: 'Fetch URL, index it, search for voice patterns, rewrite',
    icon: '📚',
    category: 'knowledge',
    cells: [
      input('URL', 'https://example.com/article-you-love'),
      webFetch('FETCH', '{{input}}', 'GET'),
      vectorIndex('INDEX', '{{input}}', 'previous'),
      vectorSearch('VOICE PATTERNS', 'writing style tone voice', 'none'),
      ai('ANALYZE', 'From search results, extract the voice characteristics: sentence structure, word choice, tone.', 'B', 'previous'),
      input('DRAFT', 'Your draft to rewrite...'),
      ai('REWRITE', 'Rewrite DRAFT to match the analyzed voice. Use the voice patterns from search results.', 'A', 'all'),
      output('REWRITE'),
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
    id: 'concept-song-gate',
    name: 'Concept → Song (Quality Loop)',
    description: 'Song with “is it good?” gate — loops back to Hook if not',
    icon: '🔄',
    category: 'music',
    cells: [
      input('CONCEPT', 'The exhaustion of pretending to be okay at work'),
      ai('IMAGES', '10 specific images/moments that embody this. Be visceral.', 'A'),
      ai('HOOK', 'The chorus hook - one phrase that says it all. 5 options.', 'A'),
      ai('LYRICS', 'Full lyrics: V1, Chorus, V2, Chorus, Bridge, Chorus. Use the images. No clichés.', 'A'),
      conditional(
        'GOOD?',
        'ai_check',
        'Is this song good? Would it get stuck in someone\'s head? Answer only YES or NO.',
        undefined,
        'Max revisions reached.',
        'previous',
        3,  // loop back to Hook (1-based)
        3
      ),
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
    id: 'hook-lab-earworm-gate',
    name: 'Hook Lab (Earworm Gate)',
    description: 'Loop until it’s sticky — “Would this get stuck in someone’s head?”',
    icon: '🪝',
    category: 'music',
    cells: [
      input('THEME', 'Song about finally leaving a toxic relationship'),
      ai('HOOKS', '15 potential hook lines. Memorable, singable, unexpected.', 'A'),
      ai('PICK_ONE', 'Pick the single strongest. Rewrite it 3 ways. Pick the best.', 'B'),
      conditional(
        'EARWORM?',
        'ai_check',
        'Would this hook get stuck in someone\'s head after one listen? Is it singable and distinct? Answer only YES or NO.',
        undefined,
        'Max revisions reached.',
        'previous',
        2, // loop back to HOOKS (1-based) — try new batch
        3
      ),
      output('HOOK'),
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
      ai('FLIP', 'Reimagine the SONG in each GENRE: tempo, instruments, production, vocal style. Be specific.', 'A', 'all'),
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
  {
    id: 'lyrics-from-web',
    name: 'Lyrics from Web',
    description: 'Fetch lyrics page URL, extract and analyze mood',
    icon: '🌐',
    category: 'music',
    cells: [
      input('URL', 'Paste a lyrics page URL (e.g. Genius, AZLyrics)'),
      webFetch('FETCH', '{{input}}', 'GET'),
      ai('EXTRACT', 'Extract just the song lyrics from this page. Remove ads, nav, line numbers. Plain text only.', 'B'),
      ai('MOOD', 'What\'s the emotional core? Suggest 3 chord progressions and a tempo that fit.', 'A'),
      output('LYRICS + MOOD'),
    ]
  },
  {
    id: 'concept-cover-art',
    name: 'Concept → Cover Art',
    description: 'Vibe to album art — AI designs the prompt, you get the image',
    icon: '🎨',
    category: 'music',
    cells: [
      input('CONCEPT', 'The exhaustion of pretending to be okay at work'),
      ai('PROMPT', 'Write a detailed image prompt for album cover art that captures this. Style: bold, graphic, no text. One paragraph.', 'A'),
      imageGen('COVER', 'blurry, text, words, watermark'),
      output('ART'),
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
    id: 'qa-alice-vector',
    name: 'Ask Alice (Vector Search)',
    description: 'Index document, then search semantically',
    icon: '🔍',
    category: 'knowledge',
    cells: [
      vectorIndex('INDEX', 'alice.pdf'),
      input('QUESTION', 'What advice does the Cheshire Cat give Alice?'),
      vectorSearch('SEARCH', '{{input}}', 'previous'),
      ai('ANSWER', 'Based on the search results above, answer the question. Quote relevant passages.', 'A', 'previous'),
      output('ANSWER'),
    ]
  },
  {
    id: 'api-fetch-analyze',
    name: 'Fetch & Analyze API',
    description: 'Fetch from API, then analyze with AI',
    icon: '🌐',
    category: 'data',
    cells: [
      webFetch('FETCH', 'https://api.github.com/repos/vercel/next.js/releases/latest', 'GET'),
      ai('ANALYZE', 'Summarize this API response. What are the key details?', 'A'),
      output('SUMMARY'),
    ]
  },
  {
    id: 'conditional-route',
    name: 'Smart Router',
    description: 'Gate: only if it contains ? — then answer',
    icon: '⚡',
    category: 'scripts',
    cells: [
      input('MESSAGE', 'What is the weather today?'),
      conditional('IS_QUESTION', 'contains', '?', undefined, '[FILTERED: not a question]'),
      ai('ANSWER', 'Answer the question concisely.', 'C'),
      output('RESPONSE'),
    ]
  },
  {
    id: 'web-scrape-summarize',
    name: 'Web Scrape & Summarize',
    description: 'Fetch webpage, extract text, summarize',
    icon: '📰',
    category: 'data',
    cells: [
      input('URL', 'https://example.com/article'),
      webFetch('FETCH', '{{input}}', 'GET'),
      ai('EXTRACT', 'Extract the main text content from this HTML. Remove navigation, ads, footers. Just the article body.', 'B'),
      ai('SUMMARIZE', 'Summarize this article in 3 bullet points.', 'A'),
      output('SUMMARY'),
    ]
  },
  {
    id: 'style-guide-rewrite',
    name: 'Style Guide Rewrite',
    description: 'Load a doc (voice/style), rewrite your draft to match',
    icon: '📁',
    category: 'writing',
    cells: [
      data('STYLE', 'style-guide.pdf', 'summarize', 'none'),
      input('DRAFT', 'Your draft to rewrite in that voice...'),
      ai('REWRITE', 'Rewrite the DRAFT to match the STYLE guide. Voice, terms, structure, level of formality. Keep the substance.', 'A', 'all'),
      output('REWRITE'),
    ]
  },
  {
    id: 'style-guide-vector',
    name: 'Style Guide (Vector)',
    description: 'Index style guide, search for examples, rewrite',
    icon: '📚',
    category: 'knowledge',
    cells: [
      vectorIndex('INDEX STYLE', 'style-guide.pdf'),
      input('DRAFT', 'Your draft to rewrite...'),
      vectorSearch('FIND EXAMPLES', '{{input}}', 'previous'),
      ai('REWRITE', 'Using the style guide examples from search results, rewrite the draft to match the voice and style.', 'A', 'all'),
      output('REWRITE'),
    ]
  },
  {
    id: 'api-post-process',
    name: 'API POST & Process',
    description: 'Send data to API, process response',
    icon: '📡',
    category: 'scripts',
    cells: [
      input('DATA', '{"name": "John", "email": "john@example.com"}'),
      webFetch('POST', 'https://api.example.com/users', 'POST', '{"Content-Type": "application/json"}', '{{input}}'),
      ai('VALIDATE', 'Check if this API response indicates success. Extract key fields.', 'B'),
      output('RESULT'),
    ]
  },
  {
    id: 'length-filter',
    name: 'Length Filter',
    description: 'Gate: under 5000 chars — else [FILTERED], then summarize',
    icon: '📏',
    category: 'scripts',
    cells: [
      input('TEXT', 'Paste long text here...'),
      conditional('CHECK_LENGTH', 'length', '5000', undefined, '[FILTERED: text too long]'),
      ai('SUMMARIZE', 'Summarize this text.', 'A'),
      output('SUMMARY'),
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
  {
    id: 'data-story-newsworthy-gate',
    name: 'Data → Story (Newsworthy Gate)',
    description: 'Loop until an editor would run it — “Is this newsworthy?”',
    icon: '📰',
    category: 'data',
    cells: [
      data('DATA', 'City_of_Seattle_Wage_Data.csv', 'stats'),
      ai('STORY', 'Write a compelling 2-paragraph story. Human angle. No overclaiming—only what the data supports.', 'A'),
      conditional(
        'NEWSWORTHY?',
        'ai_check',
        'Would an editor run this? Is it newsworthy, accurate, and not overclaiming from the data? Answer only YES or NO.',
        undefined,
        'Max revisions reached.',
        'previous',
        2, // loop back to STORY (1-based)
        3
      ),
      ai('HEADLINE', 'Write 5 headlines that make people want to click.', 'A'),
      output('ARTICLE'),
    ]
  },

  // ============================================
  // KNOWLEDGE - Vector store & semantic search
  // ============================================
  {
    id: 'knowledge-base',
    name: 'Knowledge Base Builder',
    description: 'Index multiple files for search',
    icon: '📚',
    category: 'knowledge',
    cells: [
      input('FILE 1', 'documents/guide.pdf'),
      vectorIndex('INDEX 1', '{{input}}', 'previous'),
      input('FILE 2', 'documents/research.txt'),
      vectorIndex('INDEX 2', '{{input}}', 'previous'),
      input('FILE 3', 'documents/notes.md'),
      vectorIndex('INDEX 3', '{{input}}', 'previous'),
      output('INDEXED'),
    ]
  },
  {
    id: 'rag-qa',
    name: 'RAG Q&A',
    description: 'Search indexed docs, answer with context',
    icon: '💬',
    category: 'knowledge',
    cells: [
      input('QUESTION', 'What are the main findings about machine learning?'),
      vectorSearch('SEARCH', '{{input}}', 'previous'),
      ai('ANSWER', 'Based on the search results above, provide a comprehensive answer. Include relevant quotes and citations.', 'A', 'previous'),
      output('ANSWER'),
    ]
  },
  {
    id: 'document-research',
    name: 'Document Research',
    description: 'Index → search → analyze',
    icon: '🔬',
    category: 'knowledge',
    cells: [
      vectorIndex('INDEX', 'research-paper.pdf'),
      input('TOPIC', 'neural network architectures'),
      vectorSearch('SEARCH', '{{input}}', 'previous'),
      ai('ANALYZE', 'Review the search results. What are the key insights? What patterns emerge?', 'A', 'previous'),
      ai('SYNTHESIZE', 'Synthesize the findings into a coherent summary with main points and implications.', 'B', 'all'),
      output('RESEARCH'),
    ]
  },
  {
    id: 'smart-research-assistant',
    name: 'Smart Research Assistant',
    description: 'Index directory, then answer questions',
    icon: '🤖',
    category: 'knowledge',
    cells: [
      input('DIRECTORY', 'documents/research/'),
      vectorIndex('INDEX ALL', '{{input}}', 'previous'),
      input('QUESTION', 'What are the common themes across these documents?'),
      vectorSearch('SEARCH', '{{input}}', 'previous'),
      ai('ANSWER', 'Based on the search results, provide a comprehensive answer. Reference specific documents.', 'A', 'previous'),
      output('RESEARCH'),
    ]
  },
  {
    id: 'context-aware-writing',
    name: 'Context-Aware Writing',
    description: 'Search for context, then write',
    icon: '✍️',
    category: 'knowledge',
    cells: [
      input('TOPIC', 'Write about quantum computing applications'),
      vectorSearch('CONTEXT', '{{input}}', 'previous'),
      ai('DRAFT', 'Using the context above, write a well-informed article on the topic. Incorporate relevant information from the search results.', 'A', 'all'),
      ai('REFINE', 'Polish the draft. Ensure it flows well and cites sources appropriately.', 'B', 'previous'),
      output('ARTICLE'),
    ]
  },
  {
    id: 'multi-doc-comparison',
    name: 'Multi-Doc Comparison',
    description: 'Search across indexed docs, compare perspectives',
    icon: '⚖️',
    category: 'knowledge',
    cells: [
      input('TOPIC', 'climate change solutions'),
      vectorSearch('SEARCH', '{{input}}', 'previous'),
      ai('EXTRACT', 'From the search results, extract different perspectives or approaches mentioned.', 'B', 'previous'),
      ai('COMPARE', 'Compare and contrast these perspectives. What are the similarities and differences?', 'A', 'previous'),
      output('COMPARISON'),
    ]
  },
  {
    id: 'literature-review',
    name: 'Literature Review',
    description: 'Index papers, search, synthesize findings',
    icon: '📖',
    category: 'knowledge',
    cells: [
      vectorIndex('PAPER 1', 'papers/paper1.pdf'),
      vectorIndex('PAPER 2', 'papers/paper2.pdf'),
      vectorIndex('PAPER 3', 'papers/paper3.pdf'),
      input('RESEARCH QUESTION', 'What are the current approaches to federated learning?'),
      vectorSearch('SEARCH', '{{input}}', 'previous'),
      ai('SYNTHESIZE', 'Synthesize the findings from the search results into a coherent literature review. Identify themes, gaps, and future directions.', 'A', 'previous'),
      output('REVIEW'),
    ]
  },
  {
    id: 'fact-checker',
    name: 'Fact Checker',
    description: 'Search indexed sources to verify claims',
    icon: '✅',
    category: 'knowledge',
    cells: [
      input('CLAIM', 'Machine learning models require massive datasets to work'),
      vectorSearch('SEARCH', '{{input}}', 'previous'),
      ai('VERIFY', 'Based on the search results, verify the claim. Is it accurate? What do the sources say?', 'B', 'previous'),
      ai('EVIDENCE', 'Provide specific evidence from the search results supporting or refuting the claim.', 'A', 'all'),
      output('VERIFICATION'),
    ]
  },
  {
    id: 'index-and-summarize',
    name: 'Index & Summarize',
    description: 'Index a document, then get semantic summary',
    icon: '📝',
    category: 'knowledge',
    cells: [
      vectorIndex('INDEX', 'long-document.pdf'),
      input('FOCUS', 'key findings and recommendations'),
      vectorSearch('SEARCH', '{{input}}', 'previous'),
      ai('SUMMARY', 'Based on the search results, create a concise summary focusing on the requested aspects.', 'A', 'previous'),
      output('SUMMARY'),
    ]
  },
  {
    id: 'semantic-similarity',
    name: 'Find Similar Content',
    description: 'Search for semantically similar documents',
    icon: '🔗',
    category: 'knowledge',
    cells: [
      input('REFERENCE', 'documents/target-doc.pdf'),
      data('LOAD', '{{input}}', 'summarize', 'previous'),
      vectorSearch('FIND SIMILAR', '{{input}}', 'previous'),
      ai('ANALYZE', 'Review the similar documents found. What makes them similar? What are the common themes?', 'A', 'previous'),
      output('SIMILAR DOCS'),
    ]
  },
  {
    id: 'knowledge-graph',
    name: 'Build Knowledge Graph',
    description: 'Index docs, search for connections',
    icon: '🕸️',
    category: 'knowledge',
    cells: [
      vectorIndex('INDEX', 'documents/'),
      input('CONCEPT', 'artificial intelligence'),
      vectorSearch('SEARCH', '{{input}}', 'previous'),
      ai('CONNECTIONS', 'From the search results, identify related concepts, people, and ideas. Map the connections.', 'A', 'previous'),
      ai('GRAPH', 'Organize these connections into a knowledge graph structure showing relationships.', 'B', 'previous'),
      output('GRAPH'),
    ]
  },
  {
    id: 'rag-enhanced-chat',
    name: 'RAG-Enhanced Chat',
    description: 'Chat with your documents as context',
    icon: '💭',
    category: 'knowledge',
    cells: [
      input('QUESTION', 'How do transformers work?'),
      vectorSearch('CONTEXT', '{{input}}', 'previous'),
      ai('CHAT', 'You have context from indexed documents. Answer the question using this context. If the context doesn\'t contain relevant information, say so.', 'A', 'all'),
      output('RESPONSE'),
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
    id: 'review-ship-it-gate',
    name: 'Code Review (Ship It? Gate)',
    description: 'Don’t stop until you’d merge it — loop back to IMPROVED if not',
    icon: '✅',
    category: 'code',
    cells: [
      input('CODE', 'Paste code to review...'),
      ai('ISSUES', 'Bugs, edge cases, code smells. Be specific with line numbers.', 'B'),
      ai('IMPROVED', 'Show the refactored version with comments explaining changes.', 'A'),
      conditional(
        'SHIP IT?',
        'ai_check',
        'Would you merge this code as-is? No critical bugs, readable, maintainable? Answer only YES or NO.',
        undefined,
        'Max revisions reached.',
        'previous',
        3, // loop back to IMPROVED (1-based)
        3
      ),
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
    description: 'Gate: valid email? — then regex + explain + test cases',
    icon: '🎭',
    category: 'code',
    cells: [
      input('NEED', 'Match email addresses, but only .com and .org domains'),
      conditional('IS_VALID_EMAIL', 'regex', '^[\\w\\.-]+@[\\w\\.-]+\\.(com|org)$', undefined, '[FILTERED: invalid email format]'),
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
  {
    id: 'prompt-craft-works-gate',
    name: 'Prompt Craft (Works? Gate)',
    description: 'Loop until the prompt produces good output — “Does it work?”',
    icon: '🔄',
    category: 'scripts',
    cells: [
      input('GOAL', 'I want an AI that helps write marketing copy for SaaS products'),
      input('SAMPLE', 'Product: Project management tool. Audience: PMs. Tone: Professional but warm.'),
      ai('PROMPT', 'Write the system prompt: role, context, constraints, 1–2 examples, output format.', 'A'),
      ai('RUN_TEST', 'Using the GOAL and SAMPLE above, produce one example output as the AI would. Then briefly: does it match the goal?', 'B', 'all'),
      conditional(
        'WORKS?',
        'ai_check',
        'Does the example output match the goal? Would a user be satisfied? Answer only YES or NO.',
        undefined,
        'Max revisions reached.',
        'previous',
        3, // loop back to PROMPT (1-based)
        3
      ),
      output('PROMPT'),
    ]
  },

  // ============================================
  // TERMINAL HISTORY - Analyze past conversations
  // ============================================
  {
    id: 'conversation-analysis',
    name: 'Conversation Analysis',
    description: 'Analyze terminal history to find patterns and insights',
    icon: '📜',
    category: 'knowledge',
    cells: [
      input('TOPIC', 'python programming'),
      terminalHistory('HISTORY', '{{input}}', 'none'),
      ai('PATTERNS', 'Analyze the conversation history. What topics come up repeatedly? What questions are asked? What patterns do you see?', 'B', 'previous'),
      ai('INSIGHTS', 'Based on the patterns, what insights can you draw? What are the user\'s main interests or pain points?', 'A', 'all'),
      output('ANALYSIS'),
    ]
  },
  {
    id: 'conversation-summary',
    name: 'Conversation Summary',
    description: 'Summarize recent terminal conversations',
    icon: '📝',
    category: 'knowledge',
    cells: [
      terminalHistory('RECENT', '{"limit": 20, "types": ["user", "ai"]}', 'none'),
      ai('SUMMARY', 'Summarize these conversations. What were the main topics? What questions were asked and answered?', 'A', 'previous'),
      output('SUMMARY'),
    ]
  },
  {
    id: 'question-extractor',
    name: 'Question Extractor',
    description: 'Extract all questions from terminal history',
    icon: '❓',
    category: 'knowledge',
    cells: [
      input('SEARCH', 'machine learning'),
      terminalHistory('HISTORY', '{{input}}', 'none'),
      ai('EXTRACT', 'Extract all questions from the history. List them clearly, grouped by topic if possible.', 'B', 'previous'),
      ai('ANSWERS', 'For each question, provide a brief answer based on the conversation history.', 'A', 'all'),
      output('Q&A'),
    ]
  },
  {
    id: 'conversation-context',
    name: 'Conversation Context',
    description: 'Get context from terminal history for a new question',
    icon: '💭',
    category: 'knowledge',
    cells: [
      input('QUESTION', 'How do I use the vector search feature?'),
      terminalHistory('CONTEXT', '{{input}}', 'none'),
      ai('ANSWER', 'Using the conversation history as context, answer the question. Reference relevant past conversations if helpful.', 'A', 'all'),
      output('ANSWER'),
    ]
  },
  {
    id: 'topic-timeline',
    name: 'Topic Timeline',
    description: 'Create a timeline of topics from terminal history',
    icon: '📅',
    category: 'knowledge',
    cells: [
      terminalHistory('ALL', '{"limit": 50, "types": ["user"]}', 'none'),
      ai('TIMELINE', 'Create a chronological timeline of topics discussed. Group by date/time periods. Show the evolution of interests.', 'A', 'previous'),
      output('TIMELINE'),
    ]
  },
  {
    id: 'conversation-rag',
    name: 'Conversation RAG',
    description: 'Use terminal history as context for AI responses',
    icon: '🔗',
    category: 'knowledge',
    cells: [
      input('QUESTION', 'What have we discussed about this topic before?'),
      terminalHistory('SEARCH', '{{input}}', 'none'),
      ai('CONTEXT', 'Review the conversation history. What relevant context exists?', 'B', 'previous'),
      ai('ANSWER', 'Answer the question using the conversation history as context. Reference specific past discussions.', 'A', 'all'),
      output('ANSWER'),
    ]
  },
  {
    id: 'terminal-insights',
    name: 'Terminal Insights',
    description: 'Find insights from your terminal conversation patterns',
    icon: '💡',
    category: 'knowledge',
    cells: [
      terminalHistory('RECENT', '{"limit": 30}', 'none'),
      ai('ANALYZE', 'What patterns emerge? What topics are discussed most? What questions repeat? What skills are being developed?', 'B', 'previous'),
      ai('INSIGHTS', 'Based on the analysis, what insights can you provide? What recommendations?', 'A', 'previous'),
      output('INSIGHTS'),
    ]
  },
]


interface TemplatesSidebarProps {
  onSelectTemplate: (template: NotebookTemplate, circuitName: string) => void
  onNewCircuit: () => void
  currentCircuitName: string  // Currently active circuit name
  isCollapsed: boolean
  onToggleCollapse: () => void
}

export function TemplatesSidebar({ onSelectTemplate, onNewCircuit, currentCircuitName, isCollapsed, onToggleCollapse }: TemplatesSidebarProps) {
  const [activeCategory, setActiveCategory] = useState<typeof CATEGORIES[number]['id']>('mine')
  const [savedCircuits, setSavedCircuits] = useState<Record<string, SavedCircuit>>({})
  const [hoveredCircuit, setHoveredCircuit] = useState<string | null>(null)
  
  // Check if current circuit matches a template or saved circuit
  const isCurrentTemplate = (templateId: string) => currentCircuitName === templateId
  const isCurrentSavedCircuit = (name: string) => currentCircuitName === name
  
  // Load saved circuits
  const refreshSavedCircuits = useCallback(() => {
    setSavedCircuits(loadSavedCircuits())
  }, [])
  
  useEffect(() => {
    refreshCircuitsFromBackend().then(refreshSavedCircuits)
    // Refresh periodically to catch saves from other parts of the app
    const interval = setInterval(refreshSavedCircuits, 2000)
    return () => clearInterval(interval)
  }, [refreshSavedCircuits])
  
  const handleDeleteCircuit = (name: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm(`Delete circuit "${name}"?`)) {
      deleteCircuit(name)
      refreshSavedCircuits()
    }
  }
  
  // Convert saved circuit to template format
  const savedCircuitToTemplate = (name: string, circuit: SavedCircuit): NotebookTemplate => ({
    id: `saved-${name}`,
    name: name,
    description: `${circuit.cells.length} cells • saved ${new Date(circuit.savedAt).toLocaleDateString()}`,
    icon: '◆',
    category: 'mine',
    cells: circuit.cells,
  })
  
  const filteredTemplates = activeCategory === 'mine' 
    ? [] // We'll render saved circuits separately
    : NOTEBOOK_TEMPLATES.filter(t => t.category === activeCategory)
  
  const savedCircuitList = Object.entries(savedCircuits)
    .sort(([, a], [, b]) => b.savedAt - a.savedAt)

  return (
    <div 
      className={`h-full bg-slate border-r border-terminal-border transition-all duration-200 flex flex-col ${
        isCollapsed ? 'w-10' : 'w-64'
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
          {/* NEW button - always at top */}
          <button
            onClick={onNewCircuit}
            className="w-full text-left p-2 hover:bg-void group transition-colors border border-dashed border-terminal-border hover:border-phosphor"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm text-phosphor">+</span>
              <span className="text-xs text-phosphor group-hover:text-phosphor">
                New Circuit
              </span>
            </div>
            <p className="text-[9px] text-terminal-muted/60 mt-1 pl-6">
              Start with a blank notebook
            </p>
          </button>
          
          {/* MINE category - show saved circuits */}
          {activeCategory === 'mine' && (
            <>
              {/* Current unsaved circuit indicator */}
              {currentCircuitName && !savedCircuits[currentCircuitName] && (
                <div className="p-2 bg-void border-l-2 border-amber-500 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-amber-500">○</span>
                    <span className="text-xs text-amber-400 font-bold truncate">
                      /{currentCircuitName}
                    </span>
                    <span className="text-[8px] text-amber-500/60 ml-auto">unsaved</span>
                  </div>
                  <p className="text-[9px] text-amber-500/50 mt-1 pl-6">
                    Save to keep this circuit
                  </p>
                </div>
              )}
              
              {savedCircuitList.length === 0 && !currentCircuitName ? (
                <div className="text-center py-6 text-terminal-muted text-[10px]">
                  No saved circuits yet.
                  <div className="mt-1 text-terminal-muted/50">
                    Create and save a circuit to see it here.
                  </div>
                </div>
              ) : (
                savedCircuitList.map(([name, circuit]) => {
                const isActive = isCurrentSavedCircuit(name)
                return (
                  <div
                    key={name}
                    onMouseEnter={() => setHoveredCircuit(name)}
                    onMouseLeave={() => setHoveredCircuit(null)}
                    className={`w-full text-left p-2 hover:bg-void group transition-colors relative cursor-pointer ${
                      isActive ? 'bg-void border-l-2 border-phosphor' : ''
                    }`}
                    onClick={() => onSelectTemplate(savedCircuitToTemplate(name, circuit), name)}
                    title={`Run with /${name}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`text-sm ${isActive ? 'text-phosphor' : 'text-phosphor/50'}`}>◆</span>
                      <span className={`text-xs truncate flex-1 ${
                        isActive ? 'text-phosphor font-bold' : 'text-terminal-muted group-hover:text-phosphor'
                      }`}>
                        /{name}
                      </span>
                      {/* Delete button */}
                      {hoveredCircuit === name && !isActive && (
                        <span
                          onClick={(e) => handleDeleteCircuit(name, e)}
                          className="text-red-400/50 hover:text-red-400 text-xs px-1 cursor-pointer"
                          title="Delete circuit"
                        >
                          ×
                        </span>
                      )}
                    </div>
                    <p className={`text-[9px] mt-1 pl-6 ${isActive ? 'text-phosphor/50' : 'text-terminal-muted/60'}`}>
                      {circuit.cells.length} cells • {new Date(circuit.savedAt).toLocaleDateString()}
                    </p>
                  </div>
                )
              })
              )}
            </>
          )}
          
          {/* Regular templates for other categories */}
          {activeCategory !== 'mine' && filteredTemplates.map((template) => {
            const isActive = isCurrentTemplate(template.id)
            return (
              <button
                key={template.id}
                onClick={() => onSelectTemplate(template, template.id)}
                className={`w-full text-left p-2 hover:bg-void group transition-colors ${
                  isActive ? 'bg-void border-l-2 border-phosphor' : ''
                }`}
                title={template.description}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">{template.icon}</span>
                  <span className={`text-xs truncate ${
                    isActive ? 'text-phosphor font-bold' : 'text-terminal-muted group-hover:text-phosphor'
                  }`}>
                    {template.name}
                  </span>
                </div>
                <p className={`text-[9px] mt-1 line-clamp-2 pl-6 ${
                  isActive ? 'text-phosphor/50' : 'text-terminal-muted/60'
                }`}>
                  {template.description}
                </p>
              </button>
            )
          })}
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
          
          {/* NEW button */}
          <button
            onClick={onNewCircuit}
            className="p-2 border-b border-terminal-border text-phosphor hover:bg-void flex justify-center"
            title="New Circuit"
          >
            <span className="text-sm">+</span>
          </button>
          
          <div className="flex-1 overflow-y-auto py-2">
            {/* Saved circuits for MINE category */}
            {activeCategory === 'mine' && savedCircuitList.map(([name, circuit]) => (
              <button
                key={name}
                onClick={() => onSelectTemplate(savedCircuitToTemplate(name, circuit), name)}
                className="w-full p-2 hover:bg-void flex justify-center"
                title={`/${name}: ${circuit.cells.length} cells`}
              >
                <span className="text-sm text-phosphor">◆</span>
              </button>
            ))}
            
            {/* Regular templates */}
            {activeCategory !== 'mine' && filteredTemplates.map((template) => (
              <button
                key={template.id}
                onClick={() => onSelectTemplate(template, template.id)}
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
