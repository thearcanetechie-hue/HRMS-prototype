import Link from 'next/link';

export const metadata = { title: 'Privacy notice · HRMS' };

/**
 * A starter privacy notice under the Digital Personal Data Protection Act, 2023.
 * The business running this service must replace it with text its lawyer has approved.
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto grid max-w-2xl gap-5 px-4 py-12 leading-relaxed">
      <p className="rounded-2xl bg-warning/10 p-4 text-[13.5px] text-warning">
        Starter text. Replace it with your own privacy notice, reviewed by your lawyer, before you
        go live.
      </p>
      <h1 className="text-3xl">Privacy notice</h1>
      <p>
        This service keeps HR records for your employer, who decides what is collected and why (the
        Data Fiduciary under the Digital Personal Data Protection Act, 2023). We process that data
        on their behalf.
      </p>
      <h2 className="text-xl">What we keep and why</h2>
      <p>
        Your name, work contact details, job, attendance, leave, pay and statutory identifiers (such
        as PAN, UAN and bank details) to run payroll, meet tax and labour law, and manage your
        employment. Sensitive identifiers are encrypted.
      </p>
      <h2 className="text-xl">Your rights</h2>
      <p>
        You can ask to see, correct or erase your data where the law allows, and to withdraw consent
        for anything that relies on it. Some records must be kept for statutory periods (for example
        payroll and tax records).
      </p>
      <h2 className="text-xl">Grievances</h2>
      <p>
        Contact your employer’s HR team or their grievance officer. You may also approach the Data
        Protection Board of India.
      </p>
      <Link href="/login">Back to sign in</Link>
    </main>
  );
}
