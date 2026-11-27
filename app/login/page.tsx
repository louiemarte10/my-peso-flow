import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { googleEnabled } from "@/lib/google";
import { signupEnabled } from "@/lib/config";
import LoginForm from "./LoginForm";

export const metadata = { title: "Sign in — myPesoFlow" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string;
    error?: string;
    created?: string;
    email?: string;
    timeout?: string;
  }>;
}) {
  // Already signed in? Skip straight to the dashboard.
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  const { next, error, created, email, timeout } = await searchParams;
  const safeNext =
    next && next.startsWith("/") && next !== "/login" ? next : "/dashboard";

  return (
    <LoginForm
      googleEnabled={googleEnabled()}
      signupEnabled={signupEnabled()}
      next={safeNext}
      errorCode={error ?? null}
      justCreated={created === "1"}
      timedOut={timeout === "1"}
      initialEmail={email ?? ""}
    />
  );
}
