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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
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
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !user) throw new Error("Not authenticated.");

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
    
    // Safely structure and map array elements passed from the client session wrapper
    const processedHistory = Array.isArray(history) 
      ? history.filter(msg => msg && typeof msg === 'object' && msg.parts).map(msg => ({
          role: msg.role === "bot" || msg.role === "model" ? "model" : "user",
          parts: Array.isArray(msg.parts) ? msg.parts : [{ text: String(msg.parts) }]
        })).slice(-8)
      : [];

    const contents = [
      ...processedHistory,
      { role: "user", parts: [{ text: contextLine + question }] }
    ];

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
            temperature: 0.6, 
            maxOutputTokens: 450 
          }
        })
      }
    );

    const data = await res.json();
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