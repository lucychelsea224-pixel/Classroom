// =================================================================
// Supabase Edge Function: verify-payment
//
// This is the ONLY place a payment is trusted. Never unlock content
// based on what the browser claims happened — always confirm with
// Paystack's own server-to-server verify endpoint first.
//
// Works two ways:
//  1. Called directly by the client right after checkout closes,
//     with { reference } — gives the student an instant unlock.
//  2. Called by Paystack's webhook (POST from Paystack's servers)
//     when a "charge.success" event fires — this is the reliable
//     fallback in case the student closes the app before step 1
//     finishes, so a payment is never "lost".
//
// Either way, the actual unlock only happens after this function
// confirms the payment with Paystack directly.
// =================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-paystack-signature",
};

async function hmacSha512Hex(key, message) {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw", enc.encode(key), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function unlockUser(supabaseAdmin, userId, reference, amount, currency) {
  await supabaseAdmin.from("payments").upsert({
    user_id: userId,
    reference,
    amount,
    currency,
    status: "success"
  }, { onConflict: "reference" });

  await supabaseAdmin.from("profiles").update({
    is_premium: true,
    premium_unlocked_at: new Date().toISOString()
  }).eq("id", userId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const signature = req.headers.get("x-paystack-signature");
    const rawBody = await req.text();

    // ---- Mode 1: Paystack webhook ----
    if (signature) {
      const expected = await hmacSha512Hex(PAYSTACK_SECRET_KEY, rawBody);
      if (expected !== signature) {
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const event = JSON.parse(rawBody);
      if (event.event === "charge.success") {
        const { reference, amount, currency, customer, metadata } = event.data;
        const userId = metadata?.user_id;
        if (userId) {
          await unlockUser(supabaseAdmin, userId, reference, amount, currency);
        }
      }
      return new Response(JSON.stringify({ received: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // ---- Mode 2: direct call from the client after checkout ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing auth header");

    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !user) throw new Error("Not authenticated");

    const { reference } = JSON.parse(rawBody);
    if (!reference) throw new Error("Missing reference");

    // Ask Paystack directly whether this payment really succeeded —
    // this is the step that makes the whole thing trustworthy.
    const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` }
    });
    const verifyData = await verifyRes.json();

    if (!verifyRes.ok || verifyData.data?.status !== "success") {
      return new Response(JSON.stringify({ success: false, message: "Payment not confirmed yet." }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Only unlock for the account that's actually logged in and made
    // the call — never trust a user_id passed in the request body.
    await unlockUser(supabaseAdmin, user.id, reference, verifyData.data.amount, verifyData.data.currency);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
