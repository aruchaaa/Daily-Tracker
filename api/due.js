import webpush from "web-push";
import { get, set, del, upstashConfigured } from "./_upstash.js";

const DEVICES_KEY = "dt:devices";
const TTL_SECONDS = 31 * 86400;

function authorize(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // not configured -> open (best-effort testing)
  const auth = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  return auth === secret;
}

async function sendTo(sub, payload) {
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload));
    return { sent: true };
  } catch (err) {
    // 404/410 -> subscription is dead (browser unsubscribed); drop it.
    if (err && err.statusCode && (err.statusCode === 404 || err.statusCode === 410)) {
      return { sent: false, stale: true, detail: err.statusCode };
    }
    return { sent: false, stale: false, detail: err.statusCode || err.message };
  }
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  if (!upstashConfigured()) {
    return res.status(500).json({ error: "upstash env not configured" });
  }
  const testDevice = typeof req.query.test === "string" ? req.query.test : null;
  if (testDevice) {
    // Manual test path: no auth required — the device id acts as a token.
    const sub = await get(`dt:sub:${testDevice}`);
    if (!sub) return res.status(404).json({ error: "no subscription for that device" });

    const vapidPub = process.env.VAPID_PUBLIC_KEY;
    const vapidPriv = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;
    if (!vapidPub || !vapidPriv || !subject) {
      return res.status(500).json({ error: "VAPID env not configured" });
    }
    webpush.setVapidDetails(subject, vapidPub, vapidPriv);

    const subObj = JSON.parse(sub);
    const outcome = await sendTo(subObj, {
      title: "Daily Tracker",
      body: "Test notification \u2014 if you\u2019re seeing this, push is working.",
      id: `test_${testDevice}`,
      url: "/",
    });
    return res.json({ test: true, sent: outcome.sent, stale: outcome.stale, detail: outcome.detail || null });
  }

  if (!authorize(req, res)) return res.status(401).json({ error: "unauthorized" });

  const vapidPub = process.env.VAPID_PUBLIC_KEY;
  const vapidPriv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!vapidPub || !vapidPriv || !subject) {
    return res.status(500).json({ error: "VAPID env not configured" });
  }
  webpush.setVapidDetails(subject, vapidPub, vapidPriv);

  try {
    const now = Date.now();
    let devices = [];
    try {
      devices = JSON.parse((await get(DEVICES_KEY)) || "[]");
    } catch (err) {
      devices = [];
    }
    if (!Array.isArray(devices)) devices = [];

    const results = { devices: devices.length, sent: 0, failed: 0, stale: 0, ok: true };

    for (const deviceId of devices) {
      const subRaw = await get(`dt:sub:${deviceId}`);
      if (!subRaw) continue;
      const planRaw = await get(`dt:plan:${deviceId}`);
      if (!planRaw) continue;

      let plan = [];
      try {
        plan = JSON.parse(planRaw);
      } catch (err) {
        continue;
      }
      if (!Array.isArray(plan)) continue;

      const due = plan.filter((e) => e && typeof e.at === "number" && e.at <= now);
      const remaining = plan.filter((e) => e && (!(typeof e.at === "number" && e.at <= now)));
      if (!due.length) continue;

      const subObj = JSON.parse(subRaw);
      let dirty = false;
      for (const e of due) {
        const outcome = await sendTo(subObj, {
          title: e.title || "Daily Tracker",
          body: e.body || "",
          id: e.id,
          url: "/",
        });
        if (outcome.sent) results.sent++;
        else if (outcome.stale) { results.stale++; dirty = true; }
        else { results.failed++; }
      }

      if (remaining.length) {
        await set(`dt:plan:${deviceId}`, JSON.stringify(remaining), TTL_SECONDS);
      } else {
        await del(`dt:plan:${deviceId}`);
      }
      if (dirty) await del(`dt:sub:${deviceId}`);
      // Keep the device entry; a dead sub is simply cleared (re-upload re-arms it).
    }

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: "due processing failed: " + err.message });
  }
};