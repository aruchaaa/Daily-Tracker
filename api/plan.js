import { get, set, del, upstashConfigured } from "./_upstash.js";

const DEVICES_KEY = "dt:devices";

function sanitizePlan(plan) {
  if (!Array.isArray(plan)) return null;
  const out = [];
  for (const e of plan) {
    if (!e || typeof e.id !== "string" || typeof e.at !== "number") continue;
    out.push({
      id: e.id,
      at: e.at,
      title: typeof e.title === "string" ? e.title : "Daily Tracker",
      body: typeof e.body === "string" ? e.body : "",
    });
  }
  return out;
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  if (!upstashConfigured()) {
    return res.status(500).json({ error: "upstash env not configured" });
  }

  const { deviceId, subscription, plan } = req.body || {};
  if (typeof deviceId !== "string" || !deviceId) {
    return res.status(400).json({ error: "deviceId required" });
  }
  const clean = sanitizePlan(plan);
  if (!clean) return res.status(400).json({ error: "plan must be an array" });

  try {
    // Keep the plan alive a couple of days past its last fire time.
    const now = Date.now();
    let ttlSeconds = Math.ceil((clean.length ? Math.max(0, clean[clean.length - 1].at - now) : 0) / 1000) + 2 * 86400;
    ttlSeconds = Math.min(Math.max(ttlSeconds, 3600), 31 * 86400);

    if (clean.length) {
      await set(`dt:plan:${deviceId}`, JSON.stringify(clean), ttlSeconds);
    } else {
      await del(`dt:plan:${deviceId}`);
    }

    if (subscription && typeof subscription.endpoint === "string") {
      await set(`dt:sub:${deviceId}`, JSON.stringify(subscription), 90 * 86400);
      // Register the device so the cron job knows whom to ping.
      let devices = [];
      try {
        devices = JSON.parse((await get(DEVICES_KEY)) || "[]");
      } catch (err) {
        devices = [];
      }
      if (!Array.isArray(devices)) devices = [];
      if (!devices.includes(deviceId)) {
        devices.push(deviceId);
        await set(DEVICES_KEY, JSON.stringify(devices), 365 * 86400);
      }
    } else {
      // subscription = null => device turned push off; drop it everywhere.
      await del(`dt:sub:${deviceId}`);
      await del(`dt:plan:${deviceId}`);
      let devices = [];
      try {
        devices = JSON.parse((await get(DEVICES_KEY)) || "[]");
      } catch (err) {
        devices = [];
      }
      if (Array.isArray(devices) && devices.includes(deviceId)) {
        devices = devices.filter((d) => d !== deviceId);
        await set(DEVICES_KEY, JSON.stringify(devices), 365 * 86400);
      }
    }
  } catch (err) {
    return res.status(500).json({ error: "upstash write failed: " + err.message });
  }

  res.json({ ok: true, planLength: clean.length });
};