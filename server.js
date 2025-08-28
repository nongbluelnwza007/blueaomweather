import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";
import { MongoClient } from "mongodb";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ให้ Express เชื่อ proxy เพื่ออ่าน IP จาก x-forwarded-for ได้
app.set("trust proxy", true);

// เสิร์ฟไฟล์ static
app.use(cors());
app.use(express.static("public"));

// ==== (ตัวเลือก) MongoDB ====
let mongoClient = null;
let mongoCol = null;

async function initMongo() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB || "weather";
  if (!uri) return; // ไม่ตั้งค่า = ไม่ใช้ Mongo ก็ได้

  mongoClient = new MongoClient(uri);
  await mongoClient.connect();
  mongoCol = mongoClient.db(dbName).collection("observations");
  console.log("✅ Connected MongoDB");
}
initMongo().catch(e => console.error("Mongo init error:", e.message));

// ==== Utilities ====
function getClientIp(req) {
  // priority: x-forwarded-for (หลัง proxy) -> socket.remoteAddress
  const xf = req.headers["x-forwarded-for"];
  const ip = Array.isArray(xf) ? xf[0] : (xf || req.socket.remoteAddress || "");
  return ip.split(",")[0].trim().replace("::ffff:", "");
}

async function geoFromIp(ip) {
  // ระบุตำแหน่งจาก IP: ipapi.co (ฟรี/ไม่ต้อง API key)
  try {
    const url = ip ? `https://ipapi.co/${ip}/json/` : `https://ipapi.co/json/`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`ipapi ${r.status}`);
    const j = await r.json();
    const lat = Number(j.latitude);
    const lon = Number(j.longitude);
    const city = j.city || j.region || j.country_name || "ตำแหน่งปัจจุบัน";
    if (!lat || !lon) throw new Error("no lat/lon");
    return { lat, lon, city };
  } catch {
    // fallback กรุงเทพฯ
    return { lat: 13.7563, lon: 100.5018, city: "Bangkok (fallback)" };
  }
}

async function fetchOpenMeteo(lat, lon) {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&timezone=Asia%2FBangkok` +
    `&current=temperature_2m,wind_speed_10m,relative_humidity_2m` +
    `&hourly=temperature_2m,relative_humidity_2m,precipitation,cloud_cover`;

  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Open-Meteo error: ${r.status}`);
  return r.json();
}

// ==== API ====

/**
 * แบบเดิม: ระบุพิกัดเองผ่าน query (ยังใช้งานได้)
 * /api/weather?lat=..&lon=..&city=..
 */
app.get("/api/weather", async (req, res) => {
  try {
    const lat = Number(req.query.lat ?? 13.7563);
    const lon = Number(req.query.lon ?? 100.5018);
    const city = String(req.query.city ?? "Bangkok");

    const data = await fetchOpenMeteo(lat, lon);

    const doc = {
      location: { name: city, lat, lon },
      fetchedAt: new Date(),
      current: data.current,
      hourly: data.hourly,
      raw: data,
    };

    if (mongoCol) await mongoCol.insertOne(doc);
    res.json(doc);
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * ใหม่: ใช้ IP ผู้ใช้ → หา lat/lon → เรียก Open-Meteo
 * ไม่ต้องขอสิทธิ์ตำแหน่งจากเบราว์เซอร์
 */
app.get("/api/weather/by-ip", async (req, res) => {
  try {
    const ip = getClientIp(req);
    const { lat, lon, city } = await geoFromIp(ip);
    const data = await fetchOpenMeteo(lat, lon);

    const doc = {
      location: { name: city, lat, lon },
      fetchedAt: new Date(),
      current: data.current,
      hourly: data.hourly,
      raw: data,
    };

    if (mongoCol) await mongoCol.insertOne(doc);
    res.json(doc);
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * อ่านเอกสารล่าสุดจาก MongoDB (ถ้าเปิดใช้)
 */
app.get("/api/latest", async (req, res) => {
  try {
    if (!mongoCol) return res.json(null);
    const latest = await mongoCol.find().sort({ fetchedAt: -1 }).limit(1).toArray();
    res.json(latest[0] ?? null);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ==== Start server ====
app.listen(PORT, () => {
  console.log(`🚀 Server on http://localhost:${PORT}`);
  console.log(`   Static  -> http://localhost:${PORT}/`);
  console.log(`   By IP   -> http://localhost:${PORT}/api/weather/by-ip`);
});
