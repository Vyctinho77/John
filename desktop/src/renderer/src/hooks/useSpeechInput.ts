import { useCallback, useEffect, useRef, useState } from 'react'

export interface UseSpeechInputResult {
  isListening: boolean
  isSupported: boolean
  toggle: () => void
  stop: () => void
}

interface SpeechRecognitionAlternativeLike {
  transcript?: string
}

interface SpeechRecognitionResultLike {
  [index: number]: SpeechRecognitionAlternativeLike | undefined
}

interface SpeechRecognitionEventLike extends Event {
  results: ArrayLike<SpeechRecognitionResultLike>
}

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

/**
 * Wraps the Web Speech API for voice input.
 * - Language: pt-BR
 * - Single utterance per activation (continuous = false)
 * - Calls onTranscript with the final recognized text
 */
export function useSpeechInput(
  onTranscript: (text: string) => void
): UseSpeechInputResult {
  const [isListening, setIsListening]   = useState(false)
  const [isSupported, setIsSupported]   = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  useEffect(() => {
    const SR: SpeechRecognitionCtor | undefined =
      (window as unknown as { SpeechRecognition?: SpeechRecognitionCtor }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition
    setIsSupported(Boolean(SR))
  }, [])

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setIsListening(false)
  }, [])

  const start = useCallback(() => {
    const SR: SpeechRecognitionCtor | undefined =
      (window as unknown as { SpeechRecognition?: SpeechRecognitionCtor }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition
    if (!SR) return

    const recognition = new SR()
    recognition.lang            = 'pt-BR'
    recognition.continuous      = false
    recognition.interimResults  = false
    recognition.maxAlternatives = 1

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim()
      if (transcript) onTranscript(transcript)
    }

    recognition.onerror = () => {
      recognitionRef.current = null
      setIsListening(false)
    }
    recognition.onend   = () => { setIsListening(false); recognitionRef.current = null }

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }, [onTranscript, stop])

  const toggle = useCallback(() => {
    if (isListening) stop()
    else start()
  }, [isListening, start, stop])

  // Clean up on unmount
  useEffect(() => () => { recognitionRef.current?.stop() }, [])

  return { isListening, isSupported, toggle, stop }
}
