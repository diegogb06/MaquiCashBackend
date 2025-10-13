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

const codes = new Map(); // Guardará temporalmente los códigos (por número)

function generateCode(length = 6) {
  return Math.floor(Math.random() * 10 ** length)
    .toString()
    .padStart(length, "0");
}

app.post("/auth/request-otp", async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: "Falta número" });

  const code = generateCode(6);
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutos
  codes.set(phone, { code, expiresAt });

  try {
    await twilio.messages.create({
      to: phone,
      from: process.env.TWILIO_FROM,
      body: `Tu código de verificación de ${process.env.APP_NAME} es ${code}. No lo compartas.`,
    });
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error enviando SMS" });
  }
});

app.post("/auth/verify-otp", (req, res) => {
  const { phone, code } = req.body;
  const record = codes.get(phone);
  if (!record) return res.status(400).json({ error: "Código no solicitado" });
  if (Date.now() > record.expiresAt) {
    codes.delete(phone);
    return res.status(400).json({ error: "Código expirado" });
  }
  if (record.code !== code) {
    return res.status(400).json({ error: "Código incorrecto" });
  }
  codes.delete(phone);
  res.json({ ok: true });
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`Servidor corriendo en http://localhost:${process.env.PORT}`);
});