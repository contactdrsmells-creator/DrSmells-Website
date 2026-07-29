"use client";

import { useState, useEffect } from "react";
import { Mail, Phone, MapPin, Send } from "lucide-react";

interface SiteSettings {
  contact?: { email?: string; phone?: string; whatsapp?: string; address?: string };
  social?: { facebook?: string; instagram?: string; tiktok?: string; whatsapp?: string };
}

/** Brand icons — lucide-react no longer ships these. */
const SOCIAL_ICONS: Record<string, React.ReactNode> = {
  facebook: (
    <path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.3v7A10 10 0 0 0 22 12Z" />
  ),
  instagram: (
    <path d="M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1-.4-2.2-.1-1.3-.1-1.7-.1-4.9s0-3.6.1-4.9c.1-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.4 2.2-.4 1.3-.1 1.7-.1 4.9-.1Zm0 3.4A6.4 6.4 0 1 0 18.4 12 6.4 6.4 0 0 0 12 5.6Zm0 10.5A4.1 4.1 0 1 1 16.1 12 4.1 4.1 0 0 1 12 16.1Zm6.7-10.7a1.5 1.5 0 1 0 1.5 1.5 1.5 1.5 0 0 0-1.5-1.5Z" />
  ),
  tiktok: (
    <path d="M16.6 5.8a4.8 4.8 0 0 1-1-2.8h-3v11.7a2.5 2.5 0 1 1-1.8-2.4V9.2a5.5 5.5 0 1 0 4.8 5.5V9.4a7.9 7.9 0 0 0 4.6 1.5V7.9a4.7 4.7 0 0 1-3.6-2.1Z" />
  ),
  whatsapp: (
    <path d="M17.5 14.4c-.3-.2-1.7-.9-2-1-.3-.1-.5-.1-.6.1-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1a8 8 0 0 1-2.4-1.5 9 9 0 0 1-1.6-2c-.2-.3 0-.5.1-.6l.5-.5.3-.5v-.5l-.9-2.1c-.2-.5-.4-.5-.6-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.2.2 2.1 3.2 5.1 4.4.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.7-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.2-.3-.2-.6-.4ZM12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3.1.8.8-3-.2-.3A8.2 8.2 0 1 1 12 20.2Z" />
  ),
};

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [submitted, setSubmitted] = useState(false);
  const [settings, setSettings] = useState<SiteSettings>({});

  // Pulled from Site Settings rather than hardcoded, so the details here can be
  // updated from admin without a deploy — and can't drift out of sync with the
  // footer the way the old placeholder values had.
  useEffect(() => {
    fetch("/api/site-settings")
      .then((r) => r.json())
      .then((data) => setSettings(data || {}))
      .catch(() => {});
  }, []);

  const contact = settings.contact || {};
  const social = settings.social || {};

  // Prefer the ready-made link from settings; otherwise build one from the number.
  const whatsappNumber = (contact.whatsapp || contact.phone || "").replace(/\D/g, "");
  const whatsappLink = social.whatsapp || (whatsappNumber ? `https://wa.me/${whatsappNumber}` : "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="bg-white max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-16">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl md:text-4xl font-bold text-olive mb-2">
          Contact Us
        </h1>
        <p className="text-olive/60 mb-10">
          Have questions? We&apos;d love to hear from you.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          {/* Contact Info */}
          <div>
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-olive/10 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Mail className="w-5 h-5 text-olive" />
                </div>
                <div>
                  <p className="font-semibold text-olive">Email</p>
                  {contact.email ? (
                    <a href={`mailto:${contact.email}`} className="text-olive/60 text-sm hover:text-olive transition-colors break-all">
                      {contact.email}
                    </a>
                  ) : (
                    <p className="text-olive/60 text-sm">&mdash;</p>
                  )}
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-olive/10 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Phone className="w-5 h-5 text-olive" />
                </div>
                <div>
                  <p className="font-semibold text-olive">WhatsApp</p>
                  {whatsappLink ? (
                    <a
                      href={whatsappLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-olive/60 text-sm hover:text-olive transition-colors"
                    >
                      {contact.whatsapp || contact.phone}
                    </a>
                  ) : (
                    <p className="text-olive/60 text-sm">&mdash;</p>
                  )}
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-olive/10 rounded-xl flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-5 h-5 text-olive" />
                </div>
                <div>
                  <p className="font-semibold text-olive">Location</p>
                  <p className="text-olive/60 text-sm">{contact.address || "Malaysia"}</p>
                </div>
              </div>
            </div>

            {/* Social links — only those actually set in Site Settings */}
            {(social.facebook || social.instagram || social.tiktok || whatsappLink) && (
              <div className="mt-8">
                <p className="font-semibold text-olive mb-3">Follow Us</p>
                <div className="flex items-center gap-3">
                  {(["facebook", "instagram", "tiktok", "whatsapp"] as const).map((key) => {
                    // WhatsApp falls back to a wa.me link built from the contact
                    // number if no explicit link is saved in Site Settings.
                    const href = key === "whatsapp" ? social.whatsapp || whatsappLink : social[key];
                    return href ? (
                      <a
                        key={key}
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={key}
                        className="w-10 h-10 bg-olive/10 rounded-xl flex items-center justify-center text-olive hover:bg-olive hover:text-cream transition-colors"
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                          {SOCIAL_ICONS[key]}
                        </svg>
                      </a>
                    ) : null;
                  })}
                </div>
              </div>
            )}

          </div>

          {/* Contact Form */}
          <div>
            {submitted ? (
              <div className="bg-sage-light border border-olive/10 rounded-2xl p-8 text-center">
                <div className="w-14 h-14 bg-olive/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Send className="w-6 h-6 text-olive" />
                </div>
                <h3 className="text-lg font-semibold text-olive mb-2">
                  Message Sent!
                </h3>
                <p className="text-olive/70 text-sm">
                  Thank you for reaching out. We&apos;ll get back to you
                  shortly.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-olive mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) =>
                      setForm({ ...form, name: e.target.value })
                    }
                    className="w-full px-4 py-3 border border-olive/20 rounded-xl bg-white/50 focus:outline-none focus:ring-2 focus:ring-olive/30 focus:border-olive text-olive"
                    placeholder="Your name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-olive mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) =>
                      setForm({ ...form, email: e.target.value })
                    }
                    className="w-full px-4 py-3 border border-olive/20 rounded-xl bg-white/50 focus:outline-none focus:ring-2 focus:ring-olive/30 focus:border-olive text-olive"
                    placeholder="your@email.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-olive mb-1">
                    Message
                  </label>
                  <textarea
                    required
                    rows={5}
                    value={form.message}
                    onChange={(e) =>
                      setForm({ ...form, message: e.target.value })
                    }
                    className="w-full px-4 py-3 border border-olive/20 rounded-xl bg-white/50 focus:outline-none focus:ring-2 focus:ring-olive/30 focus:border-olive resize-none text-olive"
                    placeholder="How can we help you?"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-3 bg-olive text-cream font-semibold rounded-xl hover:bg-sage-dark transition-colors"
                >
                  Send Message
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
