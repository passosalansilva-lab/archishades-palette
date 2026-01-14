import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, apikey",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { orderId, driverId, companyId } = await req.json();

    if (!orderId || !driverId || !companyId) {
      return new Response(
        JSON.stringify({ error: "orderId, driverId e companyId são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    /* ===============================
       VALIDAR EMPRESA
    =============================== */
    const { data: company } = await supabase
      .from("companies")
      .select("id")
      .eq("id", companyId)
      .maybeSingle();

    if (!company) {
      return new Response(
        JSON.stringify({ error: "Empresa não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    /* ===============================
       VALIDAR ENTREGADOR
    =============================== */
    const { data: driver } = await supabase
      .from("delivery_drivers")
      .select("id, is_active, is_available, driver_status, user_id, driver_name")
      .eq("id", driverId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (!driver) {
      return new Response(
        JSON.stringify({ error: "Entregador não encontrado", code: "DRIVER_NOT_FOUND" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!driver.is_active) {
      return new Response(
        JSON.stringify({
          error: "Entregador inativo",
          code: "DRIVER_INACTIVE",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const driverIsBusy =
      driver.driver_status === "in_delivery" || !driver.is_available;

    /* ===============================
       CARREGAR PEDIDO
    =============================== */
    const { data: order } = await supabase
      .from("orders")
      .select("id, status, delivery_driver_id")
      .eq("id", orderId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (!order) {
      return new Response(
        JSON.stringify({ error: "Pedido não encontrado", code: "ORDER_NOT_FOUND" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!["ready", "awaiting_driver", "queued"].includes(order.status)) {
      return new Response(
        JSON.stringify({
          error: "Status inválido para atribuição",
          code: "INVALID_STATUS",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    /* ===============================
       CANCELAR OFERTAS PENDENTES
    =============================== */
    await supabase
      .from("order_offers")
      .update({ status: "cancelled", responded_at: new Date().toISOString() })
      .eq("order_id", orderId)
      .eq("status", "pending");

    /* ===============================
       FILA / STATUS
    =============================== */
    let newStatus = "awaiting_driver";
    let queuePosition: number | null = null;
    let queued = false;

    if (driverIsBusy) {
      // Driver is busy - add to queue instead of blocking
      const { data: lastQueue } = await supabase
        .from("orders")
        .select("queue_position")
        .eq("delivery_driver_id", driverId)
        .eq("status", "queued")
        .order("queue_position", { ascending: false, nullsFirst: false })
        .limit(1);

      const lastPos = lastQueue?.[0]?.queue_position;
      queuePosition = (typeof lastPos === 'number' && !isNaN(lastPos) ? lastPos : 0) + 1;
      newStatus = "queued"; // Mark as queued, not awaiting_driver
      queued = true;
    }

    /* ===============================
       ATUALIZAR PEDIDO
    =============================== */
    await supabase
      .from("orders")
      .update({
        delivery_driver_id: driverId,
        status: newStatus,
        queue_position: queuePosition,
      })
      .eq("id", orderId);

    /* ===============================
       LIBERAR ENTREGADOR ANTERIOR
    =============================== */
    if (order.delivery_driver_id && order.delivery_driver_id !== driverId) {
      await supabase
        .from("delivery_drivers")
        .update({ driver_status: "available", is_available: true })
        .eq("id", order.delivery_driver_id);
    }

    /* ===============================
       BLOQUEAR NOVO ENTREGADOR
    =============================== */
    if (!driverIsBusy) {
      await supabase
        .from("delivery_drivers")
        .update({
          driver_status: "pending_acceptance",
          is_available: false,
        })
        .eq("id", driverId);
    }

    /* ===============================
       NOTIFICAÇÃO
    =============================== */
    if (driver.user_id) {
      if (queued) {
        // Notify driver about queued order
        await supabase.from("notifications").insert({
          user_id: driver.user_id,
          title: "Pedido adicionado à fila",
          message: `Pedido #${orderId.slice(0, 8)} - Posição ${queuePosition} na fila`,
          type: "info",
          data: { orderId, companyId, queuePosition },
        });
      } else {
        await supabase.from("notifications").insert({
          user_id: driver.user_id,
          title: "Nova entrega disponível",
          message: `Pedido #${orderId.slice(0, 8)}`,
          type: "info",
          data: { orderId, companyId },
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        driverName: driver.driver_name,
        queued,
        queuePosition,
        message: queued 
          ? `Pedido adicionado à fila (posição ${queuePosition})`
          : "Pedido atribuído ao entregador",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("assign-driver error:", err);
    return new Response(
      JSON.stringify({ error: "Erro interno no servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
