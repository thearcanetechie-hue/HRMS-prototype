/**
 * Password rules, following NIST SP 800-63B: length matters most, so there are no forced
 * symbol or case rules. Instead passwords are checked against common and breached choices and
 * against the person's own details. Shared so the sign-up form and the API agree.
 */

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

/** Frequently breached passwords and patterns, lower-cased. A short list, kept small on purpose. */
const COMMON = new Set(
  `password password1 password12 password123 password1234 passw0rd p@ssw0rd p@ssword 123456 1234567 12345678
123456789 1234567890 0123456789 qwerty qwerty123 qwertyuiop qwerty12345 asdfghjkl zxcvbnm 1q2w3e4r 1q2w3e4r5t
1qaz2wsx abc123 abcd1234 abcdef123 iloveyou iloveyou1 welcome welcome1 welcome123 welcome@123 admin admin123
admin@123 administrator letmein letmein123 monkey dragon football baseball sunshine princess shadow master
master123 superman batman trustno1 starwars login login123 changeme changeme123 secret secret123 india india123
india@123 bharat123 mumbai123 delhi123 bangalore123 hello123 hello@123 test123 test@123 testing123 company123
company@123 office123 office@123 employee123 hrms123 hrms@123 payroll123 summer2026 winter2026 diwali2026
jaimatadi jaishreeram krishna123 ganesh123 sairam123 omsairam123 lakshmi123 pass@123 pass1234 pass@1234`.split(
    /\s+/,
  ),
);

export interface PasswordContext {
  email?: string;
  name?: string;
  workspace?: string;
  company?: string;
}

/** What's wrong with a password, or null when it's fine. */
export function passwordProblem(password: string, ctx: PasswordContext = {}): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters`;
  if (password.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters`;
  const lower = password.toLowerCase();
  if (COMMON.has(lower) || COMMON.has(lower.replace(/[^a-z0-9@]/g, '')))
    return 'That password is too common. Try a short phrase of unrelated words.';
  if (/^(.)\1+$/.test(password)) return 'Don’t repeat one character';
  if (/^(?:0123456789|1234567890|abcdefghij|qwertyuiop)/i.test(password))
    return 'Avoid sequences like 1234 or qwerty';
  const own = [
    ctx.email?.split('@')[0],
    ...(ctx.name?.split(/\s+/) ?? []),
    ctx.workspace,
    ...(ctx.company?.split(/\s+/) ?? []),
  ]
    .map((x) => x?.toLowerCase().trim())
    .filter((x): x is string => Boolean(x && x.length >= 4));
  if (own.some((w) => lower.includes(w)))
    return 'Don’t use your name, email, company or workspace in it';
  return null;
}

/** A rough 0–4 strength score for the meter on the form. */
export function passwordStrength(password: string): 0 | 1 | 2 | 3 | 4 {
  if (!password || passwordProblem(password)) return password.length >= PASSWORD_MIN ? 1 : 0;
  let classes = 0;
  for (const re of [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/]) if (re.test(password)) classes++;
  const score =
    (password.length >= 14 ? 2 : 1) + (classes >= 3 ? 1 : 0) + (password.length >= 18 ? 1 : 0);
  return Math.min(4, score) as 0 | 1 | 2 | 3 | 4;
}
