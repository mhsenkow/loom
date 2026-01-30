"""
Prosody Engine: Makes TTS sound human by injecting natural speech patterns.

Orpheus TTS supports these emotive tags:
- <laugh>, <chuckle> - laughter
- <sigh> - resignation, contemplation, tiredness
- <cough>, <sniffle> - physical sounds
- <gasp> - surprise, realization
- <yawn> - tiredness
- <groan> - frustration
- <giggle> - light amusement
- <sob>, <cry> - sadness
- <scream> - extreme emotion

This engine analyzes text and injects:
1. Appropriate emotive tags based on content/reading style
2. Natural breath pauses (...)
3. Micro-hesitations for thoughtful speech
4. Dynamic pacing hints
"""

import re
import random
from typing import Optional, Tuple, List

# Emotion/sentiment word patterns
HAPPY_PATTERNS = [
    r'\b(happy|glad|excited|amazing|wonderful|great|love|awesome|fantastic|joy|delighted)\b',
    r'\b(haha|lol|funny|hilarious)\b',
    r'[!]{2,}',  # Multiple exclamations
]

SAD_PATTERNS = [
    r'\b(sad|sorry|unfortunately|regret|miss|lost|hurt|pain|grief|tragic)\b',
    r'\b(cry|crying|tears)\b',
]

SURPRISED_PATTERNS = [
    r'\b(wow|whoa|oh|omg|surprising|unexpected|suddenly|wait)\b',
    r'\?!|\!\?',  # Interrobang-like
    r'^(Oh[,!]|Wow[,!])',
]

CONTEMPLATIVE_PATTERNS = [
    r'\b(hmm|well|actually|interesting|perhaps|maybe|think|consider|ponder)\b',
    r'\b(let me|I think|in my opinion|it seems|appears to be)\b',
]

FRUSTRATED_PATTERNS = [
    r'\b(frustrated|annoying|ugh|argh|damn|unfortunately|problem|issue|error)\b',
]

TIRED_PATTERNS = [
    r'\b(tired|exhausted|sleepy|long day|finally|phew)\b',
]

# Emphasis words that should have slight pause before
EMPHASIS_WORDS = [
    'important', 'critical', 'essential', 'never', 'always', 'absolutely',
    'definitely', 'certainly', 'actually', 'really', 'truly', 'however',
    'but', 'yet', 'therefore', 'consequently', 'finally', 'ultimately',
]

# Transition words that benefit from breath pause
TRANSITION_WORDS = [
    'however', 'therefore', 'furthermore', 'moreover', 'additionally',
    'consequently', 'nevertheless', 'meanwhile', 'subsequently',
    'first', 'second', 'third', 'finally', 'lastly', 'next',
]


def _count_pattern_matches(text: str, patterns: List[str]) -> int:
    """Count how many patterns match in text."""
    count = 0
    text_lower = text.lower()
    for pattern in patterns:
        matches = re.findall(pattern, text_lower, re.IGNORECASE)
        count += len(matches)
    return count


def _detect_dominant_emotion(text: str) -> Optional[str]:
    """Detect the dominant emotional tone of text."""
    scores = {
        'happy': _count_pattern_matches(text, HAPPY_PATTERNS),
        'sad': _count_pattern_matches(text, SAD_PATTERNS),
        'surprised': _count_pattern_matches(text, SURPRISED_PATTERNS),
        'contemplative': _count_pattern_matches(text, CONTEMPLATIVE_PATTERNS),
        'frustrated': _count_pattern_matches(text, FRUSTRATED_PATTERNS),
        'tired': _count_pattern_matches(text, TIRED_PATTERNS),
    }
    
    max_score = max(scores.values())
    if max_score == 0:
        return None
    
    # Return emotion with highest score
    for emotion, score in scores.items():
        if score == max_score:
            return emotion
    return None


