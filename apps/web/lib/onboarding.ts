/**
 * Progress through workspace sign-up (screens 03 to 05).
 *
 * Step 1 collects the admin's details, step 2 the company, and only then is the workspace
 * created (the API needs both). Everything except the password is saved in localStorage so
 * "Save and exit" brings the person back to the same step. The password is held in memory
 * only, so a reload before step 2 is submitted asks for it again.
 */
export type OnboardingAbout = {
  fullName: string;
  jobTitle: string;
  email: string;
  mobile: string;
  role: string;
};

export type OnboardingCompany = {
  companyName: string;
  workspace: string;
  size: string;
  industry: string;
  city: string;
  state: string;
  pan: string;
  payrollStart: string;
  modules: string[];
};

export type OnboardingState = {
  step: 1 | 2 | 3;
  about?: OnboardingAbout;
  company?: OnboardingCompany;
};

const KEY = 'hrms.onboarding';
let password = '';

export const setOnboardingPassword = (p: string) => {
  password = p;
};
export const getOnboardingPassword = () => password;

export function loadOnboarding(): OnboardingState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as OnboardingState;
  } catch {
    // Private windows can block storage; start fresh.
  }
  return { step: 1 };
}

export function saveOnboarding(patch: Partial<OnboardingState>) {
  const next = { ...loadOnboarding(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Ignore: progress just won't survive a reload.
  }
  return next;
}

export function clearOnboarding() {
  password = '';
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}

export const ONBOARDING_ROUTES = { 1: '/signup', 2: '/onboarding/company', 3: '/onboarding/team' };

/** Employee count to mention on step 3, from the company size picked on step 2. */
export function sizeHint(size?: string) {
  return { '1–10': 10, '11–50': 50, '51–200': 128, '201–500': 500 }[size ?? ''];
}
