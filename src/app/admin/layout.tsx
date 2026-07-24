"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Package,
  ImageIcon,
  MessageSquare,
  Settings,
  Star,
  HelpCircle,
  ArrowLeft,
  LogOut,
  Upload,
  ShoppingCart,
  CreditCard,
  MessageCircle,
} from "lucide-react";

const navItems = [
  { href: "/admin", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/admin/products", icon: Package, label: "Products" },
  { href: "/admin/images", icon: ImageIcon, label: "Site Images" },
  { href: "/admin/reviews", icon: MessageCircle, label: "Reviews" },
  { href: "/admin/orders", icon: ShoppingCart, label: "Orders" },
  { href: "/admin/payment", icon: CreditCard, label: "Payment" },
  { href: "/admin/settings", icon: Settings, label: "Site Settings" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    // Skip auth check on login page
    if (pathname === "/admin/login") {
      setAuthenticated(false);
      return;
    }

    fetch("/api/auth")
      .then((res) => res.json())
      .then((data) => {
        if (!data.authenticated) {
          router.push("/admin/login");
        } else {
          setAuthenticated(true);
        }
      })
      .catch(() => router.push("/admin/login"));
  }, [pathname, router]);

  // Show login page without sidebar
  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  // Loading state
  if (authenticated === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-olive/50">Loading...</div>
      </div>
    );
  }

  if (!authenticated) return null;

  async function handleLogout() {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/admin/login");
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 hidden md:flex flex-col">
        <div className="p-6 border-b">
          <h2 className="text-xl font-bold text-olive">Admin Panel</h2>
          <p className="text-xs text-olive/50 mt-1">Dr.Smells Management</p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/admin" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-olive text-white"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t space-y-2">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-olive transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Website
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-red-400 hover:text-red-600 transition-colors w-full"
          >
            <LogOut className="w-4 h-4" />
            Log Out
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="md:hidden fixed top-16 left-0 right-0 z-40 bg-white border-b overflow-x-auto">
        <div className="flex gap-1 p-2">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/admin" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? "bg-olive text-white"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                <item.icon className="w-3.5 h-3.5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-8 mt-12 md:mt-0">{children}</main>
    </div>
  );
}
