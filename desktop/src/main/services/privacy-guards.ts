export function detectSensitiveSurface(rawText: string): { isSensitive: boolean; reason: string | null } {
  const text = rawText.toLowerCase()

  if (/(senha|password|passcode|otp|2fa|token|api key|secret)/.test(text)) {
    return { isSensitive: true, reason: 'possible credential or authentication data on screen' }
  }

  if (/(cart[aã]o|credit card|cvv|bank account|ag[êe]ncia|conta corrente|pix|saldo dispon[ií]vel)/.test(text)) {
    return { isSensitive: true, reason: 'possible banking or payment information on screen' }
  }

  if (/(patient|paciente|diagn[oó]stico|prescri[cç][aã]o|exam result)/.test(text)) {
    return { isSensitive: true, reason: 'possible medical information on screen' }
  }

  if (/(contrato confidencial|nda|confidential|attorney-client|legal advice)/.test(text)) {
    return { isSensitive: true, reason: 'possible confidential legal content on screen' }
  }

  return { isSensitive: false, reason: null }
}
