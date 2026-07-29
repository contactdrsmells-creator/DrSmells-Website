import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ImageProtection from "@/components/ImageProtection";
import MetaPixel from "@/components/MetaPixel";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dr.Smells - Natural Odour Solutions",
  description:
    "Dermatologically tested, natural odour solutions. Simple. Effective. 100hrs. Made in Malaysia.",
  keywords: "deodorant, anti-odour, natural, cruelty-free, vegan, Malaysia, Dr Smells",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <MetaPixel />
        <ImageProtection />
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
