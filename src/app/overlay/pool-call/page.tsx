import type { Metadata } from "next";
import PoolCallOverlay from "./PoolCallOverlay";

export const metadata: Metadata = {
  title: "Pool call-up overlay",
};

export default function PoolCallOverlayPage() {
  return <PoolCallOverlay />;
}
