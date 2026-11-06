import { Attributes } from './index.ts';

export const testPersons = Array.from({ length: 12 }, (_, index) => ({
  subject: `TEST-PERSON-${(index + 1).toString().padStart(4, '0')}`,
  attributes: Attributes.parse({ verifiedOwner: index !== 9, age: index === 10 ? 16 : 30 + index,
    citizenship: index === 8 ? 'PL' : 'UA' }),
  role: index === 11 ? 'moderator' : 'participant',
}));
