import { describe, expect, it, vi } from 'vitest'
import { verifyLeadEmails, VerifiableLead } from './verifyLeadEmails'

const lead = (id: number, overrides: Partial<VerifiableLead> = {}): VerifiableLead => ({
  id,
  email: `lead${id}@example.com`,
  firstName: `First${id}`,
  lastName: `Last${id}`,
  ...overrides,
})

describe('verifyLeadEmails', () => {
  it('persists each verification outcome and counts the successes', async () => {
    const persistResult = vi.fn().mockResolvedValue(undefined)

    const result = await verifyLeadEmails({
      leads: [lead(1), lead(2)],
      verifyEmail: async ({ id }) => id === 1,
      persistResult,
    })

    expect(result).toEqual({
      verifiedCount: 2,
      results: [
        { leadId: 1, emailVerified: true },
        { leadId: 2, emailVerified: false },
      ],
      errors: [],
    })
    expect(persistResult).toHaveBeenCalledWith(1, true)
    expect(persistResult).toHaveBeenCalledWith(2, false)
  })

  it('reports a timeout as an error and never writes emailVerified for that lead', async () => {
    const persistResult = vi.fn().mockResolvedValue(undefined)

    const result = await verifyLeadEmails({
      leads: [lead(1), lead(2)],
      verifyEmail: async ({ id }) => {
        if (id === 2) throw new Error('activity StartToClose timeout')
        return true
      },
      persistResult,
    })

    expect(result.verifiedCount).toBe(1)
    expect(result.results).toEqual([{ leadId: 1, emailVerified: true }])
    expect(result.errors).toEqual([
      { leadId: 2, leadName: 'First2 Last2', error: 'activity StartToClose timeout' },
    ])
    expect(persistResult).toHaveBeenCalledTimes(1)
    expect(persistResult).toHaveBeenCalledWith(1, true)
  })

  it('processes leads concurrently instead of one after another', async () => {
    let inFlight = 0
    let maxInFlight = 0

    await verifyLeadEmails({
      leads: [lead(1), lead(2), lead(3)],
      verifyEmail: async () => {
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        await new Promise((resolve) => setTimeout(resolve, 10))
        inFlight -= 1
        return true
      },
      persistResult: async () => {},
    })

    expect(maxInFlight).toBe(3)
  })
})
