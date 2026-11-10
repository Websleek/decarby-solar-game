/**
 * Final B — contact form validation for voucher claims.
 * Server and client share the same rules; server remains authoritative.
 */

import { PROMOTIONAL_TERMS_VERSION, validatePromotionalConsentInput } from './consent.ts'
import { normalizeEmail } from './emailNormalize.ts'

export const FULL_NAME_MAX = 120
export const FULL_NAME_MIN = 2
export const PHONE_MAX = 32

export type VoucherContactInput = Readonly<{
  fullName: unknown
  phone: unknown
  email: unknown
  termsAccepted: unknown
  adultSelfAttested: unknown
  marketingOptIn?: unknown
  termsVersion?: unknown
  /** Ignored for authority — client must not control reward amount. */
  amountCents?: unknown
}>

export type ValidatedVoucherContact = Readonly<{
  fullName: string
  phone: string
  emailRaw: string
  emailNormalized: string
  termsAccepted: true
  adultSelfAttested: true
  marketingOptIn: boolean
  termsVersion: string
}>

export type ContactValidationFailure = Readonly<{
  ok: false
  code:
    | 'invalid_name'
    | 'invalid_phone'
    | 'invalid_email'
    | 'adult_attestation_required'
    | 'terms_required'
    | 'terms_version_mismatch'
    | 'oversized_input'
  reason: string
  field?: 'fullName' | 'phone' | 'email' | 'terms' | 'adult' | 'marketing'
}>

export type ContactValidationResult =
  | Readonly<{ ok: true; value: ValidatedVoucherContact }>
  | ContactValidationFailure

export function validateFullName(input: unknown): ContactValidationResult {
  if (typeof input !== 'string') {
    return { ok: false, code: 'invalid_name', reason: 'Enter your full name.', field: 'fullName' }
  }
  if (input.length > FULL_NAME_MAX + 20) {
    return {
      ok: false,
      code: 'oversized_input',
      reason: 'Name is too long.',
      field: 'fullName',
    }
  }
  const fullName = input.trim().replace(/\s+/g, ' ')
  if (fullName.length < FULL_NAME_MIN || fullName.length > FULL_NAME_MAX) {
    return {
      ok: false,
      code: 'invalid_name',
      reason: 'Enter your full name (at least 2 characters).',
      field: 'fullName',
    }
  }
  if (!/^[\p{L}][\p{L}\p{M}'’.\- ]+$/u.test(fullName)) {
    return {
      ok: false,
      code: 'invalid_name',
      reason: 'Name contains invalid characters.',
      field: 'fullName',
    }
  }
  return {
    ok: true,
    value: {
      fullName,
      phone: '',
      emailRaw: '',
      emailNormalized: '',
      termsAccepted: true,
      adultSelfAttested: true,
      marketingOptIn: false,
      termsVersion: PROMOTIONAL_TERMS_VERSION,
    },
  }
}

/**
 * Australian phone numbers (mobile or landline), with optional +61 / 0 trunk.
 * Stored as a compact digit string with leading + for international form when possible.
 */
export function normalizeAuPhone(input: unknown): ContactValidationResult {
  if (typeof input !== 'string') {
    return {
      ok: false,
      code: 'invalid_phone',
      reason: 'Enter a valid Australian phone number.',
      field: 'phone',
    }
  }
  if (input.length > PHONE_MAX + 20) {
    return { ok: false, code: 'oversized_input', reason: 'Phone number is too long.', field: 'phone' }
  }
  const trimmed = input.trim()
  if (!trimmed || trimmed.length > PHONE_MAX) {
    return {
      ok: false,
      code: 'invalid_phone',
      reason: 'Enter a valid Australian phone number.',
      field: 'phone',
    }
  }
  const digits = trimmed.replace(/[^\d+]/g, '')
  let national = digits
  if (national.startsWith('+')) {
    if (!national.startsWith('+61')) {
      return {
        ok: false,
        code: 'invalid_phone',
        reason: 'Use an Australian number (+61 or starting with 0).',
        field: 'phone',
      }
    }
    national = '0' + national.slice(3)
  }
  national = national.replace(/\D/g, '')
  // Mobile 04xxxxxxxx or landline 0[2378]xxxxxxxx
  if (!/^0[2378]\d{8}$/.test(national) && !/^04\d{8}$/.test(national)) {
    return {
      ok: false,
      code: 'invalid_phone',
      reason: 'Enter a valid Australian mobile or landline number.',
      field: 'phone',
    }
  }
  const e164 = '+61' + national.slice(1)
  return {
    ok: true,
    value: {
      fullName: '',
      phone: e164,
      emailRaw: '',
      emailNormalized: '',
      termsAccepted: true,
      adultSelfAttested: true,
      marketingOptIn: false,
      termsVersion: PROMOTIONAL_TERMS_VERSION,
    },
  }
}

export function validateVoucherContactForm(
  input: VoucherContactInput,
  expectedTermsVersion: string = PROMOTIONAL_TERMS_VERSION,
): ContactValidationResult {
  const name = validateFullName(input.fullName)
  if (!name.ok) return name

  const phone = normalizeAuPhone(input.phone)
  if (!phone.ok) return phone

  const email = normalizeEmail(input.email)
  if (!email.ok) {
    return { ok: false, code: 'invalid_email', reason: email.reason, field: 'email' }
  }

  const consent = validatePromotionalConsentInput(
    {
      adultSelfAttested: input.adultSelfAttested === true,
      termsAccepted: input.termsAccepted === true,
      termsVersion:
        typeof input.termsVersion === 'string' ? input.termsVersion : expectedTermsVersion,
      marketingOptIn: input.marketingOptIn === true,
    },
    expectedTermsVersion,
  )
  if (!consent.ok) {
    return {
      ok: false,
      code: consent.code,
      reason: consent.reason,
      field: consent.code.startsWith('adult') ? 'adult' : 'terms',
    }
  }

  return {
    ok: true,
    value: {
      fullName: name.value.fullName,
      phone: phone.value.phone,
      emailRaw: email.raw,
      emailNormalized: email.normalized,
      termsAccepted: true,
      adultSelfAttested: true,
      marketingOptIn: input.marketingOptIn === true,
      termsVersion: expectedTermsVersion,
    },
  }
}
