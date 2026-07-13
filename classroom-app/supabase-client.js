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
