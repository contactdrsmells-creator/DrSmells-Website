import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function getSupabase() {
  return createClient(supabaseUrl, supabaseKey);
}

// GET: fetch order by order_number (public) or all orders (admin)
export async function GET(request: Request) {
  const url = new URL(request.url);
  const orderNumber = url.searchParams.get("order_number");

  const supabase = getSupabase();

  // Public: fetch single order by order number
  if (orderNumber) {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("order_number", orderNumber)
      .single();

    if (error || !data) {
      return Response.json({ order: null });
    }

    // Only return limited info publicly
    return Response.json({
      order: {
        order_number: data.order_number,
        status: data.status,
        payment_status: data.payment_status,
        total: data.total,
        shipping: { email: data.shipping?.email },
        created_at: data.created_at,
      },
    });
  }

  // Admin: fetch all orders
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token");
  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ orders: data || [] });
}

// POST: create test order (admin only) — for testing CRM integration
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token");
  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { customer_name, phone, email, product_name, variation, quantity, unit_price, address_line1, address_line2, city, state, postcode } = body;

    if (!customer_name || !phone || !email || !product_name) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    const qty = quantity || 1;
    const price = unit_price || 0;
    const total = qty * price;

    // Fetch next order ID from CRM
    let crmOrderNum = 0;
    try {
      const crmUrl = process.env.CRM_WEBHOOK_URL;
      if (crmUrl) {
        const crmBase = new URL(crmUrl).origin;
        const crmRes = await fetch(`${crmBase}/api/webhook/next-order-id`, {
          headers: { "x-webhook-secret": process.env.CRM_WEBHOOK_SECRET || "" },
        });
        if (crmRes.ok) {
          const crmData = await crmRes.json();
          crmOrderNum = crmData.next_id || 0;
        }
      }
    } catch {
      console.error("[Orders] Failed to fetch CRM next order ID");
    }

    const randomLetters = String.fromCharCode(
      65 + Math.floor(Math.random() * 26),
      65 + Math.floor(Math.random() * 26)
    );
    const orderNumber = crmOrderNum > 0
      ? `${crmOrderNum}W${randomLetters}`
      : `DS-${Date.now()}`;

    const orderData = {
      order_number: orderNumber,
      status: "paid",
      payment_method: "manual",
      payment_status: "paid",
      payment_reference: `TEST-${Date.now()}`,
      items: [
        {
          product_name,
          variation: variation || "Default",
          quantity: qty,
          unit_price: price,
          total_price: total,
        },
      ],
      shipping: {
        name: customer_name,
        email,
        phone,
        address_line1: address_line1 || "Test Address",
        address_line2: address_line2 || "",
        city: city || "Kuala Lumpur",
        state: state || "Kuala Lumpur",
        postcode: postcode || "50000",
        country: "Malaysia",
      },
      subtotal: total,
      shipping_cost: 0,
      total,
    };

    const supabase = getSupabase();
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert(orderData)
      .select()
      .single();

    if (orderError) {
      return Response.json({ error: orderError.message }, { status: 500 });
    }

    // Sync to CRM since this is a "paid" order
    const { syncOrderToCRM } = await import("@/lib/crm-sync");
    await syncOrderToCRM(orderNumber).catch((err: Error) =>
      console.error("[CRM Sync] Test order sync error:", err)
    );

    return Response.json({ success: true, order_number: orderNumber, crm_synced: true });
  } catch (err) {
    console.error("Test order creation error:", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}

// PUT: update order status (admin only)
export async function PUT(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token");
  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id, status, payment_status, notes } = await request.json();

    if (!id) {
      return Response.json({ error: "Order ID required" }, { status: 400 });
    }

    const supabase = getSupabase();
    const updateData: Record<string, string> = { updated_at: new Date().toISOString() };
    if (status) updateData.status = status;
    if (payment_status) updateData.payment_status = payment_status;
    if (notes !== undefined) updateData.notes = notes;

    const { error } = await supabase
      .from("orders")
      .update(updateData)
      .eq("id", id);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
