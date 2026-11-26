import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { googleEnabled } from "@/lib/google";
import LoginForm from "./LoginForm";

export const metadata = { title: "Sign in — myPesoFlow" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  // Already signed in? Skip straight to the dashboard.
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  const { next, error } = await searchParams;
  const safeNext =
    next && next.startsWith("/") && next !== "/login" ? next : "/dashboard";

  return (
    <LoginForm
      googleEnabled={googleEnabled()}
      next={safeNext}
      errorCode={error ?? null}
    />
  );
}
