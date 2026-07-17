// =================================================================
// Supabase Edge Function: send-score-email (Strict Mode Production)
// =================================================================

const SERVICE_ID = Deno.env.get("EMAILJS_SERVICE_ID");
const TEMPLATE_ID = Deno.env.get("EMAILJS_TEMPLATE_ID");
const PUBLIC_KEY = Deno.env.get("EMAILJS_PUBLIC_KEY");
const SECRET_KEY = Deno.env.get("EMAILJS_SECRET_KEY"); // Added for Strict Mode

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ENCOURAGEMENT_MESSAGES = [
  "Every expert was once a beginner. Take another look at this topic and try again — you've got this!",
  "This score is just a starting point, not a verdict. Go over the areas you missed, and come back stronger.",
  "Mistakes are proof you're trying. Review the notes for this subject and give it another shot."
];

const GOOD_JOB_MESSAGES = [
  "Solid work! Keep this momentum going into your next subject.",
  "Nice job — your practice is paying off. Keep it up!"
];

function pickRandom(list: string[]) {
  return list[Math.floor(Math.random() * list.length)];
}

function buildEmailHtml({ fullName, subjectName, testNumber, correct, total, percent, message }: any) {
  const greetingName = fullName ? fullName.split(" ")[0] : "there";
  const color = percent < 30 ? "#c65b5b" : "#4c8a52";
  return `
  <div style="font-family:sans-serif; background:#2d2d2d; padding:32px 16px;">
    <div style="max-width:480px; margin:0 auto; background:#3d3d3d; border-radius:12px; padding:28px 24px; color:#f4f2ee;">
      <h2 style="margin:0 0 4px; font-size:20px;">Hi ${greetingName},</h2>
      <p style="color:#b7b3ab; font-size:14px; margin:0 0 24px;">Here's how you did on your latest test.</p>
      <div style="text-align:center; background:#2d2d2d; border-radius:10px; padding:22px; margin-bottom:20px;">
        <div style="font-size:13px; color:#b7b3ab; text-transform:uppercase;">${subjectName} · Test ${testNumber}</div>
        <div style="font-size:36px; font-weight:700; margin:8px 0 2px; color:${color};">${correct} / ${total}</div>
        <div style="font-size:14px; color:#b7b3ab;">${percent}% correct</div>
      </div>
      <p style="font-size:14.5px; line-height:1.6;">${message}</p>
    </div>
  </div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { email, fullName, subjectName, testNumber, correct, total, percent } = body;

    if (!email || !subjectName || correct === undefined || total === undefined || percent === undefined) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const message = percent < 30 ? pickRandom(ENCOURAGEMENT_MESSAGES) : pickRandom(GOOD_JOB_MESSAGES);
    const htmlContent = buildEmailHtml({ fullName, subjectName, testNumber, correct, total, percent, message });

    const payload = {
      service_id: SERVICE_ID,
      template_id: TEMPLATE_ID,
      user_id: PUBLIC_KEY,
      accessToken: SECRET_KEY, // Authorizes the strict mode request securely
      template_params: {
        to_email: email,
        subject_title: `Your ${subjectName} test result: ${correct}/${total}`,
        htmlContent: htmlContent
      }
    };

    const emailRes = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!emailRes.ok) {
      const errorText = await emailRes.text();
      throw new Error(`EmailJS failed: ${errorText}`);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err: any) {
    console.error("CRITICAL FUNCTION ERROR:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});