import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { tableNumber, companySlug, customerName, customerEmail, customerPhone, customerCount } = await req.json()
    
    console.log(`Checking table ${tableNumber} for company ${companySlug}`)

    if (!tableNumber || !companySlug) {
      return new Response(
        JSON.stringify({ 
          hasActiveSession: false, 
          reason: 'missing_params',
          message: 'Parâmetros inválidos'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // If customer data is provided, we need to create/update the session with this info
    const hasCustomerData = customerName && customerPhone

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // First get the company by slug
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id')
      .eq('slug', companySlug)
      .maybeSingle()

    if (companyError || !company) {
      console.error('Company not found:', companyError)
      return new Response(
        JSON.stringify({ 
          hasActiveSession: false, 
          reason: 'company_not_found',
          message: 'Estabelecimento não encontrado'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Find the table by number for this company
    const { data: table, error: tableError } = await supabase
      .from('tables')
      .select('id, table_number, name, is_active, company_id')
      .eq('company_id', company.id)
      .eq('table_number', tableNumber)
      .eq('is_active', true)
      .maybeSingle()

    if (tableError || !table) {
      console.log('Table not found or inactive')
      return new Response(
        JSON.stringify({ 
          hasActiveSession: false, 
          reason: 'table_not_found',
          message: 'Mesa não encontrada'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check for an open session on this table
    const { data: session, error: sessionError } = await supabase
      .from('table_sessions')
      .select('id, session_token, customer_name, opened_at')
      .eq('table_id', table.id)
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (sessionError) {
      console.error('Error checking session:', sessionError)
      return new Response(
        JSON.stringify({ error: 'Error checking session' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // If no session exists, we need customer data to create one
    if (!session || !session.session_token) {
      // If no customer data provided, tell frontend to collect it
      if (!hasCustomerData) {
        console.log('No active session and no customer data - requesting customer info')
        return new Response(
          JSON.stringify({ 
            hasActiveSession: false,
            needsCustomerData: true,
            tableId: table.id,
            tableNumber: table.table_number,
            tableName: table.name || `Mesa ${table.table_number}`,
            message: 'Por favor, informe seus dados para abrir a mesa.'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      console.log('Creating new session with customer data:', customerName, customerPhone)
      
      // Generate a unique session token
      const sessionToken = crypto.randomUUID()
      
      // Create new session with customer data
      const { data: newSession, error: createError } = await supabase
        .from('table_sessions')
        .insert({
          table_id: table.id,
          company_id: table.company_id,
          session_token: sessionToken,
          status: 'open',
          opened_at: new Date().toISOString(),
          customer_name: customerName,
          customer_phone: customerPhone,
          customer_email: customerEmail || null,
          customer_count: customerCount || 1
        })
        .select('id, session_token, opened_at, customer_name')
        .single()
      
      if (createError) {
        console.error('Error creating session:', createError)
        return new Response(
          JSON.stringify({ error: 'Error creating session' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      console.log('New session created for table', tableNumber, 'with token:', sessionToken)
      return new Response(
        JSON.stringify({ 
          hasActiveSession: true,
          sessionId: newSession.id,
          sessionToken: newSession.session_token,
          tableId: table.id,
          tableNumber: table.table_number,
          tableName: table.name || `Mesa ${table.table_number}`,
          customerName: newSession.customer_name,
          openedAt: newSession.opened_at,
          newSession: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Active session found for table', tableNumber, '- redirecting to token-based URL')
    return new Response(
      JSON.stringify({ 
        hasActiveSession: true,
        sessionId: session.id,
        sessionToken: session.session_token,
        tableId: table.id,
        tableNumber: table.table_number,
        tableName: table.name || `Mesa ${table.table_number}`,
        openedAt: session.opened_at
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
