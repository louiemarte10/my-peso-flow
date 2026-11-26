import EntryManager from "@/components/EntryManager";

export const metadata = { title: "Expenses — myPesoFlow" };

export default function ExpensesPage() {
  return (
    <EntryManager
      kind="EXPENSE"
      title="Expenses"
      blurb="Encode every peso that went out — food, transport, bills, rent, padala. Pick the date you spent it, and your balance updates for that day, month and year."
      amountLabel="Amount spent"
      categoryLabel="Category"
    />
  );
}
