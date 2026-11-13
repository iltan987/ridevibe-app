import Image, { type StaticImageData } from "next/image";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Phone: eyebrow, title, text, photo stacked. md+: two columns, the photo on `photoSide`.
export function PhotoSection({
  eyebrow,
  title,
  photo,
  alt,
  photoSide,
  children,
}: {
  eyebrow: string;
  title: string;
  photo: StaticImageData;
  alt: string;
  photoSide: "left" | "right";
  children: ReactNode;
}) {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 pt-7 md:pt-18">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:gap-12">
        <div className={cn("flex flex-col gap-4 md:w-1/2", photoSide === "left" && "md:order-2")}>
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="heading text-3xl text-balance md:text-4xl">{title}</h2>
          {children}
        </div>
        <div className="md:w-1/2">
          <Image
            src={photo}
            alt={alt}
            sizes="(min-width: 768px) 50vw, 100vw"
            placeholder="blur"
            className="h-auto w-full rounded-2xl"
          />
        </div>
      </div>
    </section>
  );
}
