"use client";

import { useState } from "react";
import { Mail, Phone, MapPin, Send } from "lucide-react";

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [submitted, setSubmitted] = useState(false);

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
                  <p className="text-olive/60 text-sm">info@drsmells.com.my</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-olive/10 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Phone className="w-5 h-5 text-olive" />
                </div>
                <div>
                  <p className="font-semibold text-olive">WhatsApp</p>
                  <p className="text-olive/60 text-sm">
                    Contact us via WhatsApp for quick support
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-olive/10 rounded-xl flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-5 h-5 text-olive" />
                </div>
                <div>
                  <p className="font-semibold text-olive">Location</p>
                  <p className="text-olive/60 text-sm">Malaysia</p>
                </div>
              </div>
            </div>

            <div className="mt-10 p-6 bg-sage-light rounded-2xl">
              <h3 className="font-semibold text-olive mb-2">
                Business Hours
              </h3>
              <p className="text-sm text-olive/60">
                Monday - Friday: 9:00 AM - 6:00 PM
              </p>
              <p className="text-sm text-olive/60">
                Saturday: 9:00 AM - 1:00 PM
              </p>
              <p className="text-sm text-olive/60">Sunday: Closed</p>
            </div>
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
