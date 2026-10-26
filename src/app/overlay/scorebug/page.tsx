import type { Metadata } from "next";
import ScorebugOverlay from "./ScorebugOverlay";

export const metadata: Metadata = {
  title: "Scorebug overlay",
};

export default function ScorebugOverlayPage() {
  return <ScorebugOverlay />;
}
