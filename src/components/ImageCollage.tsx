"use client";

import { useState } from "react";

function CollageImage({ src, alt, className }: { src: string; alt: string; className: string }) {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div className={`${className} flex items-center justify-center`}>
        <span className="text-olive/30 text-xs">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className="w-full h-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}

interface CollageImages {
  product?: string;
  face?: string;
  skin?: string;
  shoulder?: string;
}

export default function ImageCollage({ images = {} }: { images?: CollageImages }) {
  const productSrc = images.product || "/images/collage-product.jpg";
  const faceSrc = images.face || "/images/collage-face.jpg";
  const skinSrc = images.skin || "/images/collage-skin.jpg";
  const shoulderSrc = images.shoulder || "/images/collage-shoulder.jpg";

  return (
    <div className="relative h-[500px] md:h-[600px]">
      {/* Main large image - product */}
      <div className="absolute left-0 bottom-0 w-[55%] h-[75%] rounded-2xl overflow-hidden shadow-lg bg-pantone">
        <CollageImage src={productSrc} alt="Product Image" className="w-full h-full bg-pantone" />
      </div>
      {/* Top right - face */}
      <div className="absolute right-0 top-[5%] w-[48%] h-[45%] rounded-2xl overflow-hidden shadow-lg bg-gray-100">
        <CollageImage src={faceSrc} alt="Model Image" className="w-full h-full bg-gray-100" />
      </div>
      {/* Bottom right - skin */}
      <div className="absolute right-0 bottom-[5%] w-[40%] h-[35%] rounded-2xl overflow-hidden shadow-lg bg-gray-100">
        <CollageImage src={skinSrc} alt="Skin Image" className="w-full h-full bg-gray-100" />
      </div>
      {/* Top center small - shoulder */}
      <div className="absolute left-[20%] top-0 w-[30%] h-[25%] rounded-2xl overflow-hidden shadow-lg bg-gray-100">
        <CollageImage src={shoulderSrc} alt="Image" className="w-full h-full bg-gray-100" />
      </div>
    </div>
  );
}
