import type { Metadata } from "next";
import Link from "next/link";
import PageTop from "@/components/redesign/PageTop";
import f from "@/components/redesign/forms.module.css";
import s from "@/components/redesign/shared.module.css";

export const metadata: Metadata = {
  title: "Link Expired",
  description: "This authentication link is invalid or has expired.",
};

export default function AuthCodeErrorPage() {
  return (
    <div className={`${s.page} ${f.forms}`}>
      <PageTop
        small
        title="Link Expired"
        lead="This link is invalid or has already been used."
      />

      <section className={f.band}>
        <div className={s.wrap}>
          <div className={`${f.col} ${f.box} ${f.stack}`}>
            <div className={f.text}>
              <p>
                Confirmation and reset links can only be used once and expire after a
                short time. Please request a new one.
              </p>
            </div>

            <Link href="/login" className={`${s.btn} ${s.primary} ${f.block} ${f.primaryHover}`}>
              Go to Login
            </Link>
            <p className={f.small}>
              <Link href="/forgot-password" className={f.link}>
                Reset your password
              </Link>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
