/** Family-friendly nickname rules for optional online profiles. */

export const NICKNAME_MIN_LENGTH = 3
export const NICKNAME_MAX_LENGTH = 20
export const NICKNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _.-]{1,18}[A-Za-z0-9]$/

/** Lightweight blocked tokens — extend via moderation tooling later. */
const BLOCKED_TOKENS = [
  'admin',
  'moderator',
  'decarby_staff',
  'nigger',
  'faggot',
  'retard',
  'fuck',
  'shit',
  'asshole',
  'bitch',
  'cunt',
  'rape',
  'pedo',
  'nazis',
  'hitler',
] as const

export type NicknameValidationResult =
  | Readonly<{ ok: true; nickname: string }>
  | Readonly<{ ok: false; reason: string }>

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function containsBlockedToken(nickname: string): boolean {
  const compact = nickname.toLowerCase().replace(/[\s._-]+/g, '')
  return BLOCKED_TOKENS.some((token) => compact.includes(token.replace(/[\s._-]+/g, '')))
}

export function validateNickname(raw: string): NicknameValidationResult {
  if (typeof raw !== 'string') {
    return { ok: false, reason: 'Nickname must be text.' }
  }

  const nickname = normalizeWhitespace(raw)
  if (nickname.length < NICKNAME_MIN_LENGTH) {
    return { ok: false, reason: `Use at least ${NICKNAME_MIN_LENGTH} characters.` }
  }
  if (nickname.length > NICKNAME_MAX_LENGTH) {
    return { ok: false, reason: `Keep nicknames to ${NICKNAME_MAX_LENGTH} characters or fewer.` }
  }
  if (!NICKNAME_PATTERN.test(nickname)) {
    return {
      ok: false,
      reason: 'Use letters, numbers, spaces, hyphens, underscores or periods only.',
    }
  }
  if (containsBlockedToken(nickname)) {
    return { ok: false, reason: 'Please choose a different, family-friendly nickname.' }
  }

  return { ok: true, nickname }
}

export function normalizeNicknameKey(nickname: string): string {
  return nickname.trim().toLowerCase()
}
