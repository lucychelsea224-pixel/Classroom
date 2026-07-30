// =================================================================
// Supabase Edge Function: send-announcement
//
// Lets the admin send a custom email to every registered user —
// e.g. "we just added new subjects" or "the app will be down for
// maintenance". Requires the caller to be signed in AND flagged as
// admin in the profiles table; verified server-side, never trusted
// from the browser.
//
// Uses the same EmailJS credentials/template as the other email functions.
// =================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SERVICE_ID = Deno.env.get("EMAILJS_SERVICE_ID");
const TEMPLATE_ID = Deno.env.get("EMAILJS_TEMPLATE_ID");
const PUBLIC_KEY = Deno.env.get("EMAILJS_PUBLIC_KEY");
const SECRET_KEY = Deno.env.get("EMAILJS_SECRET_KEY");

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Same lightweight **bold** / *italic* markup used in notes and
// explanations elsewhere in the app, converted to real HTML tags here.
function renderFormatted(str) {
  const escaped = String(str || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
}

function buildEmailHtml(fullName, subject, message) {
  const greetingName = fullName ? fullName.split(" ")[0] : "there";
  return `
  <div style="font-family:sans-serif; background:#2d2d2d; padding:32px 16px;">
    <div style="max-width:480px; margin:0 auto; background:#3d3d3d; border-radius:12px; padding:28px 24px; color:#f4f2ee;">
      <h2 style="margin:0 0 4px; font-size:20px;">Hi ${greetingName},</h2>
      <p style="font-size:15px; line-height:1.7; color:#f4f2ee; margin-top:18px;">${renderFormatted(message)}</p>
      <p style="font-size:12px; color:#857f75; margin-top:28px;">You're receiving this because you have a Classroom account. Contact classroomcareservice@gmail.com with any questions.</p>
    </div>
  </div>`;
}

async function sendOne(email, fullName, subject, message) {
  const payload = {
    service_id: SERVICE_ID,
    template_id: TEMPLATE_ID,
    user_id: PUBLIC_KEY,
    accessToken: SECRET_KEY,
    template_params: {
      to_email: email,
      subject_title: subject,
      htmlContent: buildEmailHtml(fullName, subject, message)
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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing auth header — please log in.");

    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !user) throw new Error("Not authenticated.");

    // Confirm admin status server-side — never trust a flag sent from the client.
    const { data: profile, error: profileErr } = await supabaseUser
      .from("profiles").select("is_admin").eq("id", user.id).single();
    if (profileErr || !profile?.is_admin) {
      return new Response(JSON.stringify({ error: "Not authorized." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { subject, message } = await req.json();
    if (!subject || !message) throw new Error("Subject and message are required.");

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
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
    for (const r of recipients) {
      try {
        const ok = await sendOne(r.email, r.fullName, subject, message);
        if (ok) sent++; else failed++;
      } catch {
        failed++;
      }
    }

    // Log it for your own records
    await supabaseAdmin.from("announcements").insert({
      subject, message, sent_by: user.id, recipient_count: sent
    });

    return new Response(JSON.stringify({ ok: true, sent, failed, total: recipients.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
