export type VerifiableLead = {
  id: number
  email: string
  firstName: string
  lastName: string
}

export type VerifyLeadEmailsResult = {
  verifiedCount: number
  results: Array<{ leadId: number; emailVerified: boolean }>
  errors: Array<{ leadId: number; leadName: string; error: string }>
}

type VerifyLeadEmailsDeps = {
  leads: VerifiableLead[]
  /** Runs the verification workflow for one lead. Rejecting means "unknown", not "invalid". */
  verifyEmail: (lead: VerifiableLead) => Promise<boolean>
  persistResult: (leadId: number, emailVerified: boolean) => Promise<void>
}

/**
 * Verifies every lead concurrently and isolates outcomes: one slow or failing
 * provider call never blocks or corrupts the others. A failure leaves the
 * stored `emailVerified` untouched, because "we could not check" is not "invalid".
 */
export const verifyLeadEmails = async ({
  leads,
  verifyEmail,
  persistResult,
}: VerifyLeadEmailsDeps): Promise<VerifyLeadEmailsResult> => {
  const outcomes = await Promise.all(
    leads.map(async (lead) => {
      try {
        const emailVerified = Boolean(await verifyEmail(lead))
        await persistResult(lead.id, emailVerified)
        return { ok: true as const, leadId: lead.id, emailVerified }
      } catch (error) {
        return {
          ok: false as const,
          leadId: lead.id,
          leadName: `${lead.firstName} ${lead.lastName ?? ''}`.trim(),
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      }
    })
  )

  const results = outcomes
    .filter((outcome) => outcome.ok)
    .map(({ leadId, emailVerified }) => ({ leadId, emailVerified }))
  const errors = outcomes
    .filter((outcome) => !outcome.ok)
    .map(({ leadId, leadName, error }) => ({ leadId, leadName, error }))

  return { verifiedCount: results.length, results, errors }
}
