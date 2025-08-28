import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient } from "mongodb";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.set("trust proxy", true); // สำคัญบน Render/Proxy เพื่ออ่าน IP จริงจาก X-Forwarded-For

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || "";
const MONGODB_DB = process.env.MONGODB_DB || "weather";
let mongo = null;
let logsCol = null;

// ต่อ MongoDB เฉพาะเมื่อมี URI (ถ้าใช้ Render + MongoDB Atlas ค่อยใส่ .env ในแดชบอร์ด)
if (MONGODB_URI) {
  try {
    mongo = new MongoClient(MONGODB_URI);
    await mongo.connect();
    const db = mongo.db(MONGODB_DB);
    logsCol = db.collection("weather_logs");
    console.log("[mongo] connected");
  } catch (e) {
    console.error("[mongo] connect error:", e.message);
  }
}

// ดึง IP ลูกค้าแบบปลอดภัย
function getClientIp(req) {
  // x-forwarded-for อาจเป็น "ip1, ip2, ip3"
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    return xff.split(",")[0].trim();
  }
  // req.ip อาจเป็น "::ffff:1.2.3.4"
  return (req.ip || "").replace("::ffff:", "");
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get("/api/weather", async (req, res) => {
  try {
    const clientIp = getClientIp(req);
    // ถ้าได้ IP จริง ใช้ /<ip>/json, ถ้าไม่มีก็ใช้ /json (จะเป็น IP ของเซิร์ฟเวอร์)
    const ipapiUrl = clientIp
      ? `https://ipapi.co/${clientIp}/json/`
      : "https://ipapi.co/json/";

    const ipResp = await fetch(ipapiUrl, { headers: { "user-agent": "blueaomweather" }});
    const ipData = await ipResp.json();

    const lat = Number(ipData.latitude) || 13.736;  // default Bangkok
    const lon = Number(ipData.longitude) || 100.523;
    const loc = {
      ip: clientIp || ipData.ip || null,
      city: ipData.city || null,
      region: ipData.region || ipData.region_code || null,
      country: ipData.country_name || ipData.country || null,
      lat,
      lon
    };

    // เรียก Open-Meteo: current + daily ย้อนหลัง 5 วัน (รวมวันนี้)
    const params = new URLSearchParams({
      latitude: lat.toString(),
      longitude: lon.toString(),
      timezone: "auto",
      current: "temperature_2m,relative_humidity_2m,wind_speed_10m",
      daily: "temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max",
      past_days: "5",
      forecast_days: "1"
    });

    const omUrl = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
    const omResp = await fetch(omUrl);
    if (!omResp.ok) throw new Error(`Open-Meteo HTTP ${omResp.status}`);
    const omData = await omResp.json();

    const payload = {
      fetchedAt: new Date().toISOString(),
      location: loc,
      sources: {
        geolocation: ipapiUrl,
        weather: omUrl
      },
      current: omData.current || null,
      daily: omData.daily || null,
      units: {
        current: omData.current_units || null,
        daily: omData.daily_units || null
      }
    };

    // บันทึก log ลง Mongo (ถ้ามี)
    if (logsCol) {
      try { await logsCol.insertOne(payload); } catch (e) { /* ignore */ }
    }

    res.json(payload);
  } catch (e) {
    console.error("[/api/weather] error:", e);
    res.status(500).json({ error: "failed_to_fetch_weather", message: e.message });
  }
});

// อ่านรายการล่าสุดจาก Mongo (ถ้ามี)
app.get("/api/latest", async (_req, res) => {
  if (!logsCol) return res.json({ ok: true, data: null, note: "no_database_connected" });
  const doc = await logsCol.find().sort({ _id: -1 }).limit(1).toArray();
  res.json({ ok: true, data: doc[0] || null });
});

// เสิร์ฟไฟล์หน้าเว็บ
app.use(express.static("public"));

app.listen(PORT, () => {
  console.log(`BlueAom Weather running on port ${PORT}`);
});
