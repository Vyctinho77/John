import { useCallback, useRef, useState } from 'react'
import { useHudStateMachine, HudVisual } from '@renderer/hooks/useHudStateMachine'
import { usePerception } from '@renderer/hooks/usePerception'
import type { TutorMessage, TutorResponse } from '@shared/perception.types'
import { HudShell, HudContent } from './HudShell'
import { HudCompact } from './HudCompact'
import { HudIntermediate } from './HudIntermediate'
import { HudExpanded } from './HudExpanded'

interface Message {
  role: 'user' | 'assistant'
  content: string
  meta?: TutorResponse
}

function streamText(
  text: string,
  onChunk: (chunk: string) => void,
  onDone: () => void
): void {
  let i = 0
  const interval = setInterval(() => {
    if (i >= text.length) {
      clearInterval(interval)
      onDone()
      return
    }

    onChunk(text.slice(0, i + 1))
    i += Math.floor(Math.random() * 4) + 1
  }, 28)
}

export function HUD() {
  const [inputValue, setInputValue] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [streamingContent, setChunk] = useState('')
  const prevVisual = useRef<HudVisual>('compact')

  const {
    visual, isStreaming,
    expand, expandFull, collapse, ping,
    setStreaming, setInputFocused
  } = useHudStateMachine()

  const sessionActive = visual !== 'compact'
  const [privateMode, setPrivateModeState] = useState(false)

  const {
    contextSnapshot,
    isCapturing,
    togglePrivateMode: _togglePrivate,
    updateUserProfile,
    clearSessionMemory
  } = usePerception({ sessionActive, privateMode })

  const semanticState = contextSnapshot?.semanticState ?? null
  const sessionMemory = contextSnapshot?.sessionMemory ?? null
  const userProfile = contextSnapshot?.userProfile ?? null

  const handleTogglePrivate = useCallback(() => {
    setPrivateModeState(prev => !prev)
    _togglePrivate()
  }, [_togglePrivate])

  const handleCycleLevel = useCallback(() => {
    if (!userProfile) return

    const nextLevel =
      userProfile.user_level === 'beginner'
        ? 'intermediate'
        : userProfile.user_level === 'intermediate'
          ? 'advanced'
          : 'beginner'

    updateUserProfile({ user_level: nextLevel })
  }, [updateUserProfile, userProfile])

  const handleCycleStyle = useCallback(() => {
    if (!userProfile) return

    const nextStyle =
      userProfile.preferred_explanation_style === 'step_by_step'
        ? 'direct'
        : userProfile.preferred_explanation_style === 'direct'
          ? 'analogy'
          : userProfile.preferred_explanation_style === 'analogy'
            ? 'summary'
            : 'step_by_step'

    updateUserProfile({ preferred_explanation_style: nextStyle })
  }, [updateUserProfile, userProfile])

  if (prevVisual.current !== visual) prevVisual.current = visual

  const handleSubmit = useCallback(async () => {
    if (!inputValue.trim() || isStreaming) return

    const userMsg = inputValue.trim()
    const conversation: TutorMessage[] = [
      ...messages.map(message => ({
        role: message.role,
        content: message.content
      })),
      { role: 'user', content: userMsg }
    ]

    setInputValue('')
    setChunk('')

    setMessages(prev => {
      if (prev.length === 0) expandFull()
      return [...prev, { role: 'user', content: userMsg }]
    })

    setStreaming(true)

    try {
      const tutorResponse = await window.tutorAPI.respond({
        prompt: userMsg,
        conversation,
        context: contextSnapshot
      })

      let accumulated = ''
      streamText(
        tutorResponse.content,
        chunk => {
          accumulated = chunk
          setChunk(chunk)
        },
        () => {
          setMessages(prev => [
            ...prev,
            {
              role: 'assistant',
              content: accumulated,
              meta: tutorResponse
            }
          ])
          setChunk('')
          setStreaming(false)
        }
      )
    } catch (error) {
      console.error('[tutor] respond error:', error)
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: 'Nao consegui gerar uma explicacao contextual agora. Tente novamente com a sessao ativa.',
          meta: {
            mode: 'direct',
            content: '',
            uncertainty: 1,
            should_ask_confirmation: true,
            needs_visual_confirmation: true,
            suggested_follow_ups: ['Tentar novamente'],
            warning: null
          }
        }
      ])
      setChunk('')
      setStreaming(false)
    }
  }, [contextSnapshot, expandFull, inputValue, isStreaming, messages, setStreaming])

  const latestAssistant = [...messages].reverse().find(message => message.role === 'assistant')
  const latestResponse = latestAssistant?.content ?? ''
  const latestResponseMeta = latestAssistant?.meta ?? null

  return (
    <div className="w-screen h-screen flex items-start justify-center">
      <HudShell visual={visual} prevVisual={prevVisual.current}>
        <HudContent id={visual}>
          {visual === 'compact' && (
            <HudCompact onExpand={expand} isCapturing={isCapturing} />
          )}

          {visual === 'intermediate' && (
            <HudIntermediate
              inputValue={inputValue}
              onInputChange={value => { setInputValue(value); ping() }}
              onSubmit={handleSubmit}
              onInputFocus={() => setInputFocused(true)}
              onInputBlur={() => setInputFocused(false)}
              onActivity={ping}
              onCollapse={collapse}
              response={latestResponse}
              responseMeta={latestResponseMeta}
              isStreaming={isStreaming}
              semanticState={semanticState}
              sessionMemory={sessionMemory}
              isCapturing={isCapturing}
              isPrivate={privateMode}
              onTogglePrivate={handleTogglePrivate}
            />
          )}

          {visual === 'expanded' && (
            <HudExpanded
              inputValue={inputValue}
              onInputChange={value => { setInputValue(value); ping() }}
              onSubmit={handleSubmit}
              onInputFocus={() => setInputFocused(true)}
              onInputBlur={() => setInputFocused(false)}
              onActivity={ping}
              onCollapse={collapse}
              messages={messages}
              isStreaming={isStreaming}
              streamingContent={streamingContent}
              latestResponseMeta={latestResponseMeta}
              semanticState={semanticState}
              sessionMemory={sessionMemory}
              userProfile={userProfile}
              isCapturing={isCapturing}
              isPrivate={privateMode}
              onTogglePrivate={handleTogglePrivate}
              onCycleLevel={handleCycleLevel}
              onCycleStyle={handleCycleStyle}
              onClearContext={clearSessionMemory}
              onQuickPrompt={value => setInputValue(value)}
            />
          )}
        </HudContent>
      </HudShell>
    </div>
  )
}
