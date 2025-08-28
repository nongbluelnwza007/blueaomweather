/* global Chart, L */
const $ = (id) => document.getElementById(id);
$("year").textContent = new Date().getFullYear();

let chart;

document.addEventListener("DOMContentLoaded", () => {
  loadWeather();
});

async function loadWeather() {
  try {
    $("loc").textContent = "กำลังดึงข้อมูล…";
    $("time").textContent = "";
    $("coord").textContent = "";

    const resp = await fetch("/api/weather", { cache: "no-store" });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const doc = await resp.json();

    renderNow(doc);
    renderDaily(doc);
    renderChart(doc);
    renderMap(doc);
  } catch (e) {
    console.error(e);
    $("loc").textContent = "ดึงข้อมูลไม่สำเร็จ";
    $("time").textContent = e.message || "unknown error";
  }
}

function renderNow(doc) {
  const d = doc.current || {};
  const loc = doc.location || {};

  $("loc").textContent = [loc.city, loc.region, loc.country].filter(Boolean).join(", ") || "Unknown location";
  $("time").textContent = new Date(doc.fetchedAt).toLocaleString();
  $("coord").textContent = (loc.lat && loc.lon) ? `(${loc.lat.toFixed(4)}, ${loc.lon.toFixed(4)})` : "";

  $("temp").textContent = (d.temperature_2m ?? "--") + "°C";
  $("humi").textContent = d.relative_humidity_2m ?? "-";
  $("wind").textContent = d.wind_speed_10m ?? "-";
}

function renderDaily(doc) {
  const daysEl = $("days");
  daysEl.innerHTML = "";

  const daily = doc.daily || {};
  if (!daily.time) return;

  // Open-Meteo จะส่งมา 6 วัน (ย้อนหลัง 5 + วันนี้) → แสดงเฉพาะย้อนหลัง 5 วัน
  const times = daily.time.slice(0, -1);
  const tmax = (daily.temperature_2m_max || []).slice(0, -1);
  const tmin = (daily.temperature_2m_min || []).slice(0, -1);
  const prcp = (daily.precipitation_sum || []).slice(0, -1);
  const wmax = (daily.wind_speed_10m_max || []).slice(0, -1);

  times.forEach((iso, i) => {
    const el = document.createElement("div");
    el.className = "day";
    el.innerHTML = `
      <h4>${fmtDay(iso)}</h4>
      <div class="temps">
        <span class="max">${fmtNum(tmax[i])}°</span>
        <span class="min">/${fmtNum(tmin[i])}°</span>
      </div>
      <div class="muted">💧 ฝนรวม: ${fmtNum(prcp[i])} mm</div>
      <div class="muted">🌬️ ลมสูงสุด: ${fmtNum(wmax[i])} m/s</div>
    `;
    daysEl.appendChild(el);
  });
}

function renderChart(doc) {
  const daily = doc.daily || {};
  if (!daily.time) return;

  const labels = daily.time.slice(0, -1).map(fmtLabel);
  const tmax = (daily.temperature_2m_max || []).slice(0, -1);
  const tmin = (daily.temperature_2m_min || []).slice(0, -1);

  const ctx = document.getElementById("chart");
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "อุณหภูมิสูงสุด (°C)", data: tmax, tension: .35 },
        { label: "อุณหภูมิต่ำสุด (°C)", data: tmin, tension: .35 }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: "#e5e7eb" } }
      },
      scales: {
        x: { ticks: { color: "#94a3b8" }, grid: { color: "#1f2937" } },
        y: { ticks: { color: "#94a3b8" }, grid: { color: "#1f2937" } }
      }
    }
  });
}

function renderMap(doc) {
  // ป้องกันเคสที่ Leaflet ยังไม่โหลด
  if (typeof L === "undefined") {
    console.error("Leaflet not loaded");
    return;
  }
  const loc = doc.location || {};
  const lat = loc.lat || 13.736;
  const lon = loc.lon || 100.523;

  const map = L.map("map", { zoomControl: true }).setView([lat, lon], 11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);
  L.marker([lat, lon]).addTo(map).bindPopup(`${loc.city || "ตำแหน่งของคุณ"}`);

  // เผื่อ container render ช้า → บังคับคำนวณขนาดใหม่
  setTimeout(() => map.invalidateSize(), 300);
}

function fmtNum(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "-";
  return Math.round(Number(n));
}
function fmtDay(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("th-TH", { weekday: "short", day: "2-digit", month: "short" });
}
function fmtLabel(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("th-TH", { day: "2-digit", month: "short" });
}
