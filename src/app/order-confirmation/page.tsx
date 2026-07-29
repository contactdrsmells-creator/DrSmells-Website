"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Order } from "@/lib/types";
import { trackPurchase } from "@/components/MetaPixel";

function OrderConfirmationContent() {
  const searchParams = useSearchParams();
  const orderNumber = searchParams.get("order");
  const error = searchParams.get("error");
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  const sessionId = searchParams.get("session_id");

  useEffect(() => {
    if (!orderNumber) {
      setLoading(false);
      return;
    }

    async function load() {
      if (sessionId) {
        await fetch("/api/verify-stripe-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId, order_number: orderNumber }),
        }).catch(() => {});
      }

      const res = await fetch(`/api/orders?order_number=${orderNumber}`);
      const data = await res.json();
      if (data.order) {
        setOrder(data.order);

        // Report the sale to Meta only once payment is actually confirmed —
        // firing on page load alone would count abandoned and failed payments
        // as revenue.
        if (data.order.payment_status === "paid") {
          trackPurchase(data.order.order_number, data.order.total, data.order.items || []);
        }
      }
      setLoading(false);
    }

    load();
  }, [orderNumber, sessionId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-olive" />
      </div>
    );
  }

  if (error || !orderNumber) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4">
        <XCircle className="w-16 h-16 text-red-400 mb-4" />
        <h1 className="text-2xl font-bold text-olive mb-2">Payment Issue</h1>
        <p className="text-olive/60 mb-6 text-center">
          {error === "invalid_hash"
            ? "Payment verification failed. Please contact support."
            : "There was a problem with your order. Please try again."}
        </p>
        <Link href="/shop" className="px-6 py-3 bg-olive text-cream rounded-lg font-semibold hover:bg-sage-dark transition-colors">
          Back to Shop
        </Link>
      </div>
    );
  }

  const isPaid = order?.payment_status === "paid";

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        {isPaid ? (
          <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-6" />
        ) : (
          <Loader2 className="w-20 h-20 text-olive/40 mx-auto mb-6 animate-spin" />
        )}

        <h1 className="text-3xl font-bold text-olive mb-2">
          {isPaid ? "Thank You!" : "Order Received"}
        </h1>
        <p className="text-olive/60 mb-8">
          {isPaid
            ? "Your payment has been confirmed. We'll process your order shortly."
            : "Your order has been placed. We're waiting for payment confirmation."}
        </p>

        <div className="bg-gray-50 rounded-xl p-6 text-left mb-8">
          <div className="flex justify-between mb-3">
            <span className="text-sm text-olive/60">Order Number</span>
            <span className="text-sm font-semibold text-olive">{orderNumber}</span>
          </div>
          {order && (
            <>
              <div className="flex justify-between mb-3">
                <span className="text-sm text-olive/60">Status</span>
                <span className={`text-sm font-semibold ${isPaid ? "text-green-600" : "text-yellow-600"}`}>
                  {isPaid ? "Paid" : "Pending"}
                </span>
              </div>
              <div className="flex justify-between mb-3">
                <span className="text-sm text-olive/60">Total</span>
                <span className="text-sm font-semibold text-olive">RM {Number(order.total).toFixed(2)}</span>
              </div>
              {order.shipping?.email && (
                <div className="flex justify-between">
                  <span className="text-sm text-olive/60">Confirmation sent to</span>
                  <span className="text-sm text-olive">{order.shipping.email}</span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex gap-4 justify-center">
          <Link href="/shop" className="px-6 py-3 border-2 border-olive text-olive rounded-lg font-semibold hover:bg-olive hover:text-cream transition-colors">
            Continue Shopping
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function OrderConfirmationPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-olive" />
      </div>
    }>
      <OrderConfirmationContent />
    </Suspense>
  );
}
