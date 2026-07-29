"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface BrandSettings {
  name: string;
  tagline: string;
  mission: string;
  company: string;
}

const defaults: BrandSettings = {
  name: "Dr.Smells",
  tagline: "Simple . Effective . 100hrs",
  mission: "Your skin, our mission - smell like you",
  company: "LIFE BIO LAB SDN. BHD (1452572-P)",
};

export default function Footer() {
  const [brand, setBrand] = useState<BrandSettings>(defaults);

  useEffect(() => {
    fetch("/api/site-settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.brand) {
          setBrand({ ...defaults, ...data.brand });
        }
      })
      .catch(() => {});
  }, []);

  return (
    <footer className="bg-pantone text-olive">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Brand - mobile only (above columns) */}
        <div className="mb-8 md:hidden">
          <h3 className="text-2xl font-bold text-olive">{brand.name}</h3>
          <p className="mt-2 text-sm text-olive/60">{brand.tagline}</p>
          <p className="mt-3 text-xs text-olive/40">{brand.mission}</p>
        </div>

        <div className="grid grid-cols-3 md:grid-cols-4 gap-4 md:gap-8">
          {/* Brand - desktop only */}
          <div className="hidden md:block">
            <h3 className="text-2xl font-bold text-olive">{brand.name}</h3>
            <p className="mt-2 text-sm text-olive/60">{brand.tagline}</p>
            <p className="mt-4 text-xs text-olive/40">{brand.mission}</p>
          </div>

          {/* Shop */}
          <div>
            <h4 className="font-semibold text-olive mb-3">Shop</h4>
            <ul className="space-y-2 text-sm text-olive/60">
              <li><Link href="/shop?category=underarm" className="hover:text-olive transition-colors">Underarm</Link></li>
              <li><Link href="/shop?category=mouth" className="hover:text-olive transition-colors">Mouth</Link></li>
              <li><Link href="/shop?category=feet" className="hover:text-olive transition-colors">Feet</Link></li>
              <li><Link href="/shop?category=bundle" className="hover:text-olive transition-colors">Bundle</Link></li>
            </ul>
          </div>

          {/* About */}
          <div>
            <h4 className="font-semibold text-olive mb-3">About</h4>
            <ul className="space-y-2 text-sm text-olive/60">
              <li><Link href="/about" className="hover:text-olive transition-colors">Our Story</Link></li>
              <li><Link href="/faq" className="hover:text-olive transition-colors">FAQs</Link></li>
              <li><Link href="/contact" className="hover:text-olive transition-colors">Contact Us</Link></li>
            </ul>
          </div>

          {/* Help */}
          <div>
            <h4 className="font-semibold text-olive mb-3">Help</h4>
            <ul className="space-y-2 text-sm text-olive/60">
              {/* Customer Support removed — it pointed at /contact, which is
                  already linked as "Contact Us" under About. Admin Login
                  removed: no reason to advertise the admin panel to shoppers. */}
              <li><Link href="/faq" className="hover:text-olive transition-colors">Shipping & Returns</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-8 border-t border-olive/10 text-center text-xs text-olive/40">
          <p>&copy; {new Date().getFullYear()} {brand.company}. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
