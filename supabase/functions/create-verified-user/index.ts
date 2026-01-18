import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateUserRequest {
  email: string;
  password: string;
  fullName: string;
  phone: string;
  companyName: string;
  cnpj?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email: rawEmail, password, fullName, phone, companyName, cnpj }: CreateUserRequest = await req.json();

    // Validação obrigatória de email
    if (!rawEmail || !rawEmail.trim()) {
      return new Response(
        JSON.stringify({ error: "Email é obrigatório para criar uma conta" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const email = rawEmail.trim().toLowerCase();

    // Validar formato do email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: "Formato de email inválido" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!password || !fullName || !companyName) {
      return new Response(
        JSON.stringify({ error: "Dados obrigatórios faltando" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Creating verified user for: ${email}`);

    // Create Supabase client with service role
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Validação por email na tabela companies
    const { data: existingEmailCompany, error: emailCheckError } = await supabase
      .from("companies")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (emailCheckError) {
      throw emailCheckError;
    }

    if (existingEmailCompany) {
      return new Response(
        JSON.stringify({ error: "Já existe uma empresa cadastrada com esse email. Redefina sua senha." }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validação por telefone na tabela companies
    if (phone) {
      const { data: existingPhone, error: phoneCheckError } = await supabase
        .from("companies")
        .select("id")
        .eq("phone", phone)
        .maybeSingle();

      if (phoneCheckError) {
        throw phoneCheckError;
      }

      if (existingPhone) {
        return new Response(
          JSON.stringify({ error: "Este telefone já está cadastrado em uma empresa" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    // Validação por CNPJ na tabela companies (se fornecido)
    if (cnpj) {
      const { data: existingCnpj, error: cnpjCheckError } = await supabase
        .from("companies")
        .select("id")
        .eq("cnpj", cnpj)
        .maybeSingle();

      if (cnpjCheckError) {
        throw cnpjCheckError;
      }

      if (existingCnpj) {
        return new Response(
          JSON.stringify({ error: "Este CNPJ já está cadastrado em uma empresa" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    // Check if email was verified
    const { data: verificationRecord, error: fetchError } = await supabase
      .from("email_verification_codes")
      .select("*")
      .eq("email", email)
      .eq("verified", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      console.error("Error checking verification:", fetchError);
      throw new Error("Erro ao verificar email");
    }

    if (!verificationRecord) {
      console.log("Email not verified:", email);
      return new Response(
        JSON.stringify({ error: "Email não verificado. Por favor, verifique seu email primeiro." }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Create user with admin API (already confirmed)
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        phone: phone,
      },
    });

    if (authError) {
      console.error("Error creating user:", authError);
      if (authError.message.includes("already registered")) {
        return new Response(
          JSON.stringify({ error: "Este email já está cadastrado. Faça login ou redefina sua senha." }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      throw authError;
    }

    const userId = authData.user?.id;
    if (!userId) {
      throw new Error("Erro ao criar usuário");
    }

    // Create slug from company name
    const slug = companyName
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    // Check if slug exists
    const { data: existingCompany } = await supabase
      .from("companies")
      .select("slug")
      .eq("slug", slug)
      .single();

    const finalSlug = existingCompany ? `${slug}-${Date.now()}` : slug;

    // Create company with all registration data
    const { error: companyError } = await supabase
      .from("companies")
      .insert({
        name: companyName,
        slug: finalSlug,
        owner_id: userId,
        cnpj: cnpj || null,
        email: email.trim(),
        phone: phone || null,
        status: "pending",
      });

    if (companyError) {
      console.error("Error creating company:", companyError);
      // Try to delete the user if company creation fails
      await supabase.auth.admin.deleteUser(userId);
      throw new Error("Erro ao criar empresa");
    }

    // Add store_owner role
    const { error: roleError } = await supabase
      .from("user_roles")
      .insert({
        user_id: userId,
        role: "store_owner",
      });

    if (roleError) {
      console.error("Error adding role:", roleError);
    }

    // Clean up verification codes for this email
    await supabase
      .from("email_verification_codes")
      .delete()
      .eq("email", email);

    console.log(`User and company created successfully for: ${email}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Conta criada com sucesso",
        userId: userId
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in create-verified-user:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno do servidor" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);