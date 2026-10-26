import type { Metadata } from "next";
import LowerThirdOverlay from "./LowerThirdOverlay";

export const metadata: Metadata = {
  title: "Lower third overlay",
};

export default function LowerThirdOverlayPage() {
  return <LowerThirdOverlay />;
}
