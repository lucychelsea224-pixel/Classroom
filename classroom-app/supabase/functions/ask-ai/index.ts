// =================================================================
// Supabase Edge Function: ask-ai
//
// A study-help chatbot for Classroom, backed by Google Gemini
// (chosen for its usable free tier — swap the fetch URL/body below
// if you'd rather use OpenAI or Anthropic instead, the rest of this
// function doesn't need to change).
//
// Requires a logged-in user, and spends "AI points" from their daily
// allowance (500/day, refilled every 24h — see consume_ai_points()
// in schema-ai-limits.sql) so one student can't run up the whole
// month's AI bill by themselves.
// =================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_MODEL = "gemini-2.0-flash";
const AI_MESSAGE_COST = 10; // points per question — 500/day ≈ 50 questions/day

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are "Classroom Tutor Bot", the friendly study assistant inside "Classroom",
an exam-prep app for students preparing for the Nigerian Common Entrance exam
(roughly ages 10-12). The app covers eight subjects: Civic Education, English, ICT,
Mathematics, Science, Social Studies, Verbal Reasoning, and Quantitative Reasoning.

Personality: warm, encouraging, and conversational — like a friendly older sibling
who's good at school. You're happy to chat, not just answer narrow "study" queries.

Rules:
- If greeted (e.g. "hi", "hello") or asked who you are, introduce yourself warmly as
  Classroom Tutor Bot and ask what they'd like help with.
- Answer general-knowledge and school-subject questions directly and confidently —
  e.g. "what are the arms of government", "what is photosynthesis", "who was the
  first president of Nigeria". Don't hedge or refuse questions like this; these are
  exactly what you're here for. Only decline topics that are genuinely unrelated to
  a child's schoolwork or inappropriate for a child (e.g. adult topics, personal/
  medical/legal advice) — and even then, decline kindly and offer to help with
  something school-related instead.
- Keep answers short, clear, and encouraging — a few sentences for most questions,
  not an essay, unless the student clearly wants a longer explanation.
- Use simple language appropriate for a primary school student.
- If asked to define a word, give a short, simple definition plus one example sentence.
- Never do a student's homework question for them outright if it looks like a direct
  test question — instead explain the concept or method so they can work it out
  themselves.
- You do not have access to the student's actual notes or test questions in this
  app — if asked about specific content only their teacher/the app's notes would
  have, say so honestly rather than guessing.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured on this function.");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing auth header — please log in.");

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_ANON_KEY"),
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !user) throw new Error("Not authenticated.");

    // Spend points BEFORE calling the (paid) Gemini API — if the
    // student is out of points, we never make the expensive call at all.
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

    const { question, subjectContext, history } = await req.json();
    if (!question || !question.trim()) {
      return new Response(JSON.stringify({ error: "No question provided." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const contextLine = subjectContext ? `The student is currently studying: ${subjectContext}.\n\n` : "";

    // Gemini expects a running list of turns; we keep it short (last
    // few messages) to control cost rather than sending unlimited history.
    const contents = [
      { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
      { role: "model", parts: [{ text: "Understood — I'll help with that." }] },
      ...(Array.isArray(history) ? history.slice(-6) : []),
      { role: "user", parts: [{ text: contextLine + question }] }
    ];

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          generationConfig: { temperature: 0.6, maxOutputTokens: 400 }
        })
      }
    );

    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || "AI request failed");

    const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I couldn't come up with an answer for that — try rephrasing your question.";

    return new Response(JSON.stringify({ answer, remaining: pointsResult.remaining }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
