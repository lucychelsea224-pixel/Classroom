// =================================================================
// Supabase Edge Function: ask-ai
//
// A study-help chatbot for Classroom, backed by Google Gemini.
// Handles dynamic interactive learning, subject context inputs,
// context cleanup, and enforces structural daily point allowances.
// =================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_MODEL = "gemini-2.0-flash";
const AI_MESSAGE_COST = 10; 

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are "Class Tutor", the interactive, friendly study assistant inside "Classroom", an exam-prep app for students preparing for the Nigerian Common Entrance exam (roughly ages 10-12).
The app covers six subjects: Civic Education, English, ICT, Mathematics, Science, and Social Studies.

Core Rules & Guardrails:
- Your name is "Class Tutor". You must always answer proudly to this name if asked.
- You must engage interactively! Be ready to converse naturally, explain logic steps, encourage the student, and ask them short check-in questions to test their understanding.
- Keep answers short, clear, and encouraging — a few sentences or a tiny bulleted list, not a massive wall of text.
- Use simple language appropriate for a primary school student.
- Content Restrictions: Politely reject requests unrelated to schoolwork or academic learning (e.g., modern console/mobile gaming advice, movies, music mixing, adult topics, social media trends). If asked about these, say: "I am your Class Tutor, so I can only help you with your school subjects and academic questions! Let's get back to studying."
- If asked to define a word, give a short, simple definition plus one practical example sentence.
- Never do a student's homework question for them outright if it looks like a direct test question — instead explain the underlying concept or mathematical formula method so they can work it out themselves.
- You do not have access to the student's actual notes or test questions in this app — if asked about specific internal structural content only their teacher or the app's internal developer notes would have, say so honestly rather than guessing.`;

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Verify environment secrets up front
    if (!GEMINI_API_KEY) {
      console.error("Configuration Error: GEMINI_API_KEY environment variable is missing.");
      throw new Error("GEMINI_API_KEY environment secret is missing in Supabase vault.");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("Configuration Error: Missing core Supabase environmental constants.");
      throw new Error("Project environment keys (SUPABASE_URL/SUPABASE_ANON_KEY) are missing.");
    }

    // 2. Extract authorization payload safely
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing auth header — please log in.");
    }

    // 3. Setup client session context matching user tokens
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !user) {
      console.error("Auth Error:", userErr);
      throw new Error("Not authenticated.");
    }

    // 4. Parse incoming body data cleanly
    const { question, subjectContext, history } = await req.json().catch(() => ({}));
    if (!question || !question.trim()) {
      return new Response(JSON.stringify({ error: "No question provided." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 5. Deduct points via RPC before executing external AI stream calls
    const { data: pointsResult, error: pointsErr } = await supabaseUser
      .rpc("consume_ai_points", { cost: AI_MESSAGE_COST });
    
    if (pointsErr) {
      console.error("Database RPC error context:", pointsErr);
      throw new Error(`Database point check failed: ${pointsErr.message}`);
    }

    if (!pointsResult || !pointsResult.allowed) {
      return new Response(JSON.stringify({
        error: pointsResult?.message || "Daily limit reached.",
        outOfPoints: true,
        remaining: pointsResult?.remaining ?? 0
      }), {
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 6. Assemble context and clean messaging records for Gemini API structures
    const contextLine = subjectContext ? `The student is currently studying: ${subjectContext}.\n\n` : "";
    
    // Ultra-safe history normalization that will not crash regardless of frontend structure
    const processedHistory = [];
    if (Array.isArray(history)) {
      for (const msg of history) {
        if (!msg || typeof msg !== 'object') continue;
        
        let textContent = "";
        
        // Extract text safely from whatever structural format the frontend sent
        if (typeof msg.text === 'string' && msg.text.trim()) {
          textContent = msg.text;
        } else if (Array.isArray(msg.parts) && msg.parts[0]) {
          textContent = typeof msg.parts[0] === 'object' ? String(msg.parts[0].text || "") : String(msg.parts[0]);
        } else if (msg.parts && typeof msg.parts === 'string') {
          textContent = msg.parts;
        }
        
        // Skip empty history frames
        if (!textContent.trim()) continue;

        // Determine proper role
        const role = msg.role === "bot" || msg.role === "model" || msg.role === "assistant" 
          ? "model" 
          : "user";

        processedHistory.push({
          role: role,
          parts: [{ text: textContent.trim() }]
        });
      }
    }
    
    const contents = [
      ...processedHistory.slice(-6),
      { role: "user", parts: [{ text: contextLine + question }] }
    ];

    // 7. Execute fetch invocation payload straight to Google Gemini Endpoint
    const geminiResponse = await fetch(
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

    const data = await geminiResponse.json();
    
    if (!geminiResponse.ok) {
      console.error("Gemini API Connection Rejection details:", data);
      throw new Error(`Gemini API error: ${data?.error?.message || geminiResponse.statusText}`);
    }

    const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text || 
      "Sorry, I couldn't come up with an answer for that — try rephrasing your question.";

    // 8. Send back the clean text response string alongside fresh remaining point metrics
    return new Response(JSON.stringify({ answer, remaining: pointsResult.remaining }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("Fatal Runtime Error encountered inside Edge Function execution:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});