import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth";
import UsersClient from "./UsersClient";

export const metadata = { title: "People - myPesoFlow" };

/**
 * Admin-only. Hiding the sidebar link is presentation; this is the guard that
 * actually matters for someone typing /users straight into the address bar.
 * The /api/users routes check admin independently.
 */
export default async function UsersPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/dashboard");
  return <UsersClient />;
}
