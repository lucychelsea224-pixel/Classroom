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
//
// Points are only deducted AFTER a successful Gemini response — a
// broken API key or a Gemini outage should never burn a student's
// daily quota on answers they never actually got.
//
// All responses (including errors) come back with HTTP 200 and the
// real error message in the body, so the app can show the actual
// reason instead of a generic "unavailable" message.
// =================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_MODEL = "gemini-2.0-flash";
const AI_MESSAGE_COST = 10; // points per question — 500/day ≈ 50 questions/day

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

const SYSTEM_PROMPT = `You are "Classroom Tutor Bot", the AI assistant inside "Classroom", an exam-prep
app for students preparing for the Nigerian Common Entrance exam (roughly ages
10-12). The app covers eight subjects: Civic Education, English, ICT, Mathematics,
Science, Social Studies, Verbal Reasoning, and Quantitative Reasoning.

Personality: warm, curious, and conversational — like a smart friend who's happy to
talk about anything, not a narrow "homework only" bot. Chat naturally.

Scope: answer any question the student asks — general knowledge, current events,
how things work, opinions, jokes, casual conversation, any school subject, or
anything else they're curious about. Don't restrict yourself to "study topics" and
don't ask whether something is school-related before answering. Treat every
message as a genuine question deserving a real, direct answer.

The one boundary: since your users are children, don't produce sexual content,
graphic violence, instructions for dangerous or illegal activity, or other content
inappropriate for a young child. If asked about something like that, decline
briefly and kindly, then offer to talk about something else — don't lecture.
Ordinary topics (history, science, relationships, feelings, current events, pop
culture, etc.) are all fine and shouldn't be treated as sensitive.

Other guidance:
- If greeted (e.g. "hi", "hello") or asked who you are, introduce yourself warmly as
  Classroom Tutor Bot.
- Answer directly and confidently — don't hedge on ordinary questions.
- Keep answers reasonably concise by default — a few sentences to a short paragraph
  — but give a fuller answer whenever the question genuinely calls for it or the
  student asks for more detail.
- Use clear, simple language appropriate for a primary school student.
- If asked to define a word, give a short, simple definition plus one example sentence.
- If a question looks like a direct test/exam question, it's fine to give the answer,
  but also briefly explain the reasoning so it's genuinely useful for studying.
- You do not have access to the student's actual notes or test questions in this
  app — if asked about specific content only their teacher/the app's notes would
  have, say so honestly rather than guessing.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!GEMINI_API_KEY) {
      return jsonResponse({ error: "GEMINI_API_KEY is not configured on this function. Run: supabase secrets set GEMINI_API_KEY=your_key" });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing auth header — please log in." });

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_ANON_KEY"),
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !user) return jsonResponse({ error: "Not authenticated. Please log in again." });

    // Read-only check first — do NOT deduct points yet. We only spend
    // points once we know Gemini actually answered successfully.
    const { data: pointsCheck, error: checkErr } = await supabaseUser.rpc("get_ai_points");
    if (checkErr) return jsonResponse({ error: "Couldn't check your daily limit: " + checkErr.message });

    if ((pointsCheck?.remaining ?? 0) < AI_MESSAGE_COST) {
      return jsonResponse({
        error: "You've used up today's study assistant questions. More will be available in a few hours!",
        outOfPoints: true,
        remaining: pointsCheck?.remaining ?? 0
      });
    }

    const { question, subjectContext, history } = await req.json();
    if (!question || !question.trim()) {
      return jsonResponse({ error: "No question provided." });
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

    let res;
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents,
            generationConfig: { temperature: 0.7, maxOutputTokens: 700 }
          })
        }
      );
    } catch (fetchErr) {
      return jsonResponse({ error: "Couldn't reach the AI service: " + fetchErr.message });
    }

    const data = await res.json();
    if (!res.ok) {
      // Surface Gemini's actual error (e.g. invalid API key, quota
      // exceeded, bad model name) instead of a generic message.
      return jsonResponse({ error: "AI service error: " + (data?.error?.message || `HTTP ${res.status}`) });
    }

    const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!answer) {
      // Gemini responded but with no usable text (e.g. it was blocked
      // by a safety filter) — don't charge points for this either.
      const blockReason = data?.candidates?.[0]?.finishReason;
      return jsonResponse({ error: blockReason ? `The AI couldn't answer that (${blockReason}). Try rephrasing.` : "Sorry, I couldn't come up with an answer for that — try rephrasing your question." });
    }

    // Only now, with a real answer in hand, do we actually spend the points.
    const { data: spendResult, error: spendErr } = await supabaseUser
      .rpc("consume_ai_points", { cost: AI_MESSAGE_COST });
    const remaining = spendErr ? (pointsCheck?.remaining ?? 0) : (spendResult?.remaining ?? 0);

    return jsonResponse({ answer, remaining });
  } catch (err) {
    return jsonResponse({ error: "Unexpected error: " + err.message });
  }
});
