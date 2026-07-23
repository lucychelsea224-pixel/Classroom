// =================================================================
// Supabase Edge Function: ask-ai (Diagnostic Version)
// =================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_MODEL = "gemini-2.0-flash";
const AI_MESSAGE_COST = 10; 

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are "Class Tutor", the interactive, friendly study assistant inside "Classroom". Keep answers short, clear, and encouraging for primary school students.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // 1. Parse the request body immediately at the top
    const { question, subjectContext, history } = await req.json();
    if (!question || !question.trim()) {
      return new Response(JSON.stringify({ error: "No question provided." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY environment secret is missing in Supabase vault.");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing auth header — please log in.");

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_ANON_KEY"),
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !user) throw new Error("Not authenticated.");

    // 2. Spend points only after verifying the request is valid
    const { data: pointsResult, error: pointsErr } = await supabaseUser
      .rpc("consume_ai_points", { cost: AI_MESSAGE_COST });
    if (pointsErr) throw new Error(pointsErr.message);

    if (!pointsResult?.allowed) {
      return new Response(JSON.stringify({
        error: pointsResult?.message || "Daily limit reached.",
        outOfPoints: true,
        remaining: pointsResult?.remaining ?? 0
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const contextLine = subjectContext ? `The student is currently studying: ${subjectContext}.\n\n` : "";
    const contents = [
      ...(Array.isArray(history) ? history.slice(-8) : []),
      { role: "user", parts: [{ text: contextLine + question }] }
    ];

    // 3. Call Gemini API
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          systemInstruction: {
            parts: [{ text: SYSTEM_PROMPT }]
          },
          generationConfig: { 
            temperature: 0.5, 
            maxOutputTokens: 450 
          }
        })
      }
    );

    const data = await res.json();
    
    // If Gemini explicitly rejects the key or payload, capture it perfectly here
    if (!res.ok) {
      console.error("Gemini API Error details:", data);
      throw new Error(`Gemini API error: ${data?.error?.message || res.statusText} (Code: ${data?.error?.code || res.status})`);
    }

    const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text || 
      "Sorry, I couldn't come up with an answer for that — try rephrasing your question.";

    return new Response(JSON.stringify({ answer, remaining: pointsResult.remaining }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});