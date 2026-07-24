"use client";

import { useEffect, useState } from "react";
import { FAQ } from "@/lib/types";
import { sampleFAQs } from "@/lib/sample-data";
import { supabase } from "@/lib/supabase/client";
import { ChevronDown } from "lucide-react";

export default function FAQPage() {
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const isConfigured =
        process.env.NEXT_PUBLIC_SUPABASE_URL !== "your_supabase_url_here" &&
        !!process.env.NEXT_PUBLIC_SUPABASE_URL;

      if (!isConfigured) {
        setFaqs(sampleFAQs);
        return;
      }

      const { data } = await supabase
        .from("faqs")
        .select("*")
        .eq("visible", true)
        .order("sort_order");
      setFaqs((data as FAQ[]) || []);
    }
    load();
  }, []);

  return (
    <div className="bg-white max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-16">
      <h1 className="text-3xl md:text-4xl font-bold text-olive mb-2">
        Frequently Asked Questions
      </h1>
      <p className="text-olive/60 mb-10">
        Everything you need to know about Dr.Smells
      </p>

      <div className="space-y-3">
        {faqs.map((faq) => (
          <div
            key={faq.id}
            className="border border-olive/10 rounded-xl overflow-hidden bg-white/50"
          >
            <button
              onClick={() => setOpenId(openId === faq.id ? null : faq.id)}
              className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-sage-light/50 transition-colors"
            >
              <span className="font-medium text-olive pr-4">
                {faq.question}
              </span>
              <ChevronDown
                className={`w-5 h-5 text-olive/40 flex-shrink-0 transition-transform ${
                  openId === faq.id ? "rotate-180" : ""
                }`}
              />
            </button>
            {openId === faq.id && (
              <div className="px-6 pb-4">
                <p className="text-olive/70 text-sm leading-relaxed">
                  {faq.answer}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
