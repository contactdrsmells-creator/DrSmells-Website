"use client";

import { Fragment, useEffect, useState } from "react";
import { RotateCcw, Truck } from "lucide-react";
import { defaultPolicies, withDefaults, type Policies } from "@/lib/policies";

/**
 * Shipping & Returns, edited under Admin → Site Settings.
 *
 * The wording is plain text: paragraphs split on blank lines, and a Malaysian
 * number written as 60… becomes a WhatsApp link. Nothing typed in the admin is
 * ever rendered as HTML.
 */

function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n\s*\n/).map((para, i) => (
        <p key={i} className="text-olive/70 leading-relaxed mb-4 whitespace-pre-line">
          {para.split(/(\b60\d{8,10}\b)/).map((piece, j) =>
            /^60\d{8,10}$/.test(piece) ? (
              <a key={j} href={`https://wa.me/${piece}`} target="_blank" rel="noopener noreferrer"
                className="font-medium text-olive underline underline-offset-2">
                {piece}
              </a>
            ) : (
              <Fragment key={j}>{piece}</Fragment>
            ),
          )}
        </p>
      ))}
    </>
  );
}

export default function ShippingReturnsPage() {
  const [policies, setPolicies] = useState<Policies>(defaultPolicies);

  useEffect(() => {
    fetch("/api/site-settings")
      .then((r) => r.json())
      .then((data) => setPolicies(withDefaults(data?.policies)))
      .catch(() => {});
  }, []);

  const sections = [
    { icon: RotateCcw, title: policies.returns_title, body: policies.returns_body },
    { icon: Truck, title: policies.shipping_title, body: policies.shipping_body },
  ];

  return (
    <div className="bg-white max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-16">
      <h1 className="text-3xl md:text-4xl font-bold text-olive mb-10">{policies.page_title}</h1>
      <div className="space-y-6">
        {sections.map((s) => (
          <section key={s.title} className="border border-olive/10 rounded-2xl p-6 md:p-8 bg-white/50">
            <div className="flex items-center gap-3 mb-4">
              <s.icon className="w-6 h-6 text-olive flex-shrink-0" />
              <h2 className="text-xl md:text-2xl font-semibold text-olive">{s.title}</h2>
            </div>
            <Paragraphs text={s.body} />
          </section>
        ))}
      </div>
    </div>
  );
}
