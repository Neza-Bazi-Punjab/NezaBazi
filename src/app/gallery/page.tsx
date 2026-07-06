import type { Metadata } from "next";
import ImagePlaceholder from "@/components/ImagePlaceholder";
import PageHeader from "@/components/PageHeader";

export const metadata: Metadata = {
  title: "Gallery",
  description:
    "Photos from Neza Bazi — riders, horses and the roar of the crowd.",
};

const slots = [
  { name: "gallery-01.jpg", label: "Full gallop charge", tall: true },
  { name: "gallery-02.jpg", label: "Peg strike close-up" },
  { name: "gallery-03.jpg", label: "Riders' parade" },
  { name: "gallery-04.jpg", label: "Arena under lights", tall: true },
  { name: "gallery-05.jpg", label: "Traditional dress" },
  { name: "gallery-06.jpg", label: "Crowd celebration" },
  { name: "gallery-07.jpg", label: "Horse & rider portrait", tall: true },
  { name: "gallery-08.jpg", label: "Prize ceremony" },
  { name: "gallery-09.jpg", label: "Sunset training run" },
];

export default function GalleryPage() {
  return (
    <>
      <PageHeader
        title="Gallery"
        intro="Moments of courage and glory. Photography from the championship will appear here — check back after the event."
      />
      <section className="bg-cream">
        <div className="mx-auto max-w-6xl columns-1 gap-6 space-y-6 px-6 py-16 sm:columns-2 lg:columns-3">
          {slots.map((slot) => (
            <ImagePlaceholder
              key={slot.name}
              name={slot.name}
              label={slot.label}
              className={`break-inside-avoid ${slot.tall ? "aspect-[3/4]" : "aspect-[4/3]"}`}
            />
          ))}
        </div>
      </section>
    </>
  );
}
