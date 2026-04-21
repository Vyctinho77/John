import { nativeImage } from 'electron'
import type {
  ChangeSummary,
  CodeContext,
  CodeDiagnostic,
  PerceptionResult,
  SemanticState,
  SurfaceType,
  UserProfile,
  VisionAnalysis
} from '../../shared/perception.types'
import { generateRemoteText } from './ai-provider'
import { codexAuth, codexClient } from '../auth/codex-singleton'
import { recordDiagnosticEvent, recordPerformanceTrace } from './observability'

// ---------------------------------------------------------------------------
// Vision LLM analyzer — replaces heuristic classification with multimodal AI
// ---------------------------------------------------------------------------

const VISION_TIMEOUT_MS = 28_000
let lastVisionCache: {
  key: string
  analysis: VisionAnalysis
} | null = null

/**
 * Sends a screenshot to the configured Vision LLM and returns a structured
 * analysis.  Falls back to `null` on any failure so the caller can degrade
 * to the heuristic path.
 */
export async function analyzeScreenWithVision(
  screenshotDataUrl: string,
  ocrText: string,
  previousText: string,
  userProfile: UserProfile
): Promise<VisionAnalysis | null> {
  const startedAt = Date.now()

  try {
    const cacheKey = buildVisionCacheKey(screenshotDataUrl, userProfile)
    if (lastVisionCache?.key === cacheKey) {
      void recordDiagnosticEvent({
        type: 'trace',
        source: 'perception',
        action: 'vision_dedup_hit',
        details: {
          cacheKey: cacheKey.slice(0, 48),
          durationMs: Date.now() - startedAt
        }
      })
      return {
        ...lastVisionCache.analysis,
        change_summary: 'none'
      }
    }

    const prompt = buildVisionPrompt(ocrText, previousText, userProfile)

    // Try configured AI providers first; fall back to Codex if authenticated
    let result = await withTimeout(
      generateRemoteText({
        sensitive: false,
        feature: 'vision',
        system: VISION_SYSTEM_PROMPT,
        prompt,
        imageDataUrl: screenshotDataUrl
      }),
      VISION_TIMEOUT_MS
    )

    if (!result?.text && codexAuth.getStatus().authenticated) {
      const abort = new AbortController()
      try {
        const resizedDataUrl = await resizeForVision(screenshotDataUrl)
        const text = await withTimeout(
          codexClient.chat({
            messages: [
              { role: 'system', content: VISION_SYSTEM_PROMPT },
              { role: 'user',   content: prompt }
            ],
            imageDataUrl: resizedDataUrl,
            signal: abort.signal
          }),
          VISION_TIMEOUT_MS,
          abort
        )
        if (text) result = { providerId: 'codex' as import('../../shared/ai-provider.types').AIProviderId, model: 'codex-vision', text }
      } catch (codexErr) {
        abort.abort()
        console.warn('[Vision] Codex vision fallback failed:', codexErr instanceof Error ? codexErr.message : codexErr)
      }
    }

    if (!result?.text) {
      void recordDiagnosticEvent({
        type: 'trace',
        source: 'perception',
        action: 'vision_no_response',
        details: { provider: 'none', durationMs: Date.now() - startedAt }
      })
      return null
    }

    const analysis = parseVisionResponse(result.text)
    if (!analysis) {
      void recordDiagnosticEvent({
        type: 'error',
        source: 'perception',
        action: 'vision_parse_failed',
        details: {
          provider: result.providerId,
          model: result.model,
          responseLength: result.text.length
        }
      })
      return null
    }

    void recordPerformanceTrace({
      operation: 'vision.analyze',
      durationMs: Date.now() - startedAt,
      status: 'ok'
    })

    void recordDiagnosticEvent({
      type: 'trace',
      source: 'perception',
      action: 'vision_success',
      details: {
        provider: result.providerId,
        model: result.model,
        surfaceType: analysis.surface_type,
        durationMs: Date.now() - startedAt
      }
    })

    lastVisionCache = {
      key: cacheKey,
      analysis
    }

    return analysis
  } catch (error) {
    void recordPerformanceTrace({
      operation: 'vision.analyze',
      durationMs: Date.now() - startedAt,
      status: 'error'
    })
    void recordDiagnosticEvent({
      type: 'error',
      source: 'perception',
      action: 'vision_error',
      details: {
        hasMessage: error instanceof Error ? Boolean(error.message) : true,
        durationMs: Date.now() - startedAt
      }
    })
    return null
  }
}

/**
 * Merges VisionAnalysis output with OCR data to produce a complete
 * SemanticState, enriched with fields that only a Vision LLM can provide.
 */
