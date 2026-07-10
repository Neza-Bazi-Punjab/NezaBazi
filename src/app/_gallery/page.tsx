import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = {
  title: "Gallery",
  description:
    "Photos from the Neza Bazi Punjab Championship — riders, horses and the roar of the crowd — land here after the championship on August 21, 2026.",
};

export default function GalleryPage() {
  return (
    <ComingSoon
      title="Gallery"
      description="Photography from the championship — riders at full gallop, the crowd and the prize ceremony — will be collected here."
      phaseNote="Photos go up after the championship on August 21, 2026."
    />
  );
}
