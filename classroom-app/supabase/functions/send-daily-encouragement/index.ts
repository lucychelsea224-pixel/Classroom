// =================================================================
// Supabase Edge Function: send-daily-encouragement
//
// Sends one random encouragement email to every user, every morning.
// Not called by the app directly — triggered by a scheduled cron job
// (see schema-cron-jobs.sql) that hits this URL once a day. Because
// there's no logged-in user for a cron job to authenticate as, this
// function is protected by a shared secret header instead of a JWT.
//
// Uses the same EmailJS credentials/template as send-score-email.
// =================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SERVICE_ID = Deno.env.get("EMAILJS_SERVICE_ID");
const TEMPLATE_ID = Deno.env.get("EMAILJS_TEMPLATE_ID");
const PUBLIC_KEY = Deno.env.get("EMAILJS_PUBLIC_KEY");
const SECRET_KEY = Deno.env.get("EMAILJS_SECRET_KEY");
const CRON_SECRET = Deno.env.get("CRON_SECRET"); // shared secret, set this yourself — see setup notes

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const MORNING_MESSAGES = [
  "Good morning! Today is a fresh chance to learn something new. You've got this!",
  "Rise and shine! Even 10 minutes of practice today adds up over time. Let's go!",
  "A new day, a new chance to get a little bit better. What will you study today?",
  "Good morning! Remember: you don't have to be perfect, you just have to keep going.",
  "Hope you slept well! Your notes are waiting whenever you're ready to dive in.",
  "Small steps every day lead to big results. Make today count!",
  "Good morning, champion! One more day of practice is one step closer to exam day.",
  "Today's a great day to review something you found tricky yesterday. You can do it!",
  "Good morning! Progress isn't about being fast — it's about not stopping.",
  "Wake up and shine! A little revision this morning will make a big difference later.",
  "Good morning! Believe in yourself the way your teachers and family believe in you.",
  "New day, new questions to conquer. Let's make today a good study day!",
  "Good morning! You're capable of more than you know — go prove it to yourself today.",
  "Every page you read and every question you practice is building your future. Keep at it!",
  "Good morning! Consistency beats perfection — just show up and try your best today."
];

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function buildEmailHtml(fullName, message) {
  const greetingName = fullName ? fullName.split(" ")[0] : "there";
  return `
  <div style="font-family:sans-serif; background:#2d2d2d; padding:32px 16px;">
    <div style="max-width:480px; margin:0 auto; background:#3d3d3d; border-radius:12px; padding:28px 24px; color:#f4f2ee;">
      <h2 style="margin:0 0 4px; font-size:20px;">Good morning, ${greetingName}! ☀️</h2>
      <p style="font-size:15px; line-height:1.6; color:#f4f2ee; margin-top:18px;">${message}</p>
      <p style="font-size:12px; color:#857f75; margin-top:28px;">You're receiving this daily note because you have a Classroom account. Contact classroomcareservice@gmail.com with any questions.</p>
    </div>
  </div>`;
}

async function sendOne(email, fullName) {
  const message = pickRandom(MORNING_MESSAGES);
  const payload = {
    service_id: SERVICE_ID,
    template_id: TEMPLATE_ID,
    user_id: PUBLIC_KEY,
    accessToken: SECRET_KEY,
    template_params: {
      to_email: email,
      subject_title: "Good morning from Classroom! ☀️",
      htmlContent: buildEmailHtml(fullName, message)
    }
  };
  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return res.ok;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const providedSecret = req.headers.get("x-cron-secret");
    if (!CRON_SECRET || providedSecret !== CRON_SECRET) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Names live in auth.users' metadata (set at signup), not in the
    // profiles table — so we pull the user list directly, page by page.
    let allUsers = [];
    let page = 1;
    while (true) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(error.message);
      allUsers = allUsers.concat(data.users);
      if (data.users.length < 200) break;
      page++;
    }

    const recipients = allUsers
      .filter(u => !!u.email)
      .map(u => ({ email: u.email, fullName: u.user_metadata?.full_name || "" }));

    let sent = 0, failed = 0;
    // Sent one at a time (not in parallel) — EmailJS rate-limits bursts,
    // and this keeps it reliable over speed for a daily batch job.
    for (const r of recipients) {
      try {
        const ok = await sendOne(r.email, r.fullName);
        if (ok) sent++; else failed++;
      } catch {
        failed++;
      }
    }

    return new Response(JSON.stringify({ ok: true, sent, failed, total: recipients.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