def _inject_breath_pauses(text: str, frequency: float = 0.3) -> str:
    """
    Insert natural breath pauses at sentence boundaries and after commas.
    frequency: 0.0-1.0, probability of inserting pause.
    """
    # After periods, add occasional breath marker
    result = text
    
    # Replace some ". " with "... " for breath pause (but not all)
    sentences = re.split(r'(?<=[.!?])\s+', result)
    new_sentences = []
    
    for i, sent in enumerate(sentences):
        new_sentences.append(sent)
        # Add breath pause between sentences randomly
        if i < len(sentences) - 1 and random.random() < frequency:
            # Don't add trailing "..." - let the natural sentence break be the pause
            pass  # The pause is implicit in sentence boundary
    
    result = ' '.join(new_sentences)
    
    # Occasionally add slight pause after long clauses (comma followed by many words)
    def add_clause_pause(match):
        if random.random() < frequency * 0.5:
            return match.group(0) + '..'  # Soft pause marker
        return match.group(0)
    
    # Match comma followed by 20+ chars before next punctuation
    result = re.sub(r',\s+(?=[a-zA-Z]{3,}[^,]{15,}[,.])', add_clause_pause, result)
    
    return result


def _inject_emphasis_pauses(text: str) -> str:
    """Add micro-pauses before emphasis words for natural cadence."""
    result = text
    
    for word in EMPHASIS_WORDS:
        # Add a subtle pause before emphasis words (not always)
        pattern = rf'\b({word})\b'
        def replacer(match):
            if random.random() < 0.4:
                return '.. ' + match.group(1)
            return match.group(1)
        result = re.sub(pattern, replacer, result, flags=re.IGNORECASE)
    
    return result


def _inject_transition_pauses(text: str) -> str:
    """Add breath pauses before/after transition words."""
    result = text
    
    for word in TRANSITION_WORDS:
        # Pattern: start of sentence or after punctuation, then transition word
        pattern = rf'([.!?]\s+)({word})\b'
        def replacer(match):
            if random.random() < 0.6:
                return match.group(1) + '... ' + match.group(2)
            return match.group(0)
        result = re.sub(pattern, replacer, result, flags=re.IGNORECASE)
    
    return result


def _inject_emotive_tags(text: str, reading_style: Optional[str], emotion: Optional[str]) -> str:
    """
    Inject Orpheus emotive tags based on reading style and detected emotion.
    Tags are inserted at natural points (sentence start, after pauses).
    """
    # Style-specific tags
    style_tags = {
        'expressive': ['<chuckle>', '<gasp>', '<laugh>'],
        'calm': ['<sigh>'],
        'sick': ['<sniffle>', '<cough>'],
        'unsure': ['<sigh>'],
        'angry': ['<groan>'],
        'sad': ['<sigh>', '<sob>'],
    }
    
    # Emotion-specific tags
    emotion_tags = {
        'happy': ['<chuckle>', '<laugh>', '<giggle>'],
        'sad': ['<sigh>', '<sob>'],
        'surprised': ['<gasp>'],
        'contemplative': ['<sigh>'],
        'frustrated': ['<groan>', '<sigh>'],
        'tired': ['<yawn>', '<sigh>'],
    }
    
    available_tags = []
    
    # Add style tags
    if reading_style and reading_style in style_tags:
        available_tags.extend(style_tags[reading_style])
    
    # Add emotion tags
    if emotion and emotion in emotion_tags:
        available_tags.extend(emotion_tags[emotion])
    
    # Remove duplicates while preserving order
    seen = set()
    unique_tags = []
    for tag in available_tags:
        if tag not in seen:
            seen.add(tag)
            unique_tags.append(tag)
    
    if not unique_tags:
        return text
    
    # Strategy: Insert tags at the beginning and occasionally mid-sentence
    result = text
    sentences = re.split(r'(?<=[.!?])\s+', result)
    
    if len(sentences) == 0:
        return text
    
    new_sentences = []
    for i, sent in enumerate(sentences):
        if i == 0:
            # First sentence: maybe add emotive tag at start
            if random.random() < 0.5 and unique_tags:
                tag = random.choice(unique_tags)
                sent = f"{tag} {sent}"
        elif random.random() < 0.25 and unique_tags:
            # Later sentences: occasional tag
            tag = random.choice(unique_tags)
            sent = f"{tag} {sent}"
        new_sentences.append(sent)
    
    return ' '.join(new_sentences)


