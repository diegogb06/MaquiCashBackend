// index.js
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
require("dotenv").config();

const twilio = require("twilio")(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Mapa temporal para guardar códigos OTP
const codes = new Map();

// Función para generar código aleatorio
function generateCode(length = 6) {
  return Math.floor(Math.random() * 10 ** length)
    .toString()
    .padStart(length, "0");
}

// === RUTA PRINCIPAL ===
app.get("/", (_req, res) => {
  res.send("✅ MaquiCash Backend funcionando correctamente");
});

// === ENVIAR OTP (SMS o WhatsApp) ===
app.post("/auth/request-otp", async (req, res) => {
  const { phone, via } = req.body; // via puede ser "sms" o "whatsapp"

  if (!phone) return res.status(400).json({ ok: false, error: "Falta número" });

  // Validar formato del número
  const cleanPhone = phone.trim();
  if (!/^\+[1-9]\d{6,14}$/.test(cleanPhone)) {
    return res.status(400).json({ ok: false, error: "Formato inválido (+E.164)" });
  }

  // Generar código y guardar temporalmente
  const code = generateCode(6);
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutos
  codes.set(cleanPhone, { code, expiresAt });

  const msg = `Tu codigo de verificacion de MaquiCash es ${code}. No lo compartas.`;

  try {
    if (via === "whatsapp") {
      // Enviar por WhatsApp (sandbox)
      await twilio.messages.create({
        from: "whatsapp:+14155238886", // número de sandbox Twilio
        to: `whatsapp:${cleanPhone}`,
        body: msg,
      });
      console.log(`[OTP] Enviado por WhatsApp a ${cleanPhone}`);
    } else {
      // Enviar por SMS normal
      await twilio.messages.create({
        from: process.env.TWILIO_FROM, // tu número de Twilio SMS
        to: cleanPhone,
        body: msg,
      });
      console.log(`[OTP] Enviado por SMS a ${cleanPhone}`);
    }

    res.json({ ok: true });
  } catch (error) {
    console.error("❌ Error enviando OTP:", error.message);
    res.status(500).json({ ok: false, error: "Error enviando mensaje" });
  }
});

// === VERIFICAR OTP ===
app.post("/auth/verify-otp", (req, res) => {
  const { phone, code } = req.body;
  if (!phone || !code) return res.status(400).json({ ok: false, error: "Faltan datos" });

  const record = codes.get(phone);
  if (!record) return res.status(400).json({ ok: false, error: "Código no solicitado" });

  if (Date.now() > record.expiresAt) {
    codes.delete(phone);
    return res.status(400).json({ ok: false, error: "Código expirado" });
  }

  if (record.code !== code) {
    return res.status(400).json({ ok: false, error: "Código incorrecto" });
  }

  codes.delete(phone);
  res.json({ ok: true });
});

// === SERVIDOR ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});