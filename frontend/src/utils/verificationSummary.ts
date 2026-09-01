import { LeadsVerifyEmailsOutput } from '../api/types/leads/verifyEmails'

export type VerificationSummary = {
  level: 'success' | 'warning' | 'error'
  message: string
}

const leadCount = (count: number) => `${count} ${count === 1 ? 'lead' : 'leads'}`

/**
 * Turns a verify-emails response into honest user feedback: an HTTP 200 can
 * still mean every single lead failed, which must not read as success.
 */
export const summarizeVerification = (data: LeadsVerifyEmailsOutput): VerificationSummary => {
  const succeeded = data.results.length
  const failed = data.errors.length

  if (failed === 0) {
    return { level: 'success', message: `Verified ${leadCount(succeeded)}` }
  }

  if (succeeded === 0) {
    return { level: 'error', message: `Verification failed for ${leadCount(failed)}` }
  }

  return {
    level: 'warning',
    message: `Verified ${leadCount(succeeded)}, ${failed} failed`,
  }
}
