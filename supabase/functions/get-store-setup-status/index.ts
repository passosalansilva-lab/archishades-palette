import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type MissingKey =
  | "name"
  | "logo"
  | "cover"
  | "niche"
  | "phone"
  | "email"
  | "payment";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const slug = typeof body?.slug === "string" ? body.slug.trim() : "";

    if (!slug) {
      return new Response(
        JSON.stringify({ ok: false, error: "slug is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    console.log(`[get-store-setup-status] Checking store setup for slug=${slug}`);

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, name, logo_url, cover_url, niche, phone, email, pix_key")
      .eq("slug", slug)
      .eq("status", "approved")
      .maybeSingle();

    if (companyError) {
      console.error("[get-store-setup-status] Company query error:", companyError);
      throw companyError;
    }

    if (!company) {
      return new Response(
        JSON.stringify({ ok: false, error: "Company not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const missing: MissingKey[] = [];

    if (!company.name || !company.name.trim()) missing.push("name");
    if (!company.logo_url) missing.push("logo");
    if (!company.cover_url) missing.push("cover");
    if (!company.niche) missing.push("niche");
    if (!company.phone) missing.push("phone");
    if (!company.email) missing.push("email");

    const { data: paymentSettings, error: paymentError } = await supabase
      .from("company_payment_settings")
      .select(
        "mercadopago_enabled, mercadopago_verified, picpay_enabled, picpay_verified, active_payment_gateway",
      )
      .eq("company_id", company.id)
      .maybeSingle();

    if (paymentError) {
      console.error("[get-store-setup-status] Payment settings error:", paymentError);
      // fail safe: if we can't check, consider missing payment
      missing.push("payment");
    } else {
      const activeGateway = paymentSettings?.active_payment_gateway || "mercadopago";

      let onlinePaymentOk = false;
      if (activeGateway === "mercadopago") {
        onlinePaymentOk = !!(
          paymentSettings?.mercadopago_enabled && paymentSettings?.mercadopago_verified
        );
      } else if (activeGateway === "picpay") {
        onlinePaymentOk = !!(
          paymentSettings?.picpay_enabled && paymentSettings?.picpay_verified
        );
      }

      const pixOk = !!company.pix_key;
      const paymentOk = pixOk || onlinePaymentOk;

      if (!paymentOk) missing.push("payment");
    }

    const blocked = missing.length > 0;

    return new Response(
      JSON.stringify({ ok: true, blocked, missing }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    console.error("[get-store-setup-status] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
