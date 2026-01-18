import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);
    const supabaseAuthed = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await supabaseAuthed.auth.getUser();
    if (userError || !userData?.user) {
      console.error("[broadcast-order-offers] auth.getUser error", userError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { orderId, companyId } = await req.json();

    if (!orderId || !companyId) {
      return new Response(
        JSON.stringify({ error: "orderId and companyId are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`Broadcasting order ${orderId} to drivers for company ${companyId}`);

    // Authorization: owner, staff of the company, or super_admin
    const userId = userData.user.id;

    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .select("owner_id")
      .eq("id", companyId)
      .maybeSingle();

    if (companyError) {
      console.error("[broadcast-order-offers] Error loading company", companyError);
      throw companyError;
    }

    if (!company) {
      return new Response(
        JSON.stringify({ error: "Company not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let isAllowed = company.owner_id === userId;

    if (!isAllowed) {
      const { data: staffRow, error: staffError } = await supabaseAdmin
        .from("company_staff")
        .select("id")
        .eq("company_id", companyId)
        .eq("user_id", userId)
        .maybeSingle();

      if (staffError) {
        console.error("[broadcast-order-offers] Error checking staff link", staffError);
        throw staffError;
      }

      isAllowed = !!staffRow;
    }

    if (!isAllowed) {
      const { data: adminRole, error: roleError } = await supabaseAdmin
        .from("user_roles")
        .select("id")
        .eq("user_id", userId)
        .eq("role", "super_admin")
        .maybeSingle();

      if (roleError) {
        console.error("[broadcast-order-offers] Error checking super_admin role", roleError);
        throw roleError;
      }

      isAllowed = !!adminRole;
    }

    if (!isAllowed) {
      return new Response(
        JSON.stringify({ error: "Forbidden" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Ensure order is in a valid state to be sent to drivers
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("status, delivery_driver_id")
      .eq("id", orderId)
      .maybeSingle();

    if (orderError) {
      console.error("[broadcast-order-offers] Error fetching order", orderError);
      throw orderError;
    }

    if (!order) {
      return new Response(
        JSON.stringify({ error: "Order not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (order.status !== "ready") {
      console.warn(`[broadcast-order-offers] Order ${orderId} is not ready. Current status: ${order.status}`);
      return new Response(
        JSON.stringify({
          success: false,
          error: "INVALID_STATUS",
          message: "Pedido só pode ser enviado para entregadores quando estiver com status PRONTO.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (order.delivery_driver_id) {
      console.warn(
        `[broadcast-order-offers] Order ${orderId} already has a driver assigned: ${order.delivery_driver_id}`,
      );
      return new Response(
        JSON.stringify({
          success: false,
          error: "ALREADY_ASSIGNED",
          message: "Este pedido já está atribuído a um entregador. Remova a atribuição antes de enviar para todos.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Get all available and active drivers for this company
    // Drivers without user_id (haven't logged in yet) are still eligible for assignment
    const { data: availableDrivers, error: driversError } = await supabaseAdmin
      .from("delivery_drivers")
      .select("id, user_id, driver_name")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .eq("is_available", true);

    if (driversError) {
      console.error("[broadcast-order-offers] Error fetching drivers", driversError);
      throw driversError;
    }

    // Filter to only available status drivers if they have status set
    const eligibleDrivers = (availableDrivers || []).filter(d => true); // All active+available drivers are eligible

    if (eligibleDrivers.length === 0) {
      console.log("[broadcast-order-offers] No available drivers found");
      return new Response(
        JSON.stringify({ success: false, message: "No available drivers", offersCreated: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // If there's only ONE driver available, assign directly instead of creating offers
    if (eligibleDrivers.length === 1) {
      const singleDriver = eligibleDrivers[0];
      console.log(`[broadcast-order-offers] Only 1 driver available (${singleDriver.driver_name}), assigning directly`);

      // Update order with the driver and status
      const { error: directAssignError } = await supabaseAdmin
        .from("orders")
        .update({ 
          delivery_driver_id: singleDriver.id,
          status: "out_for_delivery" 
        })
        .eq("id", orderId);

      if (directAssignError) {
        console.error("[broadcast-order-offers] Error assigning single driver", directAssignError);
        throw directAssignError;
      }

      // Send notification to the driver if they have a user_id
      if (singleDriver.user_id) {
        await supabaseAdmin.from("notifications").insert({
          user_id: singleDriver.user_id,
          title: "Nova entrega atribuída!",
          message: "Uma nova entrega foi atribuída a você.",
          type: "info",
          data: { type: "driver_assignment", order_id: orderId, company_id: companyId },
        });

        try {
          await supabaseAdmin.functions.invoke("send-push-notification", {
            body: {
              userId: singleDriver.user_id,
              companyId: companyId,
              userType: "driver",
              payload: {
                title: "Nova entrega atribuída!",
                body: "Uma nova entrega foi atribuída a você.",
                tag: `driver-assignment-${orderId}`,
                data: { type: "driver_assignment", orderId, companyId, url: "/driver" },
              },
            },
          });
        } catch (pushError) {
          console.error("[broadcast-order-offers] Error sending push to single driver", pushError);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: `Entrega atribuída diretamente para ${singleDriver.driver_name}`,
          offersCreated: 0,
          directAssignment: true,
          driverName: singleDriver.driver_name,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[broadcast-order-offers] Found ${eligibleDrivers.length} eligible drivers (including those without login)`);

    // Cancel any existing pending offers for this order
    await supabaseAdmin
      .from("order_offers")
      .update({ status: "cancelled" })
      .eq("order_id", orderId)
      .eq("status", "pending");

    // Create offers for all eligible drivers (including those without user_id)
    const offers = eligibleDrivers.map((driver) => ({
      order_id: orderId,
      driver_id: driver.id,
      company_id: companyId,
      status: "pending",
    }));

    const { data: createdOffers, error: offersError } = await supabaseAdmin
      .from("order_offers")
      .insert(offers)
      .select();

    if (offersError) {
      console.error("[broadcast-order-offers] Error creating offers", offersError);
      throw offersError;
    }

    // Update order status to awaiting_driver
    const { error: orderStatusUpdateError } = await supabaseAdmin
      .from("orders")
      .update({ status: "awaiting_driver" })
      .eq("id", orderId);

    if (orderStatusUpdateError) {
      console.error("[broadcast-order-offers] Error updating order status", orderStatusUpdateError);
      throw orderStatusUpdateError;
    }

    // Send notifications to drivers who have logged in (have user_id)
    // Drivers without user_id are still assigned offers - they'll see them when they login
    const driversWithUserId = eligibleDrivers.filter(d => d.user_id);
    console.log(`[broadcast-order-offers] Sending notifications to ${driversWithUserId.length} drivers with accounts`);
    
    for (const driver of driversWithUserId) {
      // Create in-app notification
      await supabaseAdmin.from("notifications").insert({
        user_id: driver.user_id,
        title: "Nova entrega disponível!",
        message:
          "Há uma nova entrega disponível. Aceite rápido antes que outro entregador pegue!",
        type: "info",
        data: { type: "order_offer", order_id: orderId, company_id: companyId },
      });

      // Try to send push notification - include both userId AND companyId for better matching
      try {
        await supabaseAdmin.functions.invoke("send-push-notification", {
          body: {
            userId: driver.user_id,
            companyId: companyId,
            userType: "driver",
            payload: {
              title: "Nova entrega disponível!",
              body: "Aceite rápido! Quem pegar primeiro, leva.",
              tag: `order-offer-${orderId}`,
              data: { type: "order_offer", orderId, companyId, url: "/driver" },
            },
          },
        });
        console.log(`[broadcast-order-offers] Push notification sent to driver ${driver.driver_name} (user_id: ${driver.user_id})`);
      } catch (pushError) {
        console.error("[broadcast-order-offers] Error sending push to driver", driver.id, pushError);
      }
    }

    console.log(`[broadcast-order-offers] Created ${createdOffers?.length || 0} offers for order ${orderId}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Order broadcasted to ${eligibleDrivers.length} drivers`,
        offersCreated: createdOffers?.length || 0,
        driverNames: eligibleDrivers.map((d) => d.driver_name),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    console.error("Error in broadcast-order-offers:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
