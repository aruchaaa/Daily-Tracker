const UPSTASH_URL = process.env.UPSTASH_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REST_TOKEN;

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