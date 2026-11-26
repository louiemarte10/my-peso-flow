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
    icon: "👛",
    title: "2. Add your wallets",
    body: (
      <>
        On{" "}
        <Link href="/wallets" className="text-brand hover:underline">
          My Wallets
        </Link>
        , add every place your money sits — Security Bank, GoTyme, GCash, cash
        in your pocket. Set each one&apos;s <strong>opening balance</strong> to
        what is in it right now. From then on the balance is worked out for you.
      </>
    ),
  },
  {
    icon: "💰",
    title: "3. Encode what came in",
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
    title: "4. Encode what went out",
    body: (
      <>
        On{" "}
        <Link href="/expenses" className="text-brand hover:underline">
          Expenses
        </Link>
        , same idea: the date you spent it, the category, the amount. Use the
        note field for anything you will want to recognise later. Pick the
        wallet it came out of and that wallet&apos;s balance drops to match.
      </>
    ),
  },
  {
    icon: "🏧",
    title: "Withdrawing and moving money",
    body: (
      <>
        Taking cash out of the ATM, cashing in to GCash, setting money aside for
        ipon — all of these are <strong>moves</strong>, not expenses. Use{" "}
        <strong>Move money / Withdraw</strong> on the Wallets page so your
        earnings and expense totals stay honest. Put any ATM or cash-in charge
        in the fee box: that part really is gone, and it is counted as such.
      </>
    ),
  },
  {
    icon: "📊",
    title: "5. Watch the balance",
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
    title: "6. Look things up later",
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
            <strong className="text-slate-700">Edit anytime.</strong> Every row
            on the Earnings, Expenses, Wallets and Categories pages has an
            Edit button, so a wrong amount or date is a two-second fix.
          </li>
          <li>
            <strong className="text-slate-700">Archive, never lose.</strong>{" "}
            Archive asks you to confirm, then the row stops counting towards
            every total and balance. It waits on{" "}
            <Link href="/archived" className="text-brand hover:underline">
              Archived
            </Link>{" "}
            where you can Restore it exactly as it was, or Delete forever.
            Deleting forever is the only thing that cannot be undone.
          </li>

          <li>
            <strong className="text-slate-700">Amounts are exact.</strong> Money
            is stored in centavos, so no rounding drift builds up over a year.
          </li>
          <li>
            <strong className="text-slate-700">
              Wallet balances are never typed in.
            </strong>{" "}
            Each one is opening balance + money in − money out, recalculated
            every time. Fix a wrong entry from last month and the balance
            corrects itself.
          </li>
          <li>
            <strong className="text-slate-700">Vague categories ask back.</strong>{" "}
            Tick <em>needs details</em> on a catch-all like
            &ldquo;Others&rdquo; and encoding against it insists you write what
            it actually was &mdash; e.g.{" "}
            <em>6 Marlboro at 11 pesos each</em>. The{" "}
            <em>Quick maths</em> box beside the form turns a quantity and a
            price each into the amount for you.
          </li>
          <li>
            <strong className="text-slate-700">Everyone has their own books.</strong>{" "}
            An admin can create accounts under{" "}
            <Link href="/users" className="text-brand hover:underline">
              People
            </Link>
            . Each person gets their own wallets, categories and ledger, and
            nobody can see anyone else&apos;s &mdash; admins included.
          </li>
          <li>
            <strong className="text-slate-700">When to withdraw.</strong> Each
            wallet shows what you spend from it per day over the last 30 days
            and roughly how many days that balance lasts. Set a{" "}
            <em>warn below</em> amount and the wallet flags itself as low.
          </li>
        </ul>
      </div>
    </div>
  );
}
