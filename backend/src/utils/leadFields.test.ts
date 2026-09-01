import { describe, expect, it } from 'vitest'
import { normalizeOptionalLeadFields, parseLinkedinUrl, parseYearsAtCompany } from './leadFields'

describe('parseYearsAtCompany', () => {
  it('accepts whole numbers across the supported range', () => {
    expect(parseYearsAtCompany('0')).toEqual({ value: 0 })
    expect(parseYearsAtCompany('7')).toEqual({ value: 7 })
    expect(parseYearsAtCompany(100)).toEqual({ value: 100 })
  })

  it('treats blank as absent rather than invalid', () => {
    expect(parseYearsAtCompany('')).toEqual({ value: null })
    expect(parseYearsAtCompany(undefined)).toEqual({ value: null })
  })

  it('rejects numeric forms that are not plain decimal digits', () => {
    for (const value of ['1e2', '0x10', '+2', '2.0', ' 4 2 ']) {
      expect(parseYearsAtCompany(value)).toEqual({
        value: null,
        error: 'Years at company must be a whole number',
      })
    }
  })

  it('accepts digits surrounded by whitespace', () => {
    expect(parseYearsAtCompany('  12  ')).toEqual({ value: 12 })
  })

  it('rejects decimals, out-of-range values and non-numbers', () => {
    expect(parseYearsAtCompany('2.5').error).toBeDefined()
    expect(parseYearsAtCompany('-1').error).toBeDefined()
    expect(parseYearsAtCompany('101').error).toBeDefined()
    expect(parseYearsAtCompany('five').error).toBeDefined()
  })
})

describe('parseLinkedinUrl', () => {
  it('accepts linkedin.com and its subdomains over http(s)', () => {
    expect(parseLinkedinUrl('https://www.linkedin.com/in/jane')).toEqual({
      value: 'https://www.linkedin.com/in/jane',
    })
    expect(parseLinkedinUrl('http://linkedin.com/in/jane').value).toBe('http://linkedin.com/in/jane')
    expect(parseLinkedinUrl('https://uk.linkedin.com/in/jane').error).toBeUndefined()
  })

  it('rejects other hosts, lookalike domains and non-http protocols', () => {
    expect(parseLinkedinUrl('https://example.com/in/jane').error).toBeDefined()
    expect(parseLinkedinUrl('https://notlinkedin.com/in/jane').error).toBeDefined()
    expect(parseLinkedinUrl('ftp://linkedin.com/in/jane').error).toBeDefined()
    expect(parseLinkedinUrl('linkedin.com/in/jane').error).toBeDefined()
  })
})

describe('normalizeOptionalLeadFields', () => {
  it('trims the phone number without reformatting it', () => {
    expect(normalizeOptionalLeadFields({ phoneNumber: '  +1 (555) 010-1234  ' }).values.phoneNumber).toBe(
      '+1 (555) 010-1234'
    )
  })

  it('collects every field error for the row', () => {
    const { errors } = normalizeOptionalLeadFields({
      yearsAtCompany: '999',
      linkedinUrl: 'https://example.com',
    })
    expect(errors).toHaveLength(2)
  })
})
