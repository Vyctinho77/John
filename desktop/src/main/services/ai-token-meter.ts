import type { AIFeatureTask } from '../../shared/ai-provider.types'
import { recordDiagnosticEvent } from './observability'

export interface RemoteChatTokenRequest {
  system: string
  prompt: string
  imageDataUrl?: string | null
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>
  feature?: AIFeatureTask
}

export type OpenAIResponsesInputMessage = {
  role: 'user' | 'assistant'
  content: string | Array<{ type: 'input_text'; text: string } | { type: 'input_image'; image_url: string; detail: 'auto' }>
}

export async function resolveOpenAIInputTokenEstimate(input: {
  baseUrl: string
  apiKey: string
  model: string
  request: RemoteChatTokenRequest
  previousResponseId: string | null
  usingResponsesApi: boolean
}): Promise<{
  estimatedInputTokens: number
  usedInputTokenCountEndpoint: boolean
}> {
  const heuristicEstimate = estimateRemoteChatInputTokens(input.request)

  if (!input.usingResponsesApi) {
    return {
      estimatedInputTokens: heuristicEstimate,
      usedInputTokenCountEndpoint: false
    }
  }

  try {
    const response = await fetch(joinUrl(input.baseUrl, '/responses/input_tokens'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${input.apiKey}`
      },
      body: JSON.stringify({
        model: input.model,
        instructions: input.request.system,
        ...(input.previousResponseId ? { previous_response_id: input.previousResponseId } : {}),
        input: buildOpenAIResponsesInput(input.request, Boolean(input.previousResponseId))
      })
    })
    if (!response.ok) {
      throw new Error(`OpenAI input_tokens respondeu ${response.status}.`)
    }

    const payload = await response.json() as {
      input_tokens?: number
    }
    const countedTokens = payload.input_tokens ?? 0
    if (countedTokens > 0) {
      return {
        estimatedInputTokens: countedTokens,
        usedInputTokenCountEndpoint: true
      }
    }
  } catch (error) {
    void recordDiagnosticEvent({
      type: 'trace',
      source: 'main',
      action: 'input_token_count_fallback',
      details: {
        provider: 'openai',
        model: input.model,
        feature: input.request.feature ?? 'unknown',
        usingResponsesApi: true,
        hasPreviousResponseId: Boolean(input.previousResponseId),
        reason: error instanceof Error ? error.message.slice(0, 180) : 'unknown'
      }
    })
  }

  return {
    estimatedInputTokens: heuristicEstimate,
    usedInputTokenCountEndpoint: false
  }
}

export function shouldUseOpenAIResponsesAPI(
  model: string,
  request: RemoteChatTokenRequest
): boolean {
  const normalizedModel = model.toLowerCase()
  if (request.feature !== 'tutor') return false
  if (request.imageDataUrl && !normalizedModel.startsWith('gpt-4.1') && !normalizedModel.startsWith('gpt-4o')) {
    return false
  }
  return true
}

export function buildOpenAIResponsesInput(
  request: RemoteChatTokenRequest,
  usePreviousResponseState: boolean
): OpenAIResponsesInputMessage[] {
  const history = usePreviousResponseState ? [] : (request.messages ?? [])
  const items: OpenAIResponsesInputMessage[] = history.map(message => ({
    role: message.role,
    content: message.content
  }))

  const currentUserContent = request.imageDataUrl
    ? [
        { type: 'input_text' as const, text: request.prompt },
        { type: 'input_image' as const, image_url: request.imageDataUrl, detail: 'auto' as const }
      ]
    : request.prompt

  items.push({
    role: 'user',
    content: currentUserContent
  })

  return items
}

export function estimateRemoteChatInputTokens(request: RemoteChatTokenRequest): number {
  let charCount = request.system.length + request.prompt.length

  for (const message of request.messages ?? []) {
    charCount += message.content.length + 12
  }

  if (request.imageDataUrl) {
    charCount += 1_200
  }

  return Math.max(1, Math.ceil(charCount / 4))
}

function joinUrl(baseUrl: string, path: string): string {
  return `${trimTrailingSlash(baseUrl)}${path}`
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}
