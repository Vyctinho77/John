/**
 * elevenlabs.ts
 *
 * Text-to-speech via ElevenLabs HTTP streaming endpoint.
 * Returns a Buffer containing MP3 audio for the given text.
 *
 * Voice: Ares (rySoiRs1IqQdRPeYbkYd) — created by the user.
 * Model: eleven_turbo_v2_5 — low-latency, high quality.
 */

const ELEVEN_BASE       = 'https://api.elevenlabs.io/v1'
const ARES_VOICE_ID     = 'rySoiRs1IqQdRPeYbkYd'
const ELEVEN_MODEL      = 'eleven_turbo_v2_5'
const OUTPUT_FORMAT     = 'mp3_44100_128'
const REQUEST_TIMEOUT   = 20_000

const VOICE_SETTINGS = {
  stability:        0.50,
  similarity_boost: 0.80,
  style:            0.00,
  use_speaker_boost: true
}

// Strips markdown formatting so the TTS doesn't read asterisks or backticks.
function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')          // fenced code blocks
    .replace(/`[^`]*`/g, '')                  // inline code
    .replace(/\*\*([^*]+)\*\*/g, '$1')        // bold **
    .replace(/\*([^*]+)\*/g, '$1')            // italic *
    .replace(/#{1,6}\s+/g, '')                // headings
    .replace(/^\s*[-•*]\s+/gm, '')            // bullet points
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // links
    .replace(/\n{3,}/g, '\n\n')               // excessive blank lines
    .trim()
}

export async function speakWithElevenLabs(text: string, apiKey: string): Promise<Buffer> {
  const clean = stripMarkdown(text)
  if (!clean) throw new Error('No speakable text after stripping markdown')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)

  try {
    const url = `${ELEVEN_BASE}/text-to-speech/${ARES_VOICE_ID}/stream?output_format=${OUTPUT_FORMAT}&optimize_streaming_latency=2`

    const res = await fetch(url, {
      method:  'POST',
      signal:  controller.signal,
      headers: {
        'xi-api-key':   apiKey,
        'Content-Type': 'application/json',
        'Accept':       'audio/mpeg'
      },
      body: JSON.stringify({
        text:            clean,
        model_id:        ELEVEN_MODEL,
        voice_settings:  VOICE_SETTINGS
      })
    })

    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      throw new Error(`ElevenLabs ${res.status}: ${errBody.slice(0, 200)}`)
    }

    // Collect the streamed chunks into a single Buffer
    const chunks: Uint8Array[] = []
    const reader = res.body!.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }

    return Buffer.concat(chunks)
  } finally {
    clearTimeout(timer)
  }
}
