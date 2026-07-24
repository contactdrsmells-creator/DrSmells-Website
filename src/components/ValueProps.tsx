"use client";

import { Droplets, Rabbit, Stars, Leaf, ShieldCheck, Heart, Award, Globe } from "lucide-react";
import MalaysiaIcon from "./MalaysiaIcon";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number; style?: React.CSSProperties }>> = {
  droplets: Droplets,
  rabbit: Rabbit,
  stars: Stars,
  leaf: Leaf,
  shield: ShieldCheck,
  heart: Heart,
  award: Award,
  globe: Globe,
  malaysia: MalaysiaIcon as React.ComponentType<{ className?: string; strokeWidth?: number; style?: React.CSSProperties }>,
};

interface ValueProp {
  icon: string;
  title: string;
  subtitle: string;
  icon_url?: string;
  icon_size?: number;
}

const DEFAULT_PROPS: ValueProp[] = [
  { icon: "droplets", title: "Dermatologically Tested", subtitle: "Natural Formulated-Ingredients" },
  { icon: "rabbit", title: "Cruelty Free. Vegan Friendly", subtitle: "Nature" },
  { icon: "stars", title: "Trusted Review", subtitle: "Joyful Customers" },
  { icon: "malaysia", title: "Born in Malaysia", subtitle: "Product Crafted in Malaysia" },
];

export interface ValuePropsData {
  heading?: string;
  items?: ValueProp[];
}

interface Props {
  siteImages: Record<string, string>;
  productData?: ValuePropsData;
}

export default function ValueProps({ siteImages, productData }: Props) {
  // Per-product data takes priority over global siteImages
  let heading: string;
  let props: ValueProp[];

  if (productData?.items && productData.items.length > 0) {
    heading = productData.heading || "Simple \u00a0.\u00a0 Effective \u00a0.\u00a0 100hrs";
    props = productData.items;
  } else {
    heading = siteImages.value_props_heading || "Simple \\u00a0.\\u00a0 Effective \\u00a0.\\u00a0 100hrs";
    const propsRaw = siteImages.value_props;
    props = DEFAULT_PROPS;
    if (propsRaw) {
      try { props = JSON.parse(propsRaw); } catch {}
    }
  }

  return (
    <section className="py-8 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-center text-[22px] md:text-2xl lg:text-4xl font-bold text-olive mb-6 md:mb-12 italic">
          {heading.includes("\\u00a0") ? (
            <span dangerouslySetInnerHTML={{ __html: heading.replace(/\\u00a0/g, "&nbsp;") }} />
          ) : heading}
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8">
          {props.map((prop, idx) => {
            const IconComponent = ICON_MAP[prop.icon];
            const size = prop.icon_size || 40;
            const mobileSize = Math.min(size, 36);
            return (
              <div key={idx} className="text-center">
                {prop.icon_url ? (
                  <>
                    <img src={prop.icon_url} alt={prop.title} style={{ width: size, height: size }} className="mx-auto mb-3 object-contain hidden md:block" loading="lazy" />
                    <img src={prop.icon_url} alt={prop.title} style={{ width: mobileSize, height: mobileSize }} className="mx-auto mb-2 object-contain md:hidden" loading="lazy" />
                  </>
                ) : IconComponent ? (
                  <>
                    <IconComponent className="mx-auto text-olive mb-3 hidden md:block" style={{ width: size, height: size }} strokeWidth={1.5} />
                    <IconComponent className="mx-auto text-olive mb-2 md:hidden" style={{ width: mobileSize, height: mobileSize }} strokeWidth={1.5} />
                  </>
                ) : (
                  <div style={{ width: size, height: size }} className="mx-auto mb-3" />
                )}
                <h3 className="font-semibold text-olive text-base md:text-base">
                  {prop.title}
                </h3>
                <p className="text-xs md:text-sm text-olive/50 mt-0.5 md:mt-1">
                  {prop.subtitle}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