export function buildSemanticStateFromVision(
  vision: VisionAnalysis,
  perception: PerceptionResult,
  previousText: string
): SemanticState {
  const detectedText = vision.detected_text || perception.rawText.trim()
  const changeSummary: ChangeSummary = vision.change_summary ?? inferChangeFallback(previousText, detectedText)

  return {
    detected_text: detectedText,
    visual_summary: vision.visual_summary,
    surface_type: vision.surface_type,
    change_summary: changeSummary,
    focus_region: vision.focus_region,
    probable_user_focus: vision.probable_user_focus,
    inferred_intent: vision.inferred_intent,
    pedagogical_topics: vision.pedagogical_topics,
    capture_policy: vision.is_sensitive ? 'blocked-sensitive' : 'allowed',
    sensitivity_reason: vision.sensitivity_reason,
    uncertainty: clamp(vision.uncertainty),
    capturedAt: perception.capturedAt,

    // Vision-enriched fields
    ui_elements: vision.ui_elements ?? [],
    visual_context: vision.visual_context ?? null,
    app_identifier: vision.app_identifier ?? null,
    emotional_signal: vision.emotional_signal ?? null,
    key_values: vision.key_values ?? {},
    code_context: vision.code_context ?? null
  }
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

const VISION_SYSTEM_PROMPT = `You are the visual perception engine of a desktop tutor agent named John.
You receive a screenshot of the user's screen and must analyze it to help John understand what the user is seeing and doing.

Respond ONLY with a single JSON object — no markdown fences, no explanation, no extra text.

The JSON must follow this exact schema (all fields required):

{
  "surface_type": "code" | "text" | "graphic" | "document" | "dashboard" | "unknown",
  "visual_summary": "<1-2 sentence description of what is on screen>",
  "detected_text": "<most relevant text visible, max 300 chars>",
  "focus_region": "<where the user's attention likely is: e.g. 'center editor', 'terminal panel', 'left sidebar'>",
  "probable_user_focus": "<what specifically the user is looking at, max 160 chars>",
  "inferred_intent": "<what the user is probably trying to do>",
  "pedagogical_topics": ["<topic1>", "<topic2>"],
  "change_summary": "none" | "minor" | "major" | null,
  "uncertainty": <0.0 to 1.0>,
  "is_sensitive": <true | false>,
  "sensitivity_reason": "<reason or null>",
  "ui_elements": ["<element1>", "<element2>"],
  "visual_context": "<broader context: app layout, window arrangement, visible panels>",
  "app_identifier": "<detected application name or null>",
  "emotional_signal": "neutral" | "frustrated" | "focused" | "exploring" | "confused" | null,
  "key_values": { "<label>": "<value>", ... },
  "code_context": {
    "file_name": "<visible file name or null>",
    "file_path": "<visible file path or null>",
    "language": "<programming language or null>",
    "visible_line_range": "<e.g. '42-98' or null>",
    "active_function": "<function/method/class the cursor or viewport is inside, or null>",
    "errors": [
      { "severity": "error" | "warning" | "info", "message": "<error text>", "line": <line number or null> }
    ],
    "terminal_output": "<last meaningful terminal output, max 200 chars, or null>",
    "git_indicators": "<branch name, modified/staged status if visible, or null>",
    "open_tabs": ["<tab1>", "<tab2>"],
    "cursor_area": "<what code construct the cursor/highlight is on, or null>"
  } | null
}

Rules:
- surface_type: classify the PRIMARY content area, not chrome/toolbars.
- ui_elements: list visible UI components (e.g. "code editor", "terminal", "file tree", "browser tab bar", "chart", "modal dialog"). Max 6 items.
- visual_context: describe the overall layout. E.g. "VS Code with split editor, terminal open at bottom, file tree collapsed".
- app_identifier: identify the application if possible (e.g. "VS Code", "Chrome", "Excel", "TradingView", "JetBrains IDE", "Vim", "Sublime Text").
- emotional_signal: infer from visible cues (error messages, repeated attempts, fast scrolling = frustrated; long pause on one spot = focused; many tabs/windows = exploring).
- is_sensitive: true if you see passwords, banking info, medical data, or confidential legal content. Be conservative.
- pedagogical_topics: topics John could teach about based on what's visible. Use Portuguese (pt-BR).
- Keep detected_text focused on the CONTENT area, not browser chrome or window titles.
- uncertainty: 0 = fully confident, 1 = very uncertain. Raise if screen is blurry, mostly empty, or hard to interpret.
- change_summary can be null if you have no previous frame to compare.
- Respond in the language context of what's visible, but field names stay in English.

CRITICAL — key_values extraction:
- key_values: extract ALL important numerical values, prices, metrics, and labels visible on screen. Read them EXACTLY as displayed in the image — do NOT guess, round, or infer numbers that you cannot clearly see.
- For charts: extract current price, price range (high/low visible on Y axis), timeframe, ticker/pair name, indicator values (RSI, MACD, EMA, etc.), volume if visible. Use exact decimal precision as shown.
- For dashboards: extract KPIs, percentages, totals, dates.
- For code: extract line numbers, error codes, file names.
- For documents: extract page numbers, section headings, key figures.
- Format as {"label": "value"} pairs. E.g. {"current_price": "1.15145", "pair": "EUR/USD", "price_high": "1.15280", "price_low": "1.15100", "timeframe": "5m"}.
- If a value is partially obscured or unreadable, OMIT it rather than guessing.
- Max 12 key-value pairs.

CRITICAL — code_context extraction (when surface_type is "code"):
- Set code_context to null ONLY if this is NOT a code/IDE screen.
- file_name: read the active tab title or title bar. E.g. "index.ts", "App.vue", "main.py".
- file_path: read from the title bar, breadcrumb, or explorer panel. E.g. "src/services/auth.ts".
- language: infer from file extension AND syntax visible. E.g. "TypeScript", "Python", "Rust".
- visible_line_range: read the line numbers on the gutter. E.g. "142-198".
- active_function: identify the function, method, or class the viewport is centered on. Read the actual name from the code. E.g. "handleSubmit", "class UserService", "def train_model".
- errors: extract ALL visible errors/warnings — red/yellow squiggly underlines, Problems panel entries, terminal error messages, inline error decorations. Read the EXACT error message text. Include the line number if visible.
- terminal_output: if a terminal/console panel is visible, extract the last meaningful output (build result, test result, error trace). Max 200 chars.
- git_indicators: branch name from status bar, modified file indicators (dots, M markers), staged changes count.
- open_tabs: list file names from visible editor tabs, left to right.
- cursor_area: describe what the cursor/selection/highlight is on. E.g. "inside useEffect callback", "on the return statement of fetchData", "selecting the import block".`

function buildVisionPrompt(
  ocrText: string,
  previousText: string,
  userProfile: UserProfile
): string {
  const parts: string[] = []

  parts.push('Analyze this screenshot.')

  if (userProfile.study_goals.length) {
    parts.push(`User study goals: ${userProfile.study_goals.slice(0, 3).join(', ')}.`)
  }

  parts.push(`User level: ${userProfile.user_level}.`)

  if (ocrText.trim()) {
    const truncated = ocrText.trim().slice(0, 600)
    parts.push(`OCR extracted text (may be noisy): "${truncated}"`)
  }

  if (previousText.trim()) {
    const truncated = previousText.trim().slice(0, 300)
    parts.push(`Previous frame text (for change detection): "${truncated}"`)
  }

  return parts.join('\n')
}

function buildVisionCacheKey(dataUrl: string, userProfile: UserProfile): string {
  const prefix = dataUrl.slice(0, 96)
  const suffix = dataUrl.slice(-96)
  const goals = userProfile.study_goals.slice(0, 3).join('|')
  return [
    userProfile.user_level,
    goals,
    String(dataUrl.length),
    prefix,
    suffix
  ].join('::')
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

const VALID_SURFACE_TYPES: Set<string> = new Set([
  'code', 'text', 'graphic', 'document', 'dashboard', 'unknown'
])

const VALID_CHANGE_SUMMARIES: Set<string> = new Set([
  'none', 'minor', 'major'
])

const VALID_EMOTIONAL_SIGNALS: Set<string> = new Set([
  'neutral', 'frustrated', 'focused', 'exploring', 'confused'
])

function parseVisionResponse(raw: string): VisionAnalysis | null {
  try {
    // Strip markdown fences if model wrapped the JSON
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim()

    const parsed = JSON.parse(cleaned) as Record<string, unknown>

    const surfaceType = String(parsed.surface_type ?? 'unknown')
    if (!VALID_SURFACE_TYPES.has(surfaceType)) return null

    const changeSummary = parsed.change_summary != null
      ? String(parsed.change_summary)
      : null
    if (changeSummary !== null && !VALID_CHANGE_SUMMARIES.has(changeSummary)) return null

    const emotionalSignal = parsed.emotional_signal != null
      ? String(parsed.emotional_signal)
      : null
    if (emotionalSignal !== null && !VALID_EMOTIONAL_SIGNALS.has(emotionalSignal)) return null

    return {
      surface_type: surfaceType as SurfaceType,
      visual_summary: String(parsed.visual_summary ?? ''),
      detected_text: String(parsed.detected_text ?? '').slice(0, 400),
      focus_region: String(parsed.focus_region ?? 'unknown'),
      probable_user_focus: String(parsed.probable_user_focus ?? '').slice(0, 200),
      inferred_intent: String(parsed.inferred_intent ?? ''),
      pedagogical_topics: toStringArray(parsed.pedagogical_topics).slice(0, 6),
      change_summary: changeSummary as ChangeSummary | null,
      uncertainty: clamp(Number(parsed.uncertainty ?? 0.5)),
      is_sensitive: Boolean(parsed.is_sensitive),
      sensitivity_reason: parsed.sensitivity_reason != null
        ? String(parsed.sensitivity_reason)
        : null,
      ui_elements: toStringArray(parsed.ui_elements).slice(0, 8),
      visual_context: parsed.visual_context != null
        ? String(parsed.visual_context)
        : null,
      app_identifier: parsed.app_identifier != null
        ? String(parsed.app_identifier)
        : null,
      emotional_signal: emotionalSignal as VisionAnalysis['emotional_signal'],
      key_values: toStringRecord(parsed.key_values),
      code_context: parseCodeContext(parsed.code_context)
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map(item => item.trim())
}

function toStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const result: Record<string, string> = {}
  const entries = Object.entries(value as Record<string, unknown>)
  for (const [key, val] of entries.slice(0, 12)) {
    if (typeof key === 'string' && val != null) {
      result[key] = String(val)
    }
  }
  return result
}

function parseCodeContext(value: unknown): CodeContext | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>

  return {
    file_name: raw.file_name != null ? String(raw.file_name) : null,
    file_path: raw.file_path != null ? String(raw.file_path) : null,
    language: raw.language != null ? String(raw.language) : null,
    visible_line_range: raw.visible_line_range != null ? String(raw.visible_line_range) : null,
    active_function: raw.active_function != null ? String(raw.active_function) : null,
    errors: parseCodeDiagnostics(raw.errors),
    terminal_output: raw.terminal_output != null ? String(raw.terminal_output).slice(0, 300) : null,
    git_indicators: raw.git_indicators != null ? String(raw.git_indicators) : null,
    open_tabs: toStringArray(raw.open_tabs).slice(0, 10),
    cursor_area: raw.cursor_area != null ? String(raw.cursor_area) : null
  }
}

function parseCodeDiagnostics(value: unknown): CodeDiagnostic[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is Record<string, unknown> =>
      item != null && typeof item === 'object' && !Array.isArray(item)
    )
    .map(item => ({
      severity: (['error', 'warning', 'info'].includes(String(item.severity))
        ? String(item.severity)
        : 'error') as CodeDiagnostic['severity'],
      message: String(item.message ?? ''),
      line: typeof item.line === 'number' ? item.line : null
    }))
    .filter(d => d.message.length > 0)
    .slice(0, 8)
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0.5
  return Math.max(0, Math.min(1, value))
}

function inferChangeFallback(previousText: string, currentText: string): ChangeSummary {
  if (!previousText) return 'major'
  const prevWords = new Set(previousText.toLowerCase().split(/\s+/).filter(w => w.length > 3))
  const currWords = new Set(currentText.toLowerCase().split(/\s+/).filter(w => w.length > 3))
  let common = 0
  for (const word of prevWords) {
    if (currWords.has(word)) common++
  }
  const union = new Set([...prevWords, ...currWords]).size
  const similarity = union > 0 ? common / union : 1
  if (similarity > 0.85) return 'none'
  if (similarity > 0.5) return 'minor'
  return 'major'
}

function withTimeout<T>(promise: Promise<T>, ms: number, abort?: AbortController): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      abort?.abort()
      reject(new Error('vision timeout'))
    }, ms)
    promise.then(
      value => { clearTimeout(timer); resolve(value) },
      error => { clearTimeout(timer); reject(error) }
    )
  })
}

// Resize screenshot to a max 768px wide JPEG before sending to Codex vision.
// Full 1280×720 PNG base64 can exceed 1 MB; most vision APIs cap at ~5 MB but
// a smaller payload reduces latency and avoids rejections on internal endpoints.
const VISION_MAX_WIDTH = 768

async function resizeForVision(dataUrl: string): Promise<string> {
  try {
    const img = nativeImage.createFromDataURL(dataUrl)
    const { width, height } = img.getSize()
    if (width <= VISION_MAX_WIDTH) return dataUrl
    const scale = VISION_MAX_WIDTH / width
    const resized = img.resize({
      width:   VISION_MAX_WIDTH,
      height:  Math.round(height * scale),
      quality: 'good'
    })
    return resized.toDataURL()
  } catch {
    return dataUrl
  }
}
