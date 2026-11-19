import type { Metadata } from "next";
import Link from "next/link";
import ResendConfirmation from "@/components/ResendConfirmation";
import PageTop from "@/components/redesign/PageTop";
import f from "@/components/redesign/forms.module.css";
import s from "@/components/redesign/shared.module.css";
import { getPostSignupRedirect } from "@/lib/safe-redirect";

export const metadata: Metadata = {
  title: "Confirm Your Email",
  description: "Check your inbox to confirm your account.",
};

type SignupSuccessPageProps = {
  searchParams: Promise<{ redirect?: string }>;
};

export default async function SignupSuccessPage({ searchParams }: SignupSuccessPageProps) {
  const { redirect } = await searchParams;
  const loginHref = `/login?redirect=${encodeURIComponent(
    getPostSignupRedirect(redirect ?? null),
  )}`;

  return (
    <div className={`${s.page} ${f.forms}`}>
      <PageTop
        small
        title="Confirm Your Email"
        lead="Your account is almost ready, one quick step to go."
      />

      <section className={f.band}>
        <div className={s.wrap}>
          <div className={`${f.col} ${f.box} ${f.stack}`}>
            <div className={f.text}>
              <p>
                We&apos;ve sent a confirmation link to your email address. Click the
                link to activate your account, then log in.
              </p>
              <p className={f.muted}>
                Can&apos;t find it? Check your spam folder. The email comes from the
                Neza Bazi Punjab Championship.
              </p>
              <p className={f.muted}>
                {`If you have signed up with this address before, no new email is sent. Use the resend button below, or log in if your account is already confirmed.`}
              </p>
            </div>

            <div className={f.panel}>
              <ResendConfirmation />
            </div>

            <Link href={loginHref} className={`${s.btn} ${s.primary} ${f.block} ${f.primaryHover}`}>
              Go to Login
            </Link>

            <p className={f.small}>
              Want to return later?{" "}
              <Link href="/" className={f.link}>
                Back to home
              </Link>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
