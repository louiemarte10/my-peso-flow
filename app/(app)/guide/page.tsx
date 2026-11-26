import Link from "next/link";

export const metadata = { title: "How to Use — myPesoFlow" };

const STEPS = [
  {
    icon: "🏷️",
    title: "1. Set up your categories",
    body: (
      <>
        Open{" "}
        <Link href="/categories" className="text-brand hover:underline">
          Categories
        </Link>
        . You start with sensible ones (Salary, Freelance, Food &amp; Groceries,
        Bills…). Rename what does not fit, add your own, and pick a colour —
        that colour is what you will see in the dashboard breakdown.
      </>
    ),
  },
  {
    icon: "💰",
    title: "2. Encode what came in",
    body: (
      <>
        On{" "}
        <Link href="/earnings" className="text-brand hover:underline">
          Earnings
        </Link>
        , pick the date the money was actually received, choose the source, type
        the amount and save. Payday, freelance payout, 13th month — each one is
        its own entry.
      </>
    ),
  },
  {
    icon: "🧾",
    title: "3. Encode what went out",
    body: (
      <>
        On{" "}
        <Link href="/expenses" className="text-brand hover:underline">
          Expenses
        </Link>
        , same idea: the date you spent it, the category, the amount. Use the
        note field for anything you will want to recognise later.
      </>
    ),
  },
  {
    icon: "📊",
    title: "4. Watch the balance",
    body: (
      <>
        The{" "}
        <Link href="/dashboard" className="text-brand hover:underline">
          Dashboard
        </Link>{" "}
        shows today, the last 7 days, this month and this year — earnings,
        expenses and the balance for each. Switch the chart between 7 days,
        month and year, and use ‹ › to step back into past periods.
      </>
    ),
  },
  {
    icon: "📅",
    title: "5. Look things up later",
    body: (
      <>
        <Link href="/history" className="text-brand hover:underline">
          All Transactions
        </Link>{" "}
        is your full ledger grouped by day. Filter by date range, show only
        earnings or only expenses, search a note, and export the range to CSV
        for your own records.
      </>
    ),
  },
];

export default function GuidePage() {
  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">How to Use</h1>
        <p className="mt-1 text-sm text-slate-500">
          myPesoFlow is a manual tracker — nothing is imported from a bank, so
          what you encode is exactly what it reports.
        </p>
      </div>

      <ol className="space-y-3">
        {STEPS.map((s) => (
          <li
            key={s.title}
            className="flex gap-4 rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-light text-xl">
              {s.icon}
            </span>
            <div>
              <h2 className="font-bold text-slate-800">{s.title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-500">
                {s.body}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <div className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm">
        <h2 className="font-bold text-slate-800">Good to know</h2>
        <ul className="mt-2 space-y-2 text-sm text-slate-500">
          <li>
            <strong className="text-slate-700">Dates are Philippine time.</strong>{" "}
            A day runs 12:00 AM to 11:59 PM Manila, wherever you are when you
            encode it.
          </li>
          <li>
            <strong className="text-slate-700">Back-date freely.</strong> You can
            encode last week&apos;s expense today — it lands on the date you
            picked, not the date you typed it.
          </li>
          <li>
            <strong className="text-slate-700">Edit and delete anytime.</strong>{" "}
            Every row on the Earnings and Expenses pages has Edit and Delete.
          </li>
          <li>
            <strong className="text-slate-700">Removing a used category</strong>{" "}
            archives it instead of deleting, so your old entries keep their
            labels.
          </li>
          <li>
            <strong className="text-slate-700">Amounts are exact.</strong> Money
            is stored in centavos, so no rounding drift builds up over a year.
          </li>
        </ul>
      </div>
    </div>
  );
}
