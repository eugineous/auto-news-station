'use client';
/* eslint-disable @next/next/no-img-element */
import { cn } from "@/lib/utils";

type Props = React.ImgHTMLAttributes<HTMLImageElement> & {
  alt: string;
};

export function ImageWithFallback({ src, className, alt = "", ...rest }: Props) {
  return (
    <img
      {...rest}
      src={src}
      alt={alt}
      className={cn("object-cover", className)}
      loading="lazy"
    />
  );
}
