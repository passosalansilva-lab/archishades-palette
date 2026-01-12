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
    const { sessionToken, customerCount } = await req.json()
    
    console.log(`Updating customer count for session ${sessionToken} to ${customerCount}`)

    if (!sessionToken) {
      return new Response(
        JSON.stringify({ error: 'Session token is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!customerCount || customerCount < 1) {
      return new Response(
        JSON.stringify({ error: 'Customer count must be at least 1' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Update session with customer count
    const { data, error } = await supabase
      .from('table_sessions')
      .update({ customer_count: customerCount })
      .eq('session_token', sessionToken)
      .eq('status', 'open')
      .select('id, table_id, customer_count')
      .single()

    if (error) {
      console.error('Error updating session:', error)
      return new Response(
        JSON.stringify({ error: 'Failed to update session' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Session updated successfully:', data)
    return new Response(
      JSON.stringify({ 
        success: true, 
        sessionId: data.id,
        tableId: data.table_id,
        customerCount: data.customer_count 
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
