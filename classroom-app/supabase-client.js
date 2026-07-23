// =================================================================
// Supabase project config
// Get these from: Supabase dashboard → Project Settings → API
// =================================================================
const SUPABASE_URL = "https://ngxquexeuxafolikgqla.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5neHF1ZXhldXhhZm9saWtncWxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTE1OTAsImV4cCI6MjA5OTQ4NzU5MH0.84iekBvllk2WVJUo8TOZc4S4CpFTeCixbtKNwZuRvfs";

// Requires the Supabase CDN script to be loaded first:
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.supabaseClient = supabaseClient;

// The single admin account. Create this user for real inside
// Supabase Auth (dashboard → Authentication → Add user) with:
//   email:    adekunleadeniji360@gmail.com
//   password: Adewumi@123
// Never hardcode the password here — only the email is needed
// client-side, to check who's allowed into the admin panel.
const ADMIN_EMAIL = "adekunleadeniji360@gmail.com";

// ---- Shared helpers used by protected pages ----

// Call on any page a signed-in student/user must be on.
// Redirects to login.html if there's no session.
async function requireUser() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = "login.html";
    return null;
  }
  return session.user;
}

// Call on any page only the admin should reach.
// Redirects to admin-login.html if not signed in as the admin.
async function requireAdmin() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session || session.user.email !== ADMIN_EMAIL) {
    window.location.href = "admin-login.html";
    return null;
  }
  return session.user;
}

async function logout(redirectTo) {
  await supabaseClient.auth.signOut();
  window.location.href = redirectTo || "login.html";
}

// =================================================================
// Premium / paywall config
// =================================================================

// Your Paystack PUBLIC key (safe to expose in client code — this is
// how Paystack's checkout is designed to work). Get it from your
// Paystack dashboard -> Settings -> API Keys & Webhooks.
// The SECRET key never goes here — it only ever lives as a Supabase
// Edge Function secret (see verify-payment).
const PAYSTACK_PUBLIC_KEY = "pk_test_replace_with_your_public_key";
const GEMINI_API_KEY = "AQ.Ab8RN6LfvrNLB5S8YHcOnXdUqBvg3byGetklte3mClQ2B4bTVQ"
// Price per currency, in the currency's main unit (e.g. Naira, not
// kobo — the conversion to subunits happens automatically at
// checkout time). Only currencies enabled on your Paystack dashboard
// will actually work; NGN is enabled by default for most accounts.
const PREMIUM_PRICING = {
  NGN: 2000,
  USD: 3,
  GHS: 25,
  ZAR: 45,
  KES: 350
};

// Checks whether the currently signed-in user has unlocked premium
// content. Returns false (not throwing) if not signed in.
async function isPremiumUser() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) return false;

  if (!navigator.onLine) {
    // Offline — trust the last known value rather than locking a
    // paying user out just because they lost signal.
    if (window.offlineStore) {
      const cached = await window.offlineStore.getMeta("isPremium").catch(() => null);
      return !!cached;
    }
    return false;
  }

  try {
    const { data, error } = await supabaseClient
      .from("profiles")
      .select("is_premium")
      .eq("id", session.user.id)
      .single();
    if (error || !data) return false;
    const premium = !!data.is_premium;
    if (window.offlineStore) window.offlineStore.setMeta("isPremium", premium).catch(() => {});
    return premium;
  } catch (err) {
    // Network failure even though we appear online — fail safe.
    return false;
  }
}