def _add_natural_filler(text: str, thoughtfulness: float = 0.3) -> str:
    """
    Add natural filler sounds for contemplative/thoughtful speech.
    thoughtfulness: 0.0-1.0, how contemplative the speech should be.
    """
    if thoughtfulness < 0.2:
        return text
    
    fillers = ['Hmm,', 'Well,', 'Let me see,', 'Ah,']
    
    # Only add filler at the very start if it seems thoughtful
    if random.random() < thoughtfulness * 0.5:
        filler = random.choice(fillers)
        text = f"{filler} {text}"
    
    return text


def naturalize_text(
    text: str,
    reading_style: Optional[str] = None,
    enable_emotion_detection: bool = True,
    breath_frequency: float = 0.3,
    thoughtfulness: float = 0.2,
) -> Tuple[str, dict]:
    """
    Main entry point: Transform text into more natural speech.
    
    Returns:
        Tuple of (naturalized_text, metadata)
        metadata contains detected emotion and applied transformations.
    """
    if not text or not text.strip():
        return text, {}
    
    original = text
    metadata = {
        'original_length': len(text),
        'detected_emotion': None,
        'applied_transforms': [],
    }
    
    # 1. Detect emotion
    emotion = None
    if enable_emotion_detection:
        emotion = _detect_dominant_emotion(text)
        metadata['detected_emotion'] = emotion
    
    # 2. Inject emotive tags (early, so they're at sentence starts)
    if reading_style or emotion:
        text = _inject_emotive_tags(text, reading_style, emotion)
        metadata['applied_transforms'].append('emotive_tags')
    
    # 3. Add contemplative filler for certain styles/emotions
    if reading_style in ('calm', 'unsure') or emotion == 'contemplative':
        text = _add_natural_filler(text, thoughtfulness)
        metadata['applied_transforms'].append('filler')
    
    # 4. Inject breath pauses
    text = _inject_breath_pauses(text, breath_frequency)
    metadata['applied_transforms'].append('breath_pauses')
    
    # 5. Inject emphasis pauses
    text = _inject_emphasis_pauses(text)
    metadata['applied_transforms'].append('emphasis_pauses')
    
    # 6. Inject transition pauses
    text = _inject_transition_pauses(text)
    metadata['applied_transforms'].append('transition_pauses')
    
    metadata['final_length'] = len(text)
    
    return text, metadata


def get_dynamic_temperature(text: str, base_temperature: float, reading_style: Optional[str]) -> float:
    """
    Dynamically adjust temperature based on text content.
    More emotional content = slightly higher temperature for expressiveness.
    """
    emotion = _detect_dominant_emotion(text)
    
    # Base adjustments
    temp = base_temperature
    
    # Emotional content increases expressiveness
    if emotion in ('happy', 'surprised'):
        temp = max(temp, min(temp * 1.15, 1.5))
    elif emotion in ('sad', 'tired'):
        temp = min(temp, max(temp * 0.85, 0.25))
    elif emotion == 'frustrated':
        temp = max(temp, min(temp * 1.1, 1.4))
    elif emotion == 'contemplative':
        temp = min(temp, max(temp * 0.9, 0.4))
    
    # Question sentences: slightly more expressive
    if text.strip().endswith('?'):
        temp = min(temp * 1.05, 1.5)
    
    # Exclamations: more energy
    if '!' in text:
        temp = min(temp * 1.08, 1.5)
    
    return round(temp, 2)


# Sentence-level pacing hints for streaming TTS
def get_pause_duration_ms(sentence: str) -> int:
    """
    Return suggested pause duration (ms) after this sentence.
    Based on ending punctuation and content.
    """
    sentence = sentence.strip()
    
    if not sentence:
        return 100
    
    # Ellipsis: longer contemplative pause
    if sentence.endswith('...'):
        return 600
    
    # Question: slight pause for "answer" anticipation
    if sentence.endswith('?'):
        return 400
    
    # Exclamation: quick pause, energy
    if sentence.endswith('!'):
        return 250
    
    # Colon or semicolon: medium pause
    if sentence.endswith(':') or sentence.endswith(';'):
        return 350
    
    # Period: standard pause
    if sentence.endswith('.'):
        return 300
    
    # Comma (fragment): short pause
    if sentence.endswith(','):
        return 150
    
    # Default
    return 200
