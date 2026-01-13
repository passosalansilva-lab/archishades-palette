import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface EmailTemplate {
  id: string;
  slug: string;
  name: string;
  subject: string;
  html_content: string;
  variables: { name: string; description: string; example: string }[];
  is_active: boolean;
}

/**
 * Busca um template de email do banco de dados pelo slug.
 * Retorna null se não encontrar ou se o template estiver inativo.
 */
export async function getEmailTemplate(slug: string): Promise<EmailTemplate | null> {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data, error } = await supabase
      .from("email_templates")
      .select("*")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      console.error(`Error fetching email template '${slug}':`, error);
      return null;
    }

    return data as EmailTemplate | null;
  } catch (err) {
    console.error(`Exception fetching email template '${slug}':`, err);
    return null;
  }
}

/**
 * Substitui variáveis no template HTML.
 * Variáveis devem estar no formato {{variavel}}
 */
export function replaceTemplateVariables(
  html: string,
  variables: Record<string, string | number>
): string {
  let result = html;
  
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, String(value));
  }
  
  return result;
}

/**
 * Substitui variáveis no subject do email.
 */
export function replaceSubjectVariables(
  subject: string,
  variables: Record<string, string | number>
): string {
  return replaceTemplateVariables(subject, variables);
}
