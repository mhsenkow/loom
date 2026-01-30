# Local Conversational AI Stack & M2 Speed Guide

## Do We Have All the Components?

| Component | LOOM status | Where |
|-----------|-------------|--------|
| **Transformer-based LLM** | ✅ Yes | **Ollama** (LLaMA, Mistral, Phi, etc.). `ollama_client.py` + `/api/chat` stream from Ollama. Default `llama3.1:8b`; you can use quantized variants (e.g. `llama3.2:3b`, `tinyllama`). |
| **Local inference server** | ✅ Yes | **Ollama** runs locally (HTTP API). Not Hugging Face/ONNX directly—Ollama handles loading, tokenization, and GPU/Metal. |
| **Retrieval-augmented generation (RAG)** | ✅ Yes | **ChromaDB** + **vector_store** + optional **code context**. Chat accepts `use_rag` and `use_code_context`; `search_for_rag()` injects context into the prompt. See `main.py` chat handler and `FOLDER_CONTEXT_STRATEGY.md`. |
| **Dialogue manager / conversation context** | ✅ Yes | **Conversation manager** in `conversationContext.ts` builds context from last N messages (user/ai/image/system). Sent as “Previous conversation” in the prompt. `contextMode`: input / key / full. See `utils/conversationContext.ts`. |
| **Tokenizer** | ✅ Yes | Handled inside **Ollama** (no explicit tokenizer in app code). Ollama tokenizes for the model you pick. |

So you already have the full baseline: LLM (Ollama), local server (Ollama), RAG (ChromaDB + code context), **conversation manager** (conversation context builder in `conversationContext.ts`), and tokenization (inside Ollama).

**Faster audio reply:** **Stream TTS** is implemented: enable "Automatically generate audio" and "Speak as it streams (faster)" in the Voice panel. The response is turned into audio sentence-by-sentence and played in order, so time-to-first-audio is much lower than waiting for the full response.

---

## “Feel Fast” Trick: Stream TTS Line-by-Line and Splice Playback

**Idea:** Don’t wait for the full AI response to generate one big TTS blob. As the LLM streams text:

1. **Buffer** incoming `ai_chunk` until you have a **speakable unit** (e.g. sentence or line: split on `.` `!` `?` or `\n`).
2. **Send that chunk** to TTS (Orpheus); get back a small audio blob.
3. **Queue** the blob and **play** it while the next chunk is being generated.
4. **Play queued blobs in order** (chunk 1 → chunk 2 → …) so playback is continuous.

**Result:** Time-to-first-audio drops (user hears the start of the reply quickly); the rest of the reply keeps playing while the model is still streaming and TTS is generating the next sentence.

Implementation outline:

- **Sentence splitter:** Accumulate streamed text; when you see `.` `!` `?` or `\n`, flush a segment (with a max length cap so long paragraphs still get split).
- **TTS queue:** For each segment, call `generate(segment)` (or `/api/tts/speak`); push the returned blob into a playback queue.
- **Playback:** Single “playback head”: when the current audio ends, play the next blob in the queue. Use Web Audio or `<audio>` with `onended` to chain.
- **Optional:** While playing chunk N, generate TTS for chunk N+1 so generation and playback overlap.

This is implemented as an optional **Stream TTS** mode in the Voice panel: enable **Automatically generate audio** and **Speak as it streams (faster)**. Sentences are split on `.` `!` `?` or newline (or after ~220 chars); each chunk is sent to Orpheus, and blobs are played in order so audio starts as soon as the first sentence is ready.

---

## Speed Optimizations (M2 Silicon + Lots of RAM)

### Already in place

- **Ollama:** Uses Metal on Apple Silicon when available (`OLLAMA_GPU_DRIVER=metal` in `scripts/start.sh`). Keeps one model loaded (warm).
- **Orpheus TTS:** `orpheus-cpp` + `llama-cpp-python` with **Metal** (`make install-orpheus-mac`). No cold start when model is loaded.
- **ChromaDB:** Local, in-memory / persistent; RAG lookups are fast.
- **Streaming:** Chat streams tokens (`ai_chunk`); UI and TTS can react before the full response is done.

### Recommended for “as fast as possible” on M2

