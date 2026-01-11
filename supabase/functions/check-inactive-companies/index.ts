import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Starting inactive companies check...");
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get configurable inactivity days from system_settings (default 15)
    const { data: settingData } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "inactivity_suspension_days")
      .single();

    const inactivityDays = settingData?.value ? parseInt(settingData.value, 10) : 15;
    console.log(`Using inactivity period: ${inactivityDays} days`);

    // Get the date X days ago
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - inactivityDays);

    // Find approved companies that were approved more than X days ago
    const { data: companies, error: companiesError } = await supabase
      .from("companies")
      .select(`
        id,
        name,
        slug,
        owner_id,
        status,
        created_at,
        updated_at,
        logo_url,
        menu_published
      `)
      .eq("status", "approved")
      .lt("updated_at", cutoffDate.toISOString());

    if (companiesError) {
      throw companiesError;
    }

    console.log(`Found ${companies?.length || 0} companies approved more than ${inactivityDays} days ago`);

    const cancelledCompanies: string[] = [];
    const errors: string[] = [];

    for (const company of companies || []) {
      try {
        // Check if company has any orders
        const { count: ordersCount, error: ordersError } = await supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("company_id", company.id);

        if (ordersError) {
          console.error(`Error checking orders for company ${company.id}:`, ordersError);
          errors.push(`${company.name}: ${ordersError.message}`);
          continue;
        }

        // Check if company has any products (store configured)
        const { count: productsCount, error: productsError } = await supabase
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("company_id", company.id);

        if (productsError) {
          console.error(`Error checking products for company ${company.id}:`, productsError);
          errors.push(`${company.name}: ${productsError.message}`);
          continue;
        }

        // Check if company has any categories
        const { count: categoriesCount, error: categoriesError } = await supabase
          .from("categories")
          .select("id", { count: "exact", head: true })
          .eq("company_id", company.id);

        if (categoriesError) {
          console.error(`Error checking categories for company ${company.id}:`, categoriesError);
          errors.push(`${company.name}: ${categoriesError.message}`);
          continue;
        }

        const hasOrders = (ordersCount || 0) > 0;
        const hasProducts = (productsCount || 0) > 0;
        const hasCategories = (categoriesCount || 0) > 0;
        const isConfigured = hasProducts || hasCategories || company.menu_published;

        console.log(`Company ${company.name}: orders=${ordersCount}, products=${productsCount}, categories=${categoriesCount}, configured=${isConfigured}`);

        // If no orders and not configured, suspend the company
        if (!hasOrders && !isConfigured) {
          console.log(`Suspending inactive company: ${company.name}`);

          // Get owner email
          const { data: userData, error: userError } = await supabase.auth.admin.getUserById(company.owner_id);

          if (userError) {
            console.error(`Error getting user for company ${company.id}:`, userError);
            errors.push(`${company.name}: Could not get owner email`);
            continue;
          }

          const ownerEmail = userData.user?.email;
          const ownerName = userData.user?.user_metadata?.full_name;

          // Update company status to suspended
          const { error: updateError } = await supabase
            .from("companies")
            .update({ status: "suspended" })
            .eq("id", company.id);

          if (updateError) {
            console.error(`Error suspending company ${company.id}:`, updateError);
            errors.push(`${company.name}: ${updateError.message}`);
            continue;
          }

          // Send suspension email with inactivity reason
          if (ownerEmail) {
            try {
              const emailResponse = await fetch(`${SUPABASE_URL}/functions/v1/send-company-suspension-email`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                },
                body: JSON.stringify({
                  companyId: company.id,
                  ownerId: company.owner_id,
                  reason: `Sua empresa permaneceu ${inactivityDays} dias sem receber pedidos e sem configurar o cardápio. Configure seus produtos e categorias para reativar sua conta.`,
                }),
              });

              if (!emailResponse.ok) {
                console.error(`Failed to send suspension email for ${company.name}`);
              } else {
                console.log(`Suspension email sent to ${ownerEmail}`);
              }
            } catch (emailError) {
              console.error(`Error sending suspension email for ${company.name}:`, emailError);
            }
          }

          // Create notification for the owner
          await supabase.from("notifications").insert({
            user_id: company.owner_id,
            title: "Empresa suspensa por inatividade",
            message: `Sua empresa "${company.name}" foi suspensa automaticamente após ${inactivityDays} dias sem configuração ou pedidos. Entre em contato com o suporte para reativar.`,
            type: "error",
            data: {
              type: "company_suspended_inactivity",
              companyId: company.id,
              inactivityDays,
            },
          });

          cancelledCompanies.push(company.name);
        }
      } catch (companyError: any) {
        console.error(`Error processing company ${company.id}:`, companyError);
        errors.push(`${company.name}: ${companyError.message}`);
      }
    }

    console.log(`Finished. Suspended ${cancelledCompanies.length} companies.`);

    return new Response(
      JSON.stringify({
        success: true,
        inactivityDays,
        checked: companies?.length || 0,
        cancelled: cancelledCompanies.length,
        cancelledCompanies,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in check-inactive-companies:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
