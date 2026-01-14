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
      .select("id, email, driver_name, is_active, user_id, company_id, auth_password")
      .eq("email", normalizedEmail)
      .eq("is_active", true);

    if (targetCompanyId) {
      driverQuery = driverQuery.eq("company_id", targetCompanyId);
    }

    let drivers: any[] | null = null;
    let driverError: any = null;

    {
      const res = await driverQuery
        .order("created_at", { ascending: false })
        .limit(1);
      drivers = res.data as any[] | null;
      driverError = res.error;
    }

    // Compat: se a coluna auth_password ainda não existir, tenta novamente sem ela
    if (driverError?.message && String(driverError.message).includes("auth_password")) {
      logStep("auth_password column missing, retrying without it");

      let fallbackQuery = supabaseAdmin
        .from("delivery_drivers")
        .select("id, email, driver_name, is_active, user_id, company_id")
        .eq("email", normalizedEmail)
        .eq("is_active", true);

      if (targetCompanyId) {
        fallbackQuery = fallbackQuery.eq("company_id", targetCompanyId);
      }

      const fallbackRes = await fallbackQuery
        .order("created_at", { ascending: false })
        .limit(1);

      drivers = fallbackRes.data as any[] | null;
      driverError = fallbackRes.error;
    }

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

    logStep("Driver found", { driverId: driver.id, hasUserId: !!driver.user_id, hasAuthPassword: !!driver.auth_password });

    let userId = driver.user_id;
    let authPassword = driver.auth_password;

    // Se não tiver user_id ou senha, cria/configura o usuário no auth
    if (!userId || !authPassword) {
      logStep("Setting up auth for driver");

      // Gera senha aleatória segura
      const newPassword = crypto.randomUUID() + crypto.randomUUID();

      if (!userId) {
        // Cria novo usuário
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email: normalizedEmail,
          password: newPassword,
          email_confirm: true,
          user_metadata: { full_name: driver.driver_name || "Entregador" },
        });

        if (authError) {
          if (authError.message.includes("already been registered")) {
            logStep("User already exists, fetching and updating password");
            const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
            const existingUser = existingUsers?.users?.find((u: any) => u.email === normalizedEmail);
            if (existingUser) {
              userId = existingUser.id;
              // Atualiza a senha do usuário existente
              await supabaseAdmin.auth.admin.updateUserById(userId, { password: newPassword });
            } else {
              throw authError;
            }
          } else {
            throw authError;
          }
        } else if (authData?.user) {
          userId = authData.user.id;
        }

        // Adiciona role de delivery_driver
        await supabaseAdmin
          .from("user_roles")
          .upsert({ user_id: userId, role: "delivery_driver" }, { onConflict: "user_id,role" });
      } else {
        // Já tem userId mas não tem senha - atualiza a senha
        await supabaseAdmin.auth.admin.updateUserById(userId, { password: newPassword });
      }

      authPassword = newPassword;

      // Salva user_id e senha no driver
      const { error: updateError } = await supabaseAdmin
        .from("delivery_drivers")
        .update({ user_id: userId, auth_password: authPassword })
        .eq("id", driver.id);

      if (updateError) {
        logStep("Error updating driver credentials", { error: updateError.message });
      }

      logStep("Auth setup complete", { userId });
    }

    // === LOGIN DIRETO com email/senha ===
    logStep("Signing in with password");

    const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.signInWithPassword({
      email: normalizedEmail,
      password: authPassword,
    });

    if (sessionError || !sessionData?.session) {
      logStep("signInWithPassword failed", { message: sessionError?.message });
      
      // Se falhou, pode ser que a senha mudou - tenta resetar
      const resetPassword = crypto.randomUUID() + crypto.randomUUID();
      await supabaseAdmin.auth.admin.updateUserById(userId, { password: resetPassword });
      await supabaseAdmin.from("delivery_drivers").update({ auth_password: resetPassword }).eq("id", driver.id);
      
      // Tenta login novamente
      const { data: retryData, error: retryError } = await supabaseAdmin.auth.signInWithPassword({
        email: normalizedEmail,
        password: resetPassword,
      });
      
      if (retryError || !retryData?.session) {
        logStep("Retry signInWithPassword also failed", { message: retryError?.message });
        return new Response(
          JSON.stringify({ error: "Falha ao criar sessão. Tente novamente." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      logStep("Session created on retry", { userId: retryData.user?.id });
      
      return new Response(
        JSON.stringify({
          session: {
            access_token: retryData.session.access_token,
            refresh_token: retryData.session.refresh_token,
            expires_in: retryData.session.expires_in,
            expires_at: retryData.session.expires_at,
          },
          user: retryData.user,
          companyId: driver.company_id,
          driverName: driver.driver_name,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
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