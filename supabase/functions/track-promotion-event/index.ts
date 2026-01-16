import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TrackEventRequest {
  promotion_id: string;
  company_id: string;
  event_type: 'view' | 'click' | 'conversion';
  order_id?: string;
  revenue?: number;
  session_id?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: TrackEventRequest = await req.json();
    console.log('[track-promotion-event] Received:', JSON.stringify(body));

    const { promotion_id, company_id, event_type, order_id, revenue, session_id } = body;

    // Validate required fields
    if (!promotion_id || !company_id || !event_type) {
      console.error('[track-promotion-event] Missing required fields');
      return new Response(
        JSON.stringify({ error: 'Missing required fields: promotion_id, company_id, event_type' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate event_type
    if (!['view', 'click', 'conversion'].includes(event_type)) {
      console.error('[track-promotion-event] Invalid event_type:', event_type);
      return new Response(
        JSON.stringify({ error: 'Invalid event_type. Must be view, click, or conversion' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // For views, check if we already have a recent view from this session to avoid duplicates
    if (event_type === 'view' && session_id) {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      
      const { data: existingView } = await supabase
        .from('promotion_events')
        .select('id')
        .eq('promotion_id', promotion_id)
        .eq('session_id', session_id)
        .eq('event_type', 'view')
        .gte('created_at', fiveMinutesAgo)
        .maybeSingle();

      if (existingView) {
        console.log('[track-promotion-event] Duplicate view detected, skipping');
        return new Response(
          JSON.stringify({ success: true, message: 'View already recorded' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Insert the event
    const eventData = {
      promotion_id,
      company_id,
      event_type,
      order_id: order_id || null,
      revenue: revenue || 0,
      session_id: session_id || null,
    };

    console.log('[track-promotion-event] Inserting event:', JSON.stringify(eventData));

    const { data, error } = await supabase
      .from('promotion_events')
      .insert(eventData)
      .select('id')
      .single();

    if (error) {
      console.error('[track-promotion-event] Error inserting event:', error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[track-promotion-event] Event recorded:', data.id);

    return new Response(
      JSON.stringify({ success: true, event_id: data.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('[track-promotion-event] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
