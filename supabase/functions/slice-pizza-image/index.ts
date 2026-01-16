import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageUrl, numberOfSlices } = await req.json();
    
    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: "imageUrl is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check AI settings from system_settings
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: aiSettings } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", ["ai_enabled", "ai_provider", "ai_api_key"]);

    const settings: Record<string, string> = {};
    aiSettings?.forEach((s: any) => {
      settings[s.key] = s.value;
    });

    const aiEnabled = settings["ai_enabled"] === "true";
    const aiProvider = settings["ai_provider"] || "lovable";
    const customApiKey = settings["ai_api_key"] || "";

    if (!aiEnabled) {
      return new Response(
        JSON.stringify({ error: "Recursos de IA estão desabilitados. Ative nas configurações do sistema." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine which API key and endpoint to use
    let apiKey: string;
    let apiEndpoint: string;
    let model: string;
    let imageModel: string;

    if (aiProvider === "lovable") {
      // Use the secret from Supabase secrets (set via Lovable dashboard)
      apiKey = Deno.env.get("LOVABLE_API_KEY") || "";
      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      apiEndpoint = "https://ai.gateway.lovable.dev/v1/chat/completions";
      model = "google/gemini-2.5-flash";
      imageModel = "google/gemini-2.5-flash-image-preview";
    } else if (aiProvider === "openai") {
      apiKey = customApiKey;
      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: "API Key da OpenAI não configurada nas configurações do sistema" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      apiEndpoint = "https://api.openai.com/v1/chat/completions";
      model = "gpt-4o";
      imageModel = "gpt-4o";
    } else if (aiProvider === "google") {
      apiKey = customApiKey;
      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: "API Key do Google não configurada nas configurações do sistema" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      apiEndpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
      model = "gemini-2.0-flash";
      imageModel = "gemini-2.0-flash";
    } else {
      return new Response(
        JSON.stringify({ error: "Provedor de IA não suportado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sliceCount = numberOfSlices || 8;
    
    // For now, only Lovable AI is fully implemented for image generation
    // Other providers would need different implementation
    if (aiProvider !== "lovable") {
      return new Response(
        JSON.stringify({ 
          error: "Apenas Lovable AI suporta geração de imagens no momento. Altere o provedor nas configurações." 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // First, analyze the image to detect pizza and count slices
    const analysisResponse = await fetch(apiEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze this pizza image. Count the number of visible slices/cuts. Return ONLY a JSON object with format: {"detectedSlices": number, "isPizza": boolean}. If you can't determine the number of slices, use ${sliceCount} as default.`
              },
              {
                type: "image_url",
                image_url: { url: imageUrl }
              }
            ]
          }
        ],
      }),
    });

    if (!analysisResponse.ok) {
      const errorText = await analysisResponse.text();
      console.error("Analysis error:", errorText);
      throw new Error("Failed to analyze pizza image");
    }

    const analysisData = await analysisResponse.json();
    const analysisContent = analysisData.choices?.[0]?.message?.content || "";
    
    // Extract JSON from response
    let detectedSlices = sliceCount;
    try {
      const jsonMatch = analysisContent.match(/\{[^}]+\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        detectedSlices = parsed.detectedSlices || sliceCount;
      }
    } catch {
      console.log("Could not parse slice count, using default:", sliceCount);
    }

    // Generate individual slice images
    const sliceImages: string[] = [];
    
    for (let i = 0; i < detectedSlices; i++) {
      const sliceNumber = i + 1;
      
      const sliceResponse = await fetch(apiEndpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: imageModel,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Extract slice ${sliceNumber} of ${detectedSlices} from this pizza. Create a single pizza slice image with transparent background (PNG). The slice should be isolated, showing just that one triangular piece of the pizza with its toppings. Make it look appetizing with clear edges.`
                },
                {
                  type: "image_url",
                  image_url: { url: imageUrl }
                }
              ]
            }
          ],
          modalities: ["image", "text"]
        }),
      });

      if (!sliceResponse.ok) {
        console.error(`Failed to generate slice ${sliceNumber}`);
        continue;
      }

      const sliceData = await sliceResponse.json();
      const sliceImageUrl = sliceData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      
      if (sliceImageUrl) {
        sliceImages.push(sliceImageUrl);
      }
      
      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return new Response(
      JSON.stringify({
        success: true,
        detectedSlices,
        sliceImages,
        message: `Generated ${sliceImages.length} pizza slice images`
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error:", error);
    
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const status = errorMessage.includes("rate limit") ? 429 : 500;
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
