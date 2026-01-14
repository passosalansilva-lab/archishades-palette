// supabase/functions/driver-direct-login/index.ts

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[DRIVER-DIRECT-LOGIN] ${step}${detailsStr}`);
};

serve(async (req) => {
  // Handle preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const { email, companySlug } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    logStep("Processing login", { email: normalizedEmail, companySlug });

    // Cliente admin com service_role (bypass RLS)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    let targetCompanyId: string | null = null;
    let companyName: string | null = null;

    // Validação da empresa se slug foi informado
    if (companySlug) {
      const { data: company, error: companyError } = await supabaseAdmin
        .from("companies")
        .select("id, name")
        .eq("slug", companySlug)
        .maybeSingle();

      if (companyError) {
        logStep("Error fetching company", { error: companyError.message });
        return new Response(
          JSON.stringify({ error: "Erro ao verificar empresa" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!company) {
        logStep("Company not found", { slug: companySlug });
        return new Response(
          JSON.stringify({ error: "Empresa não encontrada. Verifique o link de acesso." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      targetCompanyId = company.id;
      companyName = company.name;
      logStep("Company validated", { companyId: targetCompanyId, name: companyName });
    }

    // Busca o entregador ativo com o email informado
    let driverQuery = supabaseAdmin
      .from("delivery_drivers")
      .select("id, email, driver_name, is_active, user_id, company_id")
      .eq("email", normalizedEmail)
      .eq("is_active", true);

    if (targetCompanyId) {
      driverQuery = driverQuery.eq("company_id", targetCompanyId);
    }

    const { data: drivers, error: driverError } = await driverQuery
      .order("created_at", { ascending: false })
      .limit(1);

    if (driverError) {
      logStep("Error querying driver", { error: driverError.message });
      return new Response(
        JSON.stringify({ error: "Erro ao verificar entregador" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const driver = drivers && drivers.length > 0 ? drivers[0] : null;

    if (!driver) {
      logStep("Driver not found or inactive", { email: normalizedEmail, companySlug });

      if (companySlug && companyName) {
        return new Response(
          JSON.stringify({
            error: `Você não está cadastrado como entregador em ${companyName}. Contate o estabelecimento.`,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "Email não cadastrado ou conta desativada" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    logStep("Driver found", { driverId: driver.id, hasUserId: !!driver.user_id });

    let userId = driver.user_id;

    // Se não tiver user_id vinculado, cria o usuário no auth
    if (!userId) {
      logStep("Creating auth user for driver");

      const randomPassword = crypto.randomUUID() + crypto.randomUUID();

      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: normalizedEmail,
        password: randomPassword,
        email_confirm: true,
        user_metadata: { full_name: driver.driver_name || "Entregador" },
      });

      if (authError) {
        if (authError.message.includes("already been registered")) {
          logStep("User already exists, fetching from auth");
          const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
          const existingUser = existingUsers?.users?.find((u: any) => u.email === normalizedEmail);
          if (existingUser) {
            userId = existingUser.id;
          } else {
            throw authError;
          }
        } else {
          throw authError;
        }
      } else if (authData?.user) {
        userId = authData.user.id;
      }

      // Vincula o user_id ao entregador
      const { error: linkError } = await supabaseAdmin
        .from("delivery_drivers")
        .update({ user_id: userId })
        .eq("id", driver.id);

      if (linkError) {
        logStep("Error linking user_id to driver", { error: linkError.message });
        // Não falha a função por isso, só loga
      }

      // Adiciona role de delivery_driver
      const { error: roleError } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: userId, role: "delivery_driver" }, { onConflict: "user_id,role" });

      if (roleError) {
        logStep("Error adding driver role", { error: roleError.message });
      }

      logStep("Auth user created and linked", { userId });
    }

    // === LOGIN DIRETO - Gera magic link e extrai o token para criar sessão ===
    logStep("Generating magic link to extract token");

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: normalizedEmail,
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      logStep("generateLink failed", { message: linkError?.message });
      return new Response(
        JSON.stringify({ error: "Não foi possível gerar link de login. Tente novamente." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extrai o token do link gerado
    const actionLink = linkData.properties.action_link;
    const urlObj = new URL(actionLink);
    const token = urlObj.searchParams.get("token");
    const tokenType = urlObj.searchParams.get("type") || "magiclink";

    if (!token) {
      logStep("Token not found in action_link", { actionLink });
      return new Response(
        JSON.stringify({ error: "Falha ao extrair token de login" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    logStep("Token extracted, verifying OTP to create session");

    // Usa o token para criar uma sessão válida
    const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: "magiclink",
    });

    if (sessionError || !sessionData?.session) {
      logStep("verifyOtp failed", { message: sessionError?.message });
      return new Response(
        JSON.stringify({ error: "Falha ao criar sessão de login. Tente novamente." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    logStep("Session created successfully", { userId: sessionData.user?.id });

    return new Response(
      JSON.stringify({
        session: {
          access_token: sessionData.session.access_token,
          refresh_token: sessionData.session.refresh_token,
          expires_in: sessionData.session.expires_in,
          expires_at: sessionData.session.expires_at,
        },
        user: sessionData.user,
        companyId: driver.company_id,
        driverName: driver.driver_name,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("UNEXPECTED ERROR", { message: errorMessage, stack: error.stack });

    return new Response(
      JSON.stringify({ error: "Erro interno. Tente novamente mais tarde." }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});