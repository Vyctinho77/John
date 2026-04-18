import type { TutorStep } from '@shared/perception.types'

interface Props {
  steps: TutorStep[]
  streamingContent: string
}

const STEP_ICONS: Record<string, string> = {
  context:  '◆',
  memory:   '◆',
  generate: '◆'
}

export function StreamingTimeline({ steps, streamingContent }: Props) {
  if (steps.length === 0 && !streamingContent) return null

  return (
    <div className="flex flex-col gap-0 w-full">
      {/* Pipeline steps */}
      {steps.map((step, i) => {
        const isLast  = i === steps.length - 1
        const isDone  = step.status === 'done'
        const isRun   = step.status === 'running'

        return (
          <div key={step.id} className="flex items-stretch gap-2">
            {/* Left column: icon + connector line */}
            <div className="flex flex-col items-center" style={{ minWidth: 18 }}>
              <span
                className="text-[10px] leading-none mt-[3px]"
                style={{
                  color: isRun ? 'var(--john-accent)' : isDone ? 'var(--john-text-tertiary)' : 'var(--john-text-muted)',
                  animation: isRun ? 'john-pulse 1.2s ease-in-out infinite' : undefined
                }}
              >
                {STEP_ICONS[step.id] ?? '◆'}
              </span>
              {/* Vertical connector line — only between steps that have content below */}
              {(!isLast || streamingContent) && (
                <div
                  className="flex-1 w-px mt-[3px]"
                  style={{ background: isDone ? 'var(--john-border-soft)' : 'color-mix(in srgb, var(--john-border-soft) 50%, transparent)', minHeight: 12 }}
                />
              )}
            </div>

            {/* Step label */}
            <div className="py-[3px] pb-2">
              <span
                className="text-[11px] leading-tight font-medium"
                style={{
                  color: isRun
                    ? 'var(--john-accent)'
                    : isDone
                      ? 'var(--john-text-tertiary)'
                      : 'var(--john-text-muted)',
                  letterSpacing: 'var(--hud-muted-tracking, -0.01em)'
                }}
              >
                {step.label}
              </span>
            </div>
          </div>
        )
      })}

      {/* Streaming text node */}
      {streamingContent && (
        <div className="flex items-start gap-2">
          <div className="flex flex-col items-center" style={{ minWidth: 18 }}>
            <div className="w-[6px] h-[6px] rounded-full mt-[5px]" style={{ background: 'var(--john-accent)' }} />
          </div>
          <p
            className="text-[13px] leading-relaxed flex-1 pb-1"
            style={{ color: 'var(--john-text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', letterSpacing: 'var(--hud-body-tracking, -0.014em)' }}
          >
            {streamingContent}
            <span
              className="inline-block w-[2px] h-[13px] ml-[2px] align-text-bottom rounded-sm"
              style={{ background: 'var(--john-accent)', animation: 'john-blink 1s step-end infinite' }}
            />
          </p>
        </div>
      )}

      <style>{`
        @keyframes john-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.35; }
        }
        @keyframes john-blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
      `}</style>
    </div>
  )
}
