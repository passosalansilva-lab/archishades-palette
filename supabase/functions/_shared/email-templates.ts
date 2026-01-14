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
 * Busca a URL base da plataforma dos system_settings.
 * Retorna a URL configurada ou um fallback.
 */
export async function getPlatformUrl(): Promise<string> {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data, error } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "platform_url")
      .maybeSingle();

    if (error || !data?.value) {
      console.log("Platform URL not found in settings, using default");
      return "https://www.cardpondelivery.com";
    }

    return data.value;
  } catch (err) {
    console.error("Error fetching platform URL:", err);
    return "https://www.cardpondelivery.com";
  }
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
 * Converte camelCase para snake_case
 */
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * Converte snake_case para camelCase
 */
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Substitui variáveis no template HTML.
 * Suporta variáveis nos formatos:
 * - {{variavel}}
 * - {{variavel_snake_case}}
 * - {{variávelCamelCase}}
 * - Converte automaticamente entre camelCase e snake_case em ambas as direções
 */
export function replaceTemplateVariables(
  html: string,
  variables: Record<string, string | number>
): string {
  let result = html;
  
  // Criar um mapa expandido com todas as variações de cada variável
  const expandedVariables: Record<string, string> = {};
  
  for (const [key, value] of Object.entries(variables)) {
    const strValue = String(value);
    
    // Adicionar a variável original
    expandedVariables[key] = strValue;
    
    // Adicionar versão snake_case (se o key for camelCase)
    const snakeKey = camelToSnake(key);
    if (snakeKey !== key) {
      expandedVariables[snakeKey] = strValue;
    }
    
    // Adicionar versão camelCase (se o key for snake_case)
    const camelKey = snakeToCamel(key);
    if (camelKey !== key) {
      expandedVariables[camelKey] = strValue;
    }
  }
  
  // Log para debug (pode ser removido depois)
  console.log("Template variables to replace:", Object.keys(expandedVariables));
  
  // Substituir todas as variáveis
  for (const [key, value] of Object.entries(expandedVariables)) {
    const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
    result = result.replace(regex, value);
  }
  
  // Verificar se ainda há variáveis não substituídas e logar
  const remainingVars = result.match(/\{\{[^}]+\}\}/g);
  if (remainingVars && remainingVars.length > 0) {
    console.warn("Variables not replaced in template:", remainingVars);
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
