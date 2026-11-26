import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { signupEnabled } from "@/lib/config";
import SignupForm from "./SignupForm";

export const metadata = { title: "Create an account — myPesoFlow" };

export default async function SignupPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  if (!signupEnabled()) redirect("/login");

  return <SignupForm />;
}
