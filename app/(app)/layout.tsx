import { redirect } from "next/navigation";
import { getCurrentUserRecord } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import SessionWatchdog from "@/components/SessionWatchdog";

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
    <>
      {/* Ends an idle session on time instead of leaving a dead page open. */}
      <SessionWatchdog />
      {user.impersonatedBy && (
        <ImpersonationBanner
          actingAs={{ name: user.name, email: user.email }}
          admin={{
            name: user.impersonatedBy.name,
            email: user.impersonatedBy.email,
          }}
        />
      )}
      <AppShell
        user={{
          name: user.name,
          email: user.email,
          image: user.imageUrl,
          // An impersonated session never gets the admin menu.
          role: user.impersonatedBy ? "USER" : user.role,
        }}
      >
        {children}
      </AppShell>
    </>
  );
}
