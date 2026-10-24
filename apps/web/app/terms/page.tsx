import Link from 'next/link';

export const metadata = { title: 'Terms of service · HRMS' };

/** Starter terms. The business running this service must replace them with lawyer-approved text. */
export default function TermsPage() {
  return (
    <main className="mx-auto grid max-w-2xl gap-5 px-4 py-12 leading-relaxed">
      <p className="rounded-2xl bg-warning/10 p-4 text-[13.5px] text-warning">
        Starter text. Replace it with your own terms of service, reviewed by your lawyer, before you
        go live.
      </p>
      <h1 className="text-3xl">Terms of service</h1>
      <p>
        By creating a workspace you confirm you may act for your company, that the information you
        add is accurate, and that you have told your employees how their data is used.
      </p>
      <p>
        Payroll, tax and statutory figures are calculated from the rules and data you set. Have them
        checked by a qualified professional before you rely on them.
      </p>
      <p>
        Keep your login private and turn on two-step sign-in for accounts that can see pay or
        personal data.
      </p>
      <Link href="/login">Back to sign in</Link>
    </main>
  );
}
