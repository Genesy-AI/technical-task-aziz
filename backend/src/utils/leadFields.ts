export type OptionalLeadFields = {
  phoneNumber: string | null
  yearsAtCompany: number | null
  linkedinUrl: string | null
}

export type NormalizedLeadFields = {
  values: OptionalLeadFields
  errors: string[]
}

export const MIN_YEARS_AT_COMPANY = 0
export const MAX_YEARS_AT_COMPANY = 100

/** Digits only: `1e2`, `0x10`, `+2` and `2.0` are all rejected rather than coerced. */
const DIGITS_ONLY = /^\d+$/

/** Years at a company is a whole number; the range guards against typos and stray IDs. */
export const parseYearsAtCompany = (value: unknown): { value: number | null; error?: string } => {
  if (value === null || value === undefined || value === '') return { value: null }

  let parsed: number
  if (typeof value === 'number') {
    parsed = value
  } else {
    const trimmed = String(value).trim()
    if (!trimmed) return { value: null }
    if (!DIGITS_ONLY.test(trimmed)) {
      return { value: null, error: 'Years at company must be a whole number' }
    }
    parsed = Number(trimmed)
  }

  if (!Number.isInteger(parsed)) {
    return { value: null, error: 'Years at company must be a whole number' }
  }
  if (parsed < MIN_YEARS_AT_COMPANY || parsed > MAX_YEARS_AT_COMPANY) {
    return {
      value: null,
      error: `Years at company must be between ${MIN_YEARS_AT_COMPANY} and ${MAX_YEARS_AT_COMPANY}`,
    }
  }
  return { value: parsed }
}

/** Accepts linkedin.com and its subdomains over HTTP(S) only. */
export const parseLinkedinUrl = (value: unknown): { value: string | null; error?: string } => {
  if (value === null || value === undefined || value === '') return { value: null }

  const trimmed = String(value).trim()
  if (!trimmed) return { value: null }

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return { value: null, error: 'LinkedIn URL must be a valid URL' }
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { value: null, error: 'LinkedIn URL must use http or https' }
  }

  const hostname = url.hostname.toLowerCase()
  if (hostname !== 'linkedin.com' && !hostname.endsWith('.linkedin.com')) {
    return { value: null, error: 'LinkedIn URL must be a linkedin.com address' }
  }

  return { value: trimmed }
}

/** Phone numbers stay verbatim apart from trimming: formats vary by country. */
export const parsePhoneNumber = (value: unknown): string | null => {
  if (value === null || value === undefined) return null
  const trimmed = String(value).trim()
  return trimmed || null
}

export const normalizeOptionalLeadFields = (lead: {
  phoneNumber?: unknown
  yearsAtCompany?: unknown
  linkedinUrl?: unknown
}): NormalizedLeadFields => {
  const years = parseYearsAtCompany(lead.yearsAtCompany)
  const linkedin = parseLinkedinUrl(lead.linkedinUrl)
  const errors = [years.error, linkedin.error].filter((error): error is string => Boolean(error))

  return {
    values: {
      phoneNumber: parsePhoneNumber(lead.phoneNumber),
      yearsAtCompany: years.value,
      linkedinUrl: linkedin.value,
    },
    errors,
  }
}
