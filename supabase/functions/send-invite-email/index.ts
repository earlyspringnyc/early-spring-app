import "@supabase/functions-js/edge-runtime.d.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = "Morgan by Early Spring <noreply@morgan.earlyspring.nyc>";
const APP_URL = "https://morgan.earlyspring.nyc";

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, content-type, apikey",
      },
    });
  }

  try {
    const { email, orgName, inviterName, role } = await req.json();

    if (!email || !orgName) {
      return new Response(JSON.stringify({ error: "Missing email or orgName" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const roleLabel = role || "team member";
    const subject = `You've been invited to join ${orgName} on Morgan`;

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#0A0A0D;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:48px 24px;">
    <div style="margin-bottom:32px;">
      <span style="font-size:20px;font-weight:700;color:#F5F0E8;letter-spacing:-0.03em;">Morgan</span>
      <span style="font-size:11px;color:#6B6B6B;margin-left:8px;">by Early Spring</span>
    </div>
    <h1 style="font-size:22px;font-weight:600;color:#F5F0E8;margin:0 0 16px;line-height:1.3;">
      You've been invited to join ${orgName}
    </h1>
    <p style="font-size:15px;color:#94A3B8;line-height:1.6;margin:0 0 8px;">
      ${inviterName || "Someone"} has invited you to join <strong style="color:#F5F0E8;">${orgName}</strong> as a ${roleLabel} on Morgan — a production management tool by Early Spring.
    </p>
    <p style="font-size:15px;color:#94A3B8;line-height:1.6;margin:0 0 32px;">
      Create an account or sign in to get started.
    </p>
    <a href="${APP_URL}" style="display:inline-block;padding:14px 32px;background:#F5F0E8;color:#0A0A0D;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">
      Accept Invitation
    </a>
    <p style="font-size:12px;color:#4A4A4A;margin-top:40px;line-height:1.5;">
      If you weren't expecting this invitation, you can ignore this email.
    </p>
  </div>
</body>
</html>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: email,
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error("Resend error:", errBody);
      return new Response(JSON.stringify({ error: "Failed to send email" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const result = await res.json();
    return new Response(JSON.stringify({ success: true, id: result.id }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (e) {
    console.error("Edge function error:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
