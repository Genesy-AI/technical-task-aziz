import { describe, expect, it } from 'vitest'
import { summarizeVerification } from './verificationSummary'
import { LeadsVerifyEmailsOutput } from '../api/types/leads/verifyEmails'

const response = (
  results: LeadsVerifyEmailsOutput['results'],
  errors: LeadsVerifyEmailsOutput['errors'] = []
): LeadsVerifyEmailsOutput => ({
  success: true,
  verifiedCount: results.length,
  results,
  errors,
})

const error = (leadId: number) => ({ leadId, leadName: `Lead ${leadId}`, error: 'timeout' })

describe('summarizeVerification', () => {
  it('reports full success', () => {
    expect(
      summarizeVerification(
        response([
          { leadId: 1, emailVerified: true },
          { leadId: 2, emailVerified: false },
        ])
      )
    ).toEqual({ level: 'success', message: 'Verified 2 leads' })
  })

  it('reports partial success as a warning', () => {
    expect(
      summarizeVerification(response([{ leadId: 1, emailVerified: true }], [error(2)]))
    ).toEqual({ level: 'warning', message: 'Verified 1 lead, 1 failed' })
  })

  it('reports a total failure as an error even though the request succeeded', () => {
    expect(summarizeVerification(response([], [error(1), error(2)]))).toEqual({
      level: 'error',
      message: 'Verification failed for 2 leads',
    })
  })
})
