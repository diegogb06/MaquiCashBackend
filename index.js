// index.js
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const twilio = require("twilio")(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const app = express();
app.use(cors());
app.use(express.json()); // reemplaza body-parser

// ---- Memoria temporal de OTPs (número -> {code, expiresAt}) ----
const codes = new Map();

// Genera código de 6 dígitos
function generateCode(len = 6) {
  return Math.floor(Math.random() * 10 ** len)
    .toString()
    .padStart(len, "0");
}

// Valida formato E.164 (+[código país][número])
const E164 = /^\+[1-9]\d{6,14}$/;

// ---------- RUTA ROOT (health check) ----------
app.get("/", (_req, res) => {
  res.send("✅ MaquiCash Backend OK");
});

// ---------- SOLICITAR OTP (SMS o WhatsApp) ----------
app.post("/auth/request-otp", async (req, res) => {
  try {
    const { phone, via } = req.body; // via: "sms" | "whatsapp"
    if (!phone) return res.status(400).json({ ok: false, error: "Falta número" });

    const clean = phone.trim();
    if (!E164.test(clean)) {
      return res.status(400).json({ ok: false, error: "Formato inválido (+E.164)" });
    }

    const code = generateCode(6);
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 min
    codes.set(clean, { code, expiresAt });

    const body = `Tu código de verificación de ${process.env.APP_NAME || "MaquiCash"} es ${code}. No lo compartas.`;

    // Canal por defecto: SMS
    const useWhatsApp = (via || "").toLowerCase() === "whatsapp";
    const to = useWhatsApp ? `whatsapp:${clean}` : clean;
    const from = useWhatsApp
      ? (process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886")
      : (process.env.TWILIO_FROM || "");

    if (!from) {
      return res.status(500).json({ ok: false, error: "Remitente Twilio no configurado" });
    }

    const msg = await twilio.messages.create({ to, from, body });
    console.log(`[OTP] Enviado por ${useWhatsApp ? "WhatsApp" : "SMS"} a ${clean}. SID: ${msg.sid}`);

    return res.json({ ok: true });
  } catch (err) {
    console.error("❌ Error enviando OTP:", err?.message || err);
    return res.status(500).json({ ok: false, error: "Error enviando mensaje" });
  }
});

// ---------- VERIFICAR OTP ----------
app.post("/auth/verify-otp", (req, res) => {
  const { phone, code } = req.body;
  if (!phone || !code) return res.status(400).json({ ok: false, error: "Faltan datos" });

  const record = codes.get(phone.trim());
  if (!record) return res.status(400).json({ ok: false, error: "Código no solicitado" });

  if (Date.now() > record.expiresAt) {
    codes.delete(phone.trim());
    return res.status(400).json({ ok: false, error: "Código expirado" });
  }

  if (record.code !== String(code)) {
    return res.status(400).json({ ok: false, error: "Código incorrecto" });
  }

  codes.delete(phone.trim());
  return res.json({ ok: true });
});

// ---------- ARRANQUE ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});