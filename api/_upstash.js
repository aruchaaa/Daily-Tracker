// Accept either the manually-set Upstash REST names or the names provisioned
// by the Vercel "Upstash for Redis" integration (KV_REST_API_*).
const UPSTASH_URL = process.env.UPSTASH_REST_URL || process.env.KV_REST_API_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REST_TOKEN || process.env.KV_REST_API_TOKEN;

/** True when a REST endpoint + token are available, whichever naming won. */
export function upstashConfigured() {
  return Boolean(UPSTASH_URL && UPSTASH_TOKEN);
}

function headers() {
  return {
    ...(UPSTASH_TOKEN ? { Authorization: `Bearer ${UPSTASH_TOKEN}` } : {}),
    "Content-Type": "application/json",
  };
}

/** Run a Redis command via Upstash's body-style REST form (POST a JSON
 *  command array). Chosen over the path form because a 14-day reminder plan
 *  can be tens of KB — too long for a URL path — and this avoids all
 *  manual URL-encoding. Resolves to the command's `result`. */
async function command(cmd) {
  const res = await fetch(UPSTASH_URL, { method: "POST", headers: headers(), body: JSON.stringify(cmd) });
  if (!res.ok) throw new Error(`upstash ${cmd[0]} failed: ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`upstash ${cmd[0]} error: ${json.error}`);
  return json.result == null ? null : json.result;
}

export function get(name) {
  return command(["GET", name]);
}

export function set(name, value, exSeconds) {
  const cmd = ["SET", name, value];
  if (exSeconds) cmd.push("EX", String(exSeconds));
  return command(cmd);
}

export function del(name) {
  return command(["DEL", name]);
}