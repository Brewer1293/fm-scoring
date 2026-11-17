// FM Scoring relay: a Cloudflare Worker that passes the web app's screenshot readings on to OpenAI.
// OpenAI refuses keyed requests straight from a web page, so the app sends them here and this forwards them.
// It keeps nothing: your API key travels with each request, from your browser to OpenAI, and isn't stored here.
// Setup: relay/README.md.

// Web pages allowed to use this relay. Add yours if you host the app somewhere else.
const ALLOWED_ORIGINS = [
  "https://brewer1293.github.io",
  "http://localhost:8000",  // the app run on your own computer: python3 -m http.server 8000
];

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin") || "";
    const allowed = ALLOWED_ORIGINS.includes(origin);
    const cors = {
      "Access-Control-Allow-Origin": allowed ? origin : ALLOWED_ORIGINS[0],
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    };
    const reply = (status, text) => new Response(text, { status, headers: { ...cors, "Content-Type": "text/plain" } });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/") return reply(200, "FM Scoring relay: working.");
    if (url.pathname !== "/v1/responses" || request.method !== "POST") return reply(404, "Not found");
    if (!allowed) return reply(403, `This relay only works for: ${ALLOWED_ORIGINS.join(", ")} (this page's origin is ${origin || "unknown"})`);

    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": request.headers.get("Authorization") || "", "Content-Type": "application/json" },
      body: request.body,
    });
    const headers = new Headers(cors);
    headers.set("Content-Type", upstream.headers.get("Content-Type") || "application/json");
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
