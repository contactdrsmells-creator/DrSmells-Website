"use client";

import Link from "next/link";
import { useState } from "react";
import { ShoppingBag, Menu, X, ChevronDown, User } from "lucide-react";
import { useCartStore } from "@/lib/cart-store";
import PromoButton from "./PromoButton";
import SearchBox from "./SearchBox";
import Cart from "./Cart";

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [shopDropdown, setShopDropdown] = useState(false);
  const [aboutDropdown, setAboutDropdown] = useState(false);
  const totalItems = useCartStore((s) => s.totalItems());
  const toggleCart = useCartStore((s) => s.toggleCart);
  const isCartOpen = useCartStore((s) => s.isOpen);

  // Close dropdowns when clicking outside
  const closeDropdowns = () => { setShopDropdown(false); setAboutDropdown(false); };

  const shopCategories = [
    { name: "All Products", href: "/shop" },
    { name: "Underarm", href: "/shop?category=underarm" },
    { name: "Mouth", href: "/shop?category=mouth" },
    { name: "Feet", href: "/shop?category=feet" },
    { name: "Bundle", href: "/shop?category=bundle" },
  ];

  const aboutLinks = [
    { name: "Our Story", href: "/about" },
    { name: "FAQs", href: "/faq" },
    { name: "Contact Us", href: "/contact" },
  ];

  return (
    <>
      <header className="sticky top-0 z-50 bg-white border-b border-olive/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 md:h-20">
            {/* Logo */}
            <Link href="/" className="flex-shrink-0">
              <span className="text-2xl md:text-3xl font-bold text-olive">
                Dr.Smells
              </span>
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-8">
              <div
                className="relative"
                onMouseEnter={() => setShopDropdown(true)}
                onMouseLeave={() => setShopDropdown(false)}
              >
                <button
                  onClick={() => { setShopDropdown(!shopDropdown); setAboutDropdown(false); }}
                  className="flex items-center gap-1 text-sm font-medium text-olive/80 hover:text-olive transition-colors"
                >
                  Shop <ChevronDown className="w-4 h-4" />
                </button>
                {shopDropdown && (
                  <div className="absolute top-full left-0 pt-2">
                    <div className="bg-white shadow-lg rounded-lg py-2 min-w-[160px] border border-olive/10">
                      {shopCategories.map((cat) => (
                        <Link
                          key={cat.href}
                          href={cat.href}
                          onClick={closeDropdowns}
                          className="block px-4 py-2 text-sm text-olive/80 hover:bg-pantone hover:text-olive transition-colors"
                        >
                          {cat.name}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div
                className="relative"
                onMouseEnter={() => setAboutDropdown(true)}
                onMouseLeave={() => setAboutDropdown(false)}
              >
                <button
                  onClick={() => { setAboutDropdown(!aboutDropdown); setShopDropdown(false); }}
                  className="flex items-center gap-1 text-sm font-medium text-olive/80 hover:text-olive transition-colors"
                >
                  About Us <ChevronDown className="w-4 h-4" />
                </button>
                {aboutDropdown && (
                  <div className="absolute top-full left-0 pt-2">
                    <div className="bg-white shadow-lg rounded-lg py-2 min-w-[160px] border border-olive/10">
                      {aboutLinks.map((link) => (
                        <Link
                          key={link.href}
                          href={link.href}
                          onClick={closeDropdowns}
                          className="block px-4 py-2 text-sm text-olive/80 hover:bg-pantone hover:text-olive transition-colors"
                        >
                          {link.name}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <Link
                href="/about#clinical"
                className="text-sm font-medium text-olive/80 hover:text-olive transition-colors"
              >
                Clinical Studies
              </Link>
            </nav>

            {/* Right side icons */}
            <div className="flex items-center gap-3 md:gap-4">
              {/* Left of the account icon on desktop. The account icon is
                  hidden on mobile, so this lands left of the cart there. */}
              <PromoButton />

              {/* Shown on mobile too, unlike the account icon: it is the only
                  way to reach a hidden product without its link. */}
              <SearchBox />

              <Link
                href="/account"
                className="hidden md:flex text-olive/60 hover:text-olive transition-colors"
              >
                <User className="w-5 h-5" />
              </Link>

              <button
                onClick={toggleCart}
                className="relative text-olive/80 hover:text-olive transition-colors"
              >
                <ShoppingBag className="w-6 h-6" />
                {totalItems > 0 && (
                  <span className="absolute -top-2 -right-2 bg-olive text-cream text-xs w-5 h-5 flex items-center justify-center rounded-full">
                    {totalItems}
                  </span>
                )}
              </button>

              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="md:hidden text-olive"
              >
                {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileOpen && (
          <div className="md:hidden bg-white border-t border-olive/10">
            <div className="px-4 py-4 space-y-3">
              <p className="text-xs font-semibold text-olive/40 uppercase">Shop</p>
              {shopCategories.map((cat) => (
                <Link
                  key={cat.href}
                  href={cat.href}
                  onClick={() => setMobileOpen(false)}
                  className="block pl-2 text-sm text-olive/80 hover:text-olive"
                >
                  {cat.name}
                </Link>
              ))}
              <hr className="border-olive/10" />
              <p className="text-xs font-semibold text-olive/40 uppercase">About</p>
              {aboutLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="block pl-2 text-sm text-olive/80 hover:text-olive"
                >
                  {link.name}
                </Link>
              ))}
              <hr className="border-olive/10" />
              <Link
                href="/account"
                onClick={() => setMobileOpen(false)}
                className="block text-sm text-olive/80 hover:text-olive"
              >
                My Account
              </Link>
            </div>
          </div>
        )}
      </header>

      {isCartOpen && <Cart />}
    </>
  );
}
