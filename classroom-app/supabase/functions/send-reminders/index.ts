// =================================================================
// Supabase Edge Function: send-reminders
//
// Called once a day by the pg_cron job set up in
// schema-push-notifications.sql. Finds every student with a push
// subscription whose study streak shows they haven't opened the app
// yet today, and sends them a reminder notification.
//
// NOT callable by students — it's meant to be triggered only by the
// cron job using the service role key. Checks for that key on every
// request so this can't be abused as a public "spam everyone" endpoint.
//
// Uses the npm "web-push" library for the actual Web Push protocol
// (VAPID signing + payload encryption) rather than hand-rolling that
// crypto — it's exactly the kind of thing worth using a maintained
// library for.
// =================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webPush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@educlassroom.com.ng";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

Deno.serve(async (req) => {
  // Only the cron job (using the service role key) may call this —
  // never a student session, and never an anonymous request.
  const authHeader = req.headers.get("Authorization") || "";
  const callerKey = authHeader.replace("Bearer ", "");
  if (!SERVICE_ROLE_KEY || callerKey !== SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Not authorized." }, 401);
  }

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return jsonResponse({ error: "VAPID keys not configured — see schema-push-notifications.sql for setup steps." }, 500);
  }

  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    // Students who haven't been active today (or have never started a
    // streak, meaning last_active_date is null) and have a push
    // subscription on file.
    const today = new Date().toISOString().slice(0, 10);

    const { data: subs, error: subsErr } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth_key");
    if (subsErr) return jsonResponse({ error: subsErr.message }, 500);
    if (!subs || !subs.length) return jsonResponse({ sent: 0, message: "No subscriptions on file." });

    const userIds = [...new Set(subs.map(s => s.user_id))];
    const { data: streaks } = await supabaseAdmin
      .from("study_streaks")
      .select("user_id, last_active_date")
      .in("user_id", userIds);

    const activeToday = new Set(
      (streaks || []).filter(s => s.last_active_date === today).map(s => s.user_id)
    );

    const targets = subs.filter(s => !activeToday.has(s.user_id));

    const payload = JSON.stringify({
      title: "Time to study! 📚",
      body: "You haven't studied today yet — keep your streak alive.",
      url: "/classroom-dashboard.html"
    });

    let sent = 0;
    const deadEndpoints = [];

    await Promise.all(targets.map(async (sub) => {
      try {
        await webPush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
          payload
        );
        sent++;
      } catch (err) {
        // 404/410 means the browser unsubscribed or the subscription
        // expired — clean those up so we stop trying every day.
        if (err.statusCode === 404 || err.statusCode === 410) {
          deadEndpoints.push(sub.endpoint);
        }
      }
    }));

    if (deadEndpoints.length) {
      await supabaseAdmin.from("push_subscriptions").delete().in("endpoint", deadEndpoints);
    }

    return jsonResponse({ sent, skipped_active_today: activeToday.size, removed_dead: deadEndpoints.length });
  } catch (err) {
    return jsonResponse({ error: "Unexpected error: " + err.message }, 500);
  }
});
