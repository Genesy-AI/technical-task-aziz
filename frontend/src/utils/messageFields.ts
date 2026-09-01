/**
 * Single source of truth for the fields a message template can interpolate.
 * Adding a lead field means adding one entry here, not another block of JSX.
 */
export type MessageFieldGroup = 'Identity' | 'Work' | 'Contact'

export type MessageField = {
  key: string
  label: string
  group: MessageFieldGroup
}

export const MESSAGE_FIELD_GROUPS: MessageFieldGroup[] = ['Identity', 'Work', 'Contact']

export const MESSAGE_FIELDS: MessageField[] = [
  { key: 'firstName', label: 'First name', group: 'Identity' },
  { key: 'lastName', label: 'Last name', group: 'Identity' },
  { key: 'jobTitle', label: 'Job title', group: 'Work' },
  { key: 'companyName', label: 'Company', group: 'Work' },
  { key: 'yearsAtCompany', label: 'Years at company', group: 'Work' },
  { key: 'email', label: 'Email', group: 'Contact' },
  { key: 'phoneNumber', label: 'Phone', group: 'Contact' },
  { key: 'linkedinUrl', label: 'LinkedIn URL', group: 'Contact' },
  { key: 'countryCode', label: 'Country code', group: 'Contact' },
]

export const messageFieldsByGroup = (): Array<{ group: MessageFieldGroup; fields: MessageField[] }> =>
  MESSAGE_FIELD_GROUPS.map((group) => ({
    group,
    fields: MESSAGE_FIELDS.filter((field) => field.group === group),
  })).filter(({ fields }) => fields.length > 0)
