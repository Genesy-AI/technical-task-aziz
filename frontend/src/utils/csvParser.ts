import Papa from 'papaparse'

export interface CsvLead {
  firstName: string
  lastName: string
  email: string
  jobTitle?: string
  countryCode?: string
  companyName?: string
  phoneNumber?: string
  yearsAtCompany?: number
  linkedinUrl?: string
  isValid: boolean
  errors: string[]
  rowIndex: number
}

export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export const MIN_YEARS_AT_COMPANY = 0
export const MAX_YEARS_AT_COMPANY = 100

/** Digits only: `1e2`, `0x10`, `+2` and `2.0` are all rejected rather than coerced. */
const DIGITS_ONLY = /^\d+$/

/** Years at a company is a whole number; the range guards against typos and stray IDs. */
export const parseYearsAtCompany = (value: string): { value?: number; error?: string } => {
  const trimmed = value.trim()
  if (!trimmed) return {}

  if (!DIGITS_ONLY.test(trimmed)) {
    return { error: 'Years at company must be a whole number' }
  }

  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed)) {
    return { error: 'Years at company must be a whole number' }
  }
  if (parsed < MIN_YEARS_AT_COMPANY || parsed > MAX_YEARS_AT_COMPANY) {
    return { error: `Years at company must be between ${MIN_YEARS_AT_COMPANY} and ${MAX_YEARS_AT_COMPANY}` }
  }
  return { value: parsed }
}

/** Accepts linkedin.com and its subdomains over HTTP(S) only. */
export const parseLinkedinUrl = (value: string): { value?: string; error?: string } => {
  if (!value) return {}

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return { error: 'LinkedIn URL must be a valid URL' }
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { error: 'LinkedIn URL must use http or https' }
  }

  const hostname = url.hostname.toLowerCase()
  if (hostname !== 'linkedin.com' && !hostname.endsWith('.linkedin.com')) {
    return { error: 'LinkedIn URL must be a linkedin.com address' }
  }

  return { value }
}

export const parseCsv = (content: string): CsvLead[] => {
  if (!content?.trim()) {
    throw new Error('CSV content cannot be empty')
  }

  const parseResult = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    transform: (value) => value.trim(),
    transformHeader: (header) => header.trim().toLowerCase(),
    quoteChar: '"',
  })

  if (parseResult.errors.length > 0) {
    const criticalErrors = parseResult.errors.filter(
      (error) => error.type === 'Delimiter' || error.type === 'Quotes' || error.type === 'FieldMismatch'
    )
    if (criticalErrors.length > 0) {
      throw new Error(`CSV parsing failed: ${criticalErrors[0].message}`)
    }
  }

  if (!parseResult.data || parseResult.data.length === 0) {
    throw new Error('CSV file appears to be empty or contains no valid data')
  }

  const data: CsvLead[] = []

  parseResult.data.forEach((row, index) => {
    if (Object.values(row).every((value) => !value)) return

    const lead: Partial<CsvLead> = { rowIndex: index + 2 }
    let rawYearsAtCompany = ''
    let rawLinkedinUrl = ''

    Object.entries(row).forEach(([header, value]) => {
      const normalizedHeader = header.toLowerCase().replace(/[^a-z]/g, '')
      const trimmedValue = value?.trim() || ''

      switch (normalizedHeader) {
        case 'firstname':
          lead.firstName = trimmedValue
          break
        case 'lastname':
          lead.lastName = trimmedValue
          break
        case 'email':
          lead.email = trimmedValue
          break
        case 'jobtitle':
          lead.jobTitle = trimmedValue || undefined
          break
        case 'countrycode':
          lead.countryCode = trimmedValue || undefined
          break
        case 'companyname':
          lead.companyName = trimmedValue || undefined
          break
        case 'phonenumber':
          // Phone formats vary by country; keep the supplied value verbatim.
          lead.phoneNumber = trimmedValue || undefined
          break
        // `yearsInRole` is the alias used by the supplied fixtures.
        case 'yearsatcompany':
        case 'yearsinrole':
          rawYearsAtCompany = trimmedValue
          break
        case 'linkedinurl':
          rawLinkedinUrl = trimmedValue
          break
      }
    })

    const errors: string[] = []

    const years = parseYearsAtCompany(rawYearsAtCompany)
    if (years.error) errors.push(years.error)
    lead.yearsAtCompany = years.value

    const linkedin = parseLinkedinUrl(rawLinkedinUrl)
    if (linkedin.error) errors.push(linkedin.error)
    lead.linkedinUrl = linkedin.value

    if (!lead.firstName?.trim()) {
      errors.push('First name is required')
    }
    if (!lead.lastName?.trim()) {
      errors.push('Last name is required')
    }
    if (!lead.email?.trim()) {
      errors.push('Email is required')
    } else if (!isValidEmail(lead.email)) {
      errors.push('Invalid email format')
    }

    data.push({
      ...lead,
      firstName: lead.firstName || '',
      lastName: lead.lastName || '',
      email: lead.email || '',
      isValid: errors.length === 0,
      errors,
    } as CsvLead)
  })

  return data
}
