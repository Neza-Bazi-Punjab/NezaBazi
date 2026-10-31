/* The administrator gate every /admin page shares: who is asking, and the
   "Login Required" / "Access Denied" page for anyone who is not an
   administrator. Pages only decide what to render with it; every route behind
   them checks the session again. */
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import SectionHeading from "@/components/SectionHeading";
import { createClient } from "@/lib/supabase/server";

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

export type AdminAccess =
  | { kind: "login" }
  | { kind: "denied" }
  | { kind: "admin"; userId: string; supabase: ServerSupabase };

export const getAdminAccess = async (): Promise<AdminAccess> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { kind: "login" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin") {
    return { kind: "denied" };
  }

  return { kind: "admin", userId: user.id, supabase };
};

const pageButton =
  "block w-full rounded-lg bg-bronze-deep px-6 py-3 text-center font-display text-sm font-semibold uppercase tracking-[0.15em] text-cream transition-colors hover:bg-bronze";

export function AdminAccessMessage({
  title,
  kind,
  redirect,
}: {
  title: string;
  kind: "login" | "denied";
  /* Where to come back to after logging in, e.g. "/admin/solo". */
  redirect: string;
}) {
  return (
    <>
      <PageHeader
        title={title}
        intro={
          kind === "login"
            ? "This page requires an administrator login."
            : "Registration data is available to administrators only."
        }
      />

      <section className="bg-cream">
        <div className="mx-auto max-w-xl px-6 py-16">
          <SectionHeading>{kind === "login" ? "Login Required" : "Access Denied"}</SectionHeading>

          <div className="mt-10 space-y-6">
            <p className="leading-7 text-brown/85">
              {kind === "login"
                ? "You must be logged in as an administrator to view this page."
                : "Access denied — this page is for administrators only."}
            </p>

            {kind === "login" ? (
              <Link href={`/login?redirect=${redirect}`} className={pageButton}>
                Log In
              </Link>
            ) : (
              <Link href="/" className={pageButton}>
                Back to Home
              </Link>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
