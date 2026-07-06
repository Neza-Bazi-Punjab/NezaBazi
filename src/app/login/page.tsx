import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = {
  title: "Login",
  description: "Player login for the Neza Bazi Punjab Championship 2026.",
};

export default function LoginPage() {
  return (
    <ComingSoon
      title="Player Login"
      description="Registered riders will sign in here to manage their profile, horses and event entries."
      phaseNote="Player accounts open together with online registration."
    />
  );
}
