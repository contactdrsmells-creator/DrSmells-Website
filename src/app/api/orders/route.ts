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
