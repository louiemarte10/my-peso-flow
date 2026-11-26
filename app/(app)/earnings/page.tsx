import EntryManager from "@/components/EntryManager";

export const metadata = { title: "Earnings — myPesoFlow" };

export default function EarningsPage() {
  return (
    <EntryManager
      kind="EARNING"
      title="Earnings"
      blurb="Encode every peso that came in — salary, freelance, business, bonus. Pick the date it was actually received, and it will flow into your dashboard for that day, month and year."
      amountLabel="Amount received"
      categoryLabel="Source"
    />
  );
}
