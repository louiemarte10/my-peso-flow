import { redirect } from "next/navigation";
import { getCurrentUserRecord } from "@/lib/auth";
import AppShell from "@/components/AppShell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Read the role from the database rather than the cookie, so a promotion or
  // a disabled account takes effect on the very next page load.
  const user = await getCurrentUserRecord();
  if (!user) redirect("/login");

  return (
    <AppShell
      user={{
        name: user.name,
        email: user.email,
        image: user.imageUrl,
        role: user.role,
      }}
    >
      {children}
    </AppShell>
  );
}
