// supabase/functions/gesicht-alert/index.ts
// Deployment: supabase functions deploy gesicht-alert

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SMTP_HOST = Deno.env.get("SMTP_HOST") ?? "smtp.ionos.de";
const SMTP_PORT = parseInt(Deno.env.get("SMTP_PORT") ?? "587");
const SMTP_USER = Deno.env.get("SMTP_USER") ?? ""; // deine@ionos-mail.de
const SMTP_PASS = Deno.env.get("SMTP_PASS") ?? "";
const ALERT_TO  = Deno.env.get("ALERT_TO")  ?? ""; // Empfänger (du)
const ALERT_FROM = Deno.env.get("ALERT_FROM") ?? SMTP_USER;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const { mitarbeiter_id, name, aehnlichkeit, foto_pfad, geraete_id } = await req.json();

  // Signed URL für das Beweisfoto generieren (1h gültig)
  let fotoUrl = "";
  try {
    const res = await fetch(
      `${SUPABASE_URL}/storage/v1/object/sign/verdaechtig/${foto_pfad}`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ expiresIn: 3600 }),
      }
    );
    const json = await res.json();
    fotoUrl = `${SUPABASE_URL}/storage/v1${json.signedURL}`;
  } catch (_) { /* Foto-URL optional */ }

  const prozent = Math.round((aehnlichkeit ?? 0) * 100);
  const jetzt = new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin" });

  const htmlBody = `
<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:#1a5c2a;color:white;padding:20px;border-radius:8px 8px 0 0;">
    <h2 style="margin:0">⚠️ Verdächtige Anmeldung – Pflegehaus am Schloss</h2>
  </div>
  <div style="border:1px solid #e0e0e0;border-top:none;padding:20px;border-radius:0 0 8px 8px;">
    <p><strong>Zeitpunkt:</strong> ${jetzt}</p>
    <p><strong>Mitarbeiter:</strong> ${name}</p>
    <p><strong>Gesichtsübereinstimmung:</strong> ${prozent}% 
       (Schwellwert: 60%)</p>
    <p><strong>Gerät:</strong> ${geraete_id ?? "–"}</p>
    ${fotoUrl ? `
    <p><strong>Aufgenommenes Foto:</strong></p>
    <a href="${fotoUrl}" style="display:inline-block;background:#1a5c2a;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;">
      📷 Foto ansehen (1h gültig)
    </a>` : ""}
    <hr style="margin:20px 0;border:none;border-top:1px solid #eee;">
    <p style="color:#666;font-size:12px;">
      Du kannst den Eintrag im Admin-Bereich unter 
      <strong>Übersicht → Gesichts-Log</strong> einsehen.
    </p>
  </div>
</body>
</html>`;

  // Mail via SMTP senden (Deno SMTP)
  try {
    const { SmtpClient } = await import("https://deno.land/x/smtp@v0.7.0/mod.ts");
    const client = new SmtpClient();
    await client.connectTLS({
      hostname: SMTP_HOST,
      port: SMTP_PORT,
      username: SMTP_USER,
      password: SMTP_PASS,
    });
    await client.send({
      from: ALERT_FROM,
      to: ALERT_TO,
      subject: `⚠️ Auffällige Anmeldung: ${name} (${prozent}% Übereinstimmung)`,
      content: `Auffällige Anmeldung von ${name} um ${jetzt}. Übereinstimmung: ${prozent}%.`,
      html: htmlBody,
    });
    await client.close();
  } catch (e) {
    console.error("SMTP Fehler:", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
