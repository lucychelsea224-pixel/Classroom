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
  ,"Every expert was once a beginner. Take it one lesson at a time today!",
  "Good morning! Your potential is limitless. What will you discover today?",
  "Rise and shine! Small steps every day lead to massive progress. Let's dive in!",
  "A brand new day to level up your skills. You are fully capable of great things!",
  "Good morning! Don't worry about being perfect; just focus on getting better than yesterday.",
  "Mistakes are just proof that you are trying and learning. Have a fantastic day!",
  "Good morning! Consistency is your superpower. Let's make today count!",
  "Wake up with determination, finish the day with satisfaction. You've got this!",
  "Good morning! Your future self will thank you for the effort you put in today.",
  "Believe in yourself as much as we believe in you. Let's learn something great!",
  "Rise and shine! The best way to predict your future is to create it, one lesson at a time.",
  "Good morning! You don't have to see the whole staircase, just take the first step today.",
  "Every day is a new opportunity to grow your mind. Enjoy the journey today!",
  "Good morning! Success isn't about being the smartest; it's about showing up and trying.",
  "Rise and shine! Challenge yourself today. Growth happens outside of your comfort zone.",
  "Good morning! You are writing your own success story with every code, note, and lesson.",
  "Keep moving forward, stay curious, and never stop learning. Have a brilliant day!",
  "Good morning! The secret to getting ahead is simply getting started. Let's do this!",
  "Rise and shine! Focus on progress, not perfection. You are doing amazing.",
  "Good morning! Open your mind, trust the process, and let's make today an absolute win!",
  "Good morning! A little bit of review today makes tomorrow's exam so much easier.",
  "Wake up, breathe deep, and remember: you are fully capable of crushing your goals.",
  "Rise and shine! The only bad study session is the one that didn't happen.",
  "Good morning! Make yourself proud today. You've got everything it takes.",
  "Every morning brings a clean slate. Let's build something great on it today!",
  "Good morning! Big goals are just small goals stacked together. Take the first bite today.",
  "Rise and shine! Your dedication today is building the life you want tomorrow.",
  "Good morning! Don't let what you can't do stop you from doing what you can.",
  "You don't need to know everything yet; you just need to be willing to learn today. Good morning!",
  "Good morning! Keep showing up. Your hard work is paving the way to success.",
  "Rise and shine! Fuel your mind with some good revision this morning.",
  "Good morning! You are much closer to your goals than you were yesterday. Keep going!",
  "A fresh day means fresh energy. Let's channel it into learning something amazing!",
  "Good morning! Trust your intellect, trust your preparation, and just do your best.",
  "Rise and shine! Every breakthrough starts with the decision to keep trying.",
  "Good morning! Your focus today determines your success tomorrow. Let's lock in!",
  "You've got the talent, the tools, and the time. Make today a masterpieces!",
  "Good morning! Don't be discouraged by how far you have to go—celebrate how far you've come.",
  "Rise and shine! One hour of focused study today will save you days of stress later.",
  "Good morning! Be stubborn about your goals but flexible about your methods.",
  "A brilliant day starts with a positive mindset. You're going to do great today!",
  "Good morning! Your brain is a muscle—give it a good workout this morning!",
  "Rise and shine! Real growth happens when you keep going even when it gets tough.",
  "Good morning! You are smarter, stronger, and more resilient than you think.",
  "Every single effort you make today brings you closer to crossing the finish line. Let's go!",
  "Good morning! Don't wait for inspiration; create momentum by taking action right now.",
  "Rise and shine! Make today the day you finally conquer that tricky topic.",
  "Good morning! Your education is an investment that always pays the best interest.",
  "Stay patient, stay focused, and keep pushing forward. Have an incredible morning!",
  "Good morning! There are no shortcuts to success, but the journey is entirely worth it.",
  "Rise and shine! You have a brilliant mind—let's share it with the world today.",
  "Good morning! Let go of yesterday's mistakes and embrace today's opportunities.",
  "A short study session is infinitely better than no study session. You've got this!",
  "Good morning! Your drive and ambition are your greatest assets. Keep them fueled!",
  "Rise and shine! Clear your desk, clear your mind, and let's make some serious progress.",
  "Good morning! Believe you can, and you're already halfway there. Let's finish the job!",
  "Every module you finish and question you get right is a victory. Keep winning today!",
  "Good morning! Small, daily disciplines lead to massive, long-term triumphs.",
  "Rise and shine! The harder you work for something, the greater you'll feel when you achieve it.",
  "Good morning! You have the power to make today an incredible day of growth. Let's get to work!"
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
    const BATCH_SIZE = 15; // Process 15 emails concurrently to optimize execution time without triggering harsh API blocks

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);
      
      // Fire all network requests in the current batch concurrently
      const results = await Promise.all(
        batch.map(async (r) => {
          try {
            return await sendOne(r.email, r.fullName);
          } catch {
            return false;
          }
        })
      );

      // Track the results of this batch
      results.forEach(ok => {
        if (ok) sent++; else failed++;
      });
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