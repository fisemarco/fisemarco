import Image from "next/image";

// The supplied artwork is embedded unchanged; its SVG viewport frames the mark.
export default function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <Image
      className="ftai-logo"
      src="/ftai-logo.svg"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      unoptimized
    />
  );
}
