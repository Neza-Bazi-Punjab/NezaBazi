import type { Metadata } from "next";
import TickerOverlay from "./TickerOverlay";

export const metadata: Metadata = {
  title: "Ticker overlay",
};

export default function TickerOverlayPage() {
  return <TickerOverlay />;
}
