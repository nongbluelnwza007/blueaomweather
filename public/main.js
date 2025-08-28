function showLoading(on = true, msg = "กำลังดึงข้อมูล…") {
  const ld = document.getElementById("loading");
  const txt = document.getElementById("loadingText");
  const ct = document.getElementById("content");
  ld.style.display = on ? "flex" : "none";
  if (txt) txt.textContent = " " + msg;
  ct.style.display = on ? "none" : "block";
}

function render(doc) {
  showLoading(false);

  const loc = `${doc?.location?.name ?? "ตำแหน่งปัจจุบัน"}`;
  const fetched = doc?.fetchedAt ? new Date(doc.fetchedAt).toLocaleString() : "-";
  const temp = Math.round(doc?.current?.temperature_2m ?? 0);
  const wind = doc?.current?.wind_speed_10m ?? "-";
  const humi = doc?.current?.relative_humidity_2m ?? "-";
  const coord = `${doc?.location?.lat}, ${doc?.location?.lon}`;

  document.getElementById("loc").textContent = loc;
  document.getElementById("time").textContent = `อัปเดต: ${fetched}`;
  document.getElementById("temp").textContent = `${temp}°C`;
  document.getElementById("wind").textContent = wind;
  document.getElementById("humi").textContent = humi;
  document.getElementById("coord").textContent = coord;
}

async function fetchByIp() {
  showLoading(true, "กำลังดึงข้อมูลจากตำแหน่ง IP ของคุณ…");
  const r = await fetch("/api/weather/by-ip");
  if (!r.ok) throw new Error("API error");
  const j = await r.json();
  render(j);
}

async function fetchLatest() {
  showLoading(true, "กำลังอ่านข้อมูลล่าสุดจากฐานข้อมูล…");
  const r = await fetch("/api/latest");
  const j = await r.json();
  showLoading(false);
  if (!j) {
    alert("ยังไม่มีข้อมูลในฐานข้อมูล ลองกด “ดูสภาพอากาศตอนนี้” ก่อนครับ");
    return;
  }
  render(j);
}

document.getElementById("btnNow").addEventListener("click", () => {
  fetchByIp().catch(err => {
    showLoading(false);
    alert("ดึงข้อมูลไม่สำเร็จ: " + err.message);
  });
});

document.getElementById("btnLatest").addEventListener("click", () => {
  fetchLatest().catch(err => {
    showLoading(false);
    alert("อ่าน DB ไม่สำเร็จ: " + err.message);
  });
});
