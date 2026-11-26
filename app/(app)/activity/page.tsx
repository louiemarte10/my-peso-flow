import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth";
import ActivityClient from "./ActivityClient";

export const metadata = { title: "Activity - myPesoFlow" };

/** Admin only: the record of who did what. */
export default async function ActivityPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/dashboard");
  return <ActivityClient />;
}