1. **Use quantized / smaller models**
   - e.g. `llama3.2:3b`, `tinyllama`, `phi3:mini` for lowest latency.
   - Keep `llama3.1:8b` (or 70b) for when you need quality; switch model per use case.

2. **Pre-warm the model**
   - Send a short no-op or “hello” prompt after startup so Ollama keeps the model in RAM.
   - LOOM doesn’t pre-warm yet; you can add a startup call to `ollama_client.chat` or `/api/chat` with a tiny prompt.

3. **Smaller context when possible**
   - Dialogue manager already limits to last 16 messages; for “key” mode we send only 120 chars of each AI reply. Use `contextMode: 'key'` for speed when full history isn’t needed.

4. **Short audio chunks for TTS**
   - With **streaming TTS** (sentence- or line-sized chunks), we generate and play many small blobs instead of one big one → faster time-to-first-audio and better pipelining.

5. **Keep TTS model loaded**
   - Orpheus-cpp keeps the model in memory after first use; avoid restarting the backend so TTS stays warm.

6. **Optional: ONNX / OpenVINO**
   - Not used today; LOOM uses Ollama (which uses its own runtimes). For a future path you could run a small model via ONNX Runtime or OpenVINO for a dedicated “fast path” (e.g. intent detection) alongside Ollama.

---

## Summary

- You have the full local conversational stack: LLM (Ollama), RAG (ChromaDB + code context), dialogue context, and tokenization via Ollama.
- To make it **feel** faster: add **streaming TTS** (sentence-by-sentence generate + queued playback) and use **quantized/smaller models** + **pre-warm** and **Metal** (already used where applicable) on M2.

---

## Human-Like Speech: Prosody Engine & Audio Processing

### What Makes It Sound Human

1. **Prosody Engine** (`backend/app/services/prosody_engine.py`):
   - **Emotion Detection**: Analyzes text for happy, sad, surprised, contemplative, frustrated, tired patterns
   - **Emotive Tags**: Injects Orpheus tags like `<laugh>`, `<sigh>`, `<gasp>`, `<chuckle>` at natural points
   - **Breath Pauses**: Adds natural "..." pauses at sentence boundaries and after long clauses
   - **Emphasis Pauses**: Micro-pauses before important words (however, therefore, important, etc.)
   - **Dynamic Temperature**: Auto-adjusts TTS temperature based on detected emotion
   - **Thoughtful Filler**: Adds "Hmm,", "Well," for contemplative content

2. **Audio Processor** (`frontend/src/utils/audioProcessor.ts`):
   - **Subtle Room Reverb**: Convolution reverb for warmth and presence (like a real room)
   - **Light Compression**: Evens out dynamics so quiet and loud parts are balanced
   - **EQ Presets**: Warm (bass boost), Bright (treble boost), Radio (mid push)
   - **Crossfade**: Smooth transitions between streaming TTS chunks (no jarring cuts)

3. **Dynamic Pacing** (streaming TTS):
   - Pause duration varies by punctuation: `...` (550ms), `?` (380ms), `!` (220ms), `.` (280ms)
   - Natural rhythm instead of robotic same-length pauses

4. **Avatar Speech Awareness** (`AvatarCanvas.tsx`):
   - **Emphasis Detection**: Sudden amplitude increases trigger visual bursts (important words)
   - **Pause Detection**: Low audio during speech triggers settling/calming visuals
   - **Color Shifts**: Emphasis = bright flash; pauses = softer, cooler tones

### Orpheus Emotive Tags Reference

The prosody engine can inject these Orpheus TTS tags based on detected emotion:

| Emotion | Tags Used |
|---------|-----------|
| Happy/Amused | `<laugh>`, `<chuckle>`, `<giggle>` |
| Sad | `<sigh>`, `<sob>` |
| Surprised | `<gasp>` |
| Contemplative | `<sigh>` |
| Frustrated | `<groan>`, `<sigh>` |
| Tired | `<yawn>`, `<sigh>` |
| Sick (style) | `<sniffle>`, `<cough>` |

### API Parameters

The TTS `/api/tts/speak` endpoint accepts these prosody options:

```json
{
  "orpheus": {
    "naturalize": true,           // Enable prosody engine (default: true)
    "breath_frequency": 0.35,     // How often to insert breath pauses (0-1)
    "dynamic_temperature": true   // Auto-adjust temperature by emotion
  }
}
```
