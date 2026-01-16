import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const sliceCount = numberOfSlices || 8;
    
    // First, analyze the image to detect pizza and count slices
    const analysisResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
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
      
      const sliceResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image-preview",
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
