// =================================================================
// Old-domain redirect
// The app moved from the free Cloudflare Pages subdomain to a real
// domain. Anyone with the old URL bookmarked/saved gets bounced to
// the same page on the new domain automatically, keeping the exact
// path/query/hash so deep links (e.g. a specific quiz) still work.
// =================================================================
(function () {
  const OLD_HOST = "classroom-33e.pages.dev";
  const NEW_HOST = "educlassroom.com.ng";
  if (window.location.hostname === OLD_HOST) {
    const newUrl = "https://" + NEW_HOST + window.location.pathname + window.location.search + window.location.hash;
    window.location.replace(newUrl);
  }
})();

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

// =================================================================
// Class levels (Primary 1-5, later JSS/SS) — a student's account can
// belong to more than one level, but premium unlock is tracked
// separately per level (paying for one doesn't unlock another).
// =================================================================

// All active class levels, publicly readable — used to build level
// switcher UI on signup, dashboard, etc.
async function getClassLevels() {
  try {
    const { data, error } = await supabaseClient
      .from("class_levels")
      .select("*")
      .eq("is_active", true)
      .order("display_order", { ascending: true });
    if (error || !data) return [];
    return data;
  } catch (err) {
    return [];
  }
}

// The subjects configured for a specific class level (replaces the
// old static subjects.js list — subjects can now differ per level).
async function getSubjectsForLevel(classLevelId) {
  try {
    const { data, error } = await supabaseClient
      .from("class_level_subjects")
      .select("*")
      .eq("class_level_id", classLevelId)
      .order("display_order", { ascending: true });
    if (error || !data) return [];
    return data.map(row => ({ id: row.subject_id, name: row.name, icon: row.icon }));
  } catch (err) {
    return [];
  }
}

// The subject list to actually show for a class level — prefers the
// database (so JSS/SS get their own real subjects instead of the
// Primary set, and any admin edits show up immediately) and falls back
// to the static list in subjects.js only if the database has nothing
// for that level yet, or the request fails (e.g. offline), so the app
// never renders a blank subject list.
async function getSubjects(classLevelId) {
  const fromDb = await getSubjectsForLevel(classLevelId);
  if (fromDb.length) return fromDb;
  return typeof SUBJECTS !== "undefined" ? SUBJECTS : [];
}

// The class level the student is currently viewing (stored on their
// profile). Defaults to 'primary-5' if never set.
async function getActiveClassLevel() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) return "primary-5";
  try {
    const { data, error } = await supabaseClient
      .from("profiles")
      .select("active_class_level")
      .eq("id", session.user.id)
      .single();
    if (error || !data) return "primary-5";
    return data.active_class_level || "primary-5";
  } catch (err) {
    return "primary-5";
  }
}

// Switches which class level the student is currently viewing.
async function setActiveClassLevel(classLevelId) {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) return false;
  const { error } = await supabaseClient
    .from("profiles")
    .update({ active_class_level: classLevelId })
    .eq("id", session.user.id);
  return !error;
}

// Every level a student is enrolled in, with their premium status
// for each — powers a "switch class" menu that also shows which
// levels are already unlocked.
async function getUserEnrollments() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) return [];
  try {
    const { data, error } = await supabaseClient
      .from("user_enrollments")
      .select("*")
      .eq("user_id", session.user.id);
    if (error || !data) return [];
    return data;
  } catch (err) {
    return [];
  }
}

// Makes sure the student has an enrollment row for a class level
// (e.g. the first time they switch to a level they haven't used
// before). Safe to call repeatedly — does nothing if already enrolled.
async function ensureEnrolled(classLevelId) {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) return;
  await supabaseClient
    .from("user_enrollments")
    .upsert({ user_id: session.user.id, class_level_id: classLevelId }, { onConflict: "user_id,class_level_id", ignoreDuplicates: true });
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

// Fallback prices, only used if the database can't be reached (e.g.
// offline, or before schema-pricing.sql has been run). The real,
// editable prices live in the pricing_settings table — change them
// from the admin panel's Pricing section, not here.
const PREMIUM_PRICING_FALLBACK = {
  NGN: { amount: 2000, symbol: "₦" },
  USD: { amount: 3, symbol: "$" },
  GHS: { amount: 25, symbol: "₵" },
  ZAR: { amount: 45, symbol: "R" },
  KES: { amount: 350, symbol: "KSh" }
};

// Fetches current pricing from the database. Returns an object like
// { NGN: { amount, symbol }, USD: { amount, symbol }, ... }.
// Works even for signed-out visitors (pricing is publicly readable),
// which is required for Paystack's compliance review.
async function getPricing() {
  try {
    const { data, error } = await supabaseClient.from("pricing_settings").select("*");
    if (error || !data || !data.length) return PREMIUM_PRICING_FALLBACK;
    const pricing = {};
    data.forEach(row => { pricing[row.currency] = { amount: Number(row.amount), symbol: row.symbol }; });
    return pricing;
  } catch (err) {
    return PREMIUM_PRICING_FALLBACK;
  }
}

// Checks whether the currently signed-in user has unlocked premium
// content FOR A SPECIFIC CLASS LEVEL. Pass the class level explicitly
// wherever possible; if omitted, falls back to their active level.
// Returns false (not throwing) if not signed in.
async function isPremiumUser(classLevelId) {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) return false;

  const level = classLevelId || await getActiveClassLevel();
  const cacheKey = "isPremium:" + level;

  if (!navigator.onLine) {
    // Offline — trust the last known value rather than locking a
    // paying user out just because they lost signal.
    if (window.offlineStore) {
      const cached = await window.offlineStore.getMeta(cacheKey).catch(() => null);
      return !!cached;
    }
    return false;
  }

  try {
    const { data, error } = await supabaseClient
      .from("user_enrollments")
      .select("is_premium")
      .eq("user_id", session.user.id)
      .eq("class_level_id", level)
      .maybeSingle();
    if (error || !data) return false;
    const premium = !!data.is_premium;
    if (window.offlineStore) window.offlineStore.setMeta(cacheKey, premium).catch(() => {});
    return premium;
  } catch (err) {
    // Network failure even though we appear online — fail safe.
    return false;
  }
}
