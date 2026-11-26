import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth";
import UserOverviewClient from "./UserOverviewClient";

export const metadata = { title: "Person - myPesoFlow" };

/** Admin-only, like the People list it is reached from. */
export default async function UserOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/dashboard");

  const { id } = await params;
  return <UserOverviewClient userId={id} />;
}
