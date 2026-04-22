const openAIResponseStateByConversation = new Map<string, string>()

export function getOpenAIConversationResponseId(conversationKey?: string): string | null {
  if (!conversationKey) return null
  return openAIResponseStateByConversation.get(conversationKey) ?? null
}

export function setOpenAIConversationResponseId(conversationKey: string | undefined, responseId: string): void {
  if (!conversationKey || !responseId) return
  openAIResponseStateByConversation.set(conversationKey, responseId)
}

export function resetOpenAIConversationResponseId(conversationKey?: string): void {
  if (!conversationKey) return
  openAIResponseStateByConversation.delete(conversationKey)
}
