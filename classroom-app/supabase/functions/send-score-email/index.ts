// =================================================================
// Supabase Edge Function: send-score-email
//
// Called from quiz.html right after a test is graded. Sends the
// student an email with their score, and — if they scored below
// 30% — a random line of encouragement instead of a plain number.
//
// Requires a RESEND_API_KEY secret (see deployment notes below).
// =================================================================

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("SCORE_EMAIL_FROM") || "Classroom <onboarding@resend.dev>";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Shown when the score is below 30%
const ENCOURAGEMENT_MESSAGES = [
  "Every expert was once a beginner. Take another look at this topic and try again — you've got this!",
  "This score is just a starting point, not a verdict. Go over the areas you missed, and come back stronger.",
  "Mistakes are proof you're trying. Review the notes for this subject and give it another shot.",
  "One test doesn't define you. Take a short break, revisit the topic, and try again when you're ready.",
  "Progress isn't always a straight line. Keep practicing — small steps add up to big results.",
  "You showed up and tried, and that matters. Go back over the tricky questions and try once more.",
  "Every wrong answer teaches you something a right one can't. Use it, then try again.",
  "Great learners are made through practice, not perfection. Take another pass at this subject.",
  "This is a chance to learn, not a final judgment. Review, breathe, and give it another attempt.",
  "Growth happens right at the edge of what feels hard. Stick with it — you're closer than you think."
];

const GOOD_JOB_MESSAGES = [
  "Solid work! Keep this momentum going into your next subject.",
  "Nice job — your practice is paying off. Keep it up!",
  "Well done! A little more practice and you'll be even stronger.",
  "Great effort! You're clearly putting in the work."
];

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function buildEmailHtml({ fullName, subjectName, testNumber, correct, total, percent, message }) {
  const greetingName = fullName ? fullName.split(" ")[0] : "there";
  const color = percent < 30 ? "#c65b5b" : "#4c8a52";
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif; background:#2d2d2d; padding:32px 16px;">
    <div style="max-width:480px; margin:0 auto; background:#3d3d3d; border-radius:12px; padding:28px 24px; color:#f4f2ee;">
      <h2 style="margin:0 0 4px; font-size:20px;">Hi ${escapeHtml(greetingName)},</h2>
      <p style="color:#b7b3ab; font-size:14px; margin:0 0 24px;">Here's how you did on your latest test.</p>
      <div style="text-align:center; background:#2d2d2d; border-radius:10px; padding:22px; margin-bottom:20px;">
        <div style="font-size:13px; color:#b7b3ab; text-transform:uppercase; letter-spacing:0.04em;">${escapeHtml(subjectName)} · Test ${testNumber}</div>
        <div style="font-size:36px; font-weight:700; margin:8px 0 2px; color:${color};">${correct} / ${total}</div>
        <div style="font-size:14px; color:#b7b3ab;">${percent}% correct</div>
      </div>
      <p style="font-size:14.5px; line-height:1.6; color:#f4f2ee;">${escapeHtml(message)}</p>
      <p style="font-size:12px; color:#857f75; margin-top:28px;">You're receiving this because you completed a test on Classroom. If this wasn't you, please contact us at classroomcareservice@gmail.com.</p>
    </div>
  </div>`;
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured on this function.");
    }

    const { email, fullName, subjectName, testNumber, correct, total, percent } = await req.json();

    if (!email || !subjectName || correct === undefined || total === undefined || percent === undefined) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const message = percent < 30 ? pickRandom(ENCOURAGEMENT_MESSAGES) : pickRandom(GOOD_JOB_MESSAGES);

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [email],
        subject: `Your ${subjectName} test result: ${correct}/${total}`,
        html: buildEmailHtml({ fullName, subjectName, testNumber, correct, total, percent, message })
      })
    });

    const result = await emailRes.json();
    if (!emailRes.ok) {
      throw new Error(result?.message || "Resend API request failed");
    }

    return new Response(JSON.stringify({ ok: true, message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
