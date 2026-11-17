# Setting up the relay (about 5 minutes, free)

The web app reads your screenshots with OpenAI. OpenAI doesn't accept requests carrying an API key straight from a web
page, so they go through a tiny relay that you run on your own free Cloudflare account. It only forwards to OpenAI's
reading endpoint, only for the app's page, and stores nothing: your key goes with each request from your browser to
OpenAI.

1. **Sign in to Cloudflare** at [dash.cloudflare.com](https://dash.cloudflare.com) (create a free account if you
   don't have one).
2. Go to **Compute (Workers)** → **Workers & Pages**, then **Create** → **Create Worker** (start from "Hello World").
   Name it `fm-scoring-relay` and click **Deploy**.
3. Click **Edit code**. Delete everything in the editor, paste in the whole of [`worker.js`](worker.js), and click
   **Deploy**.
4. Copy the worker's address. It looks like `https://fm-scoring-relay.<your-name>.workers.dev`. Opening it in a browser
   should show "FM Scoring relay: working."
5. In the app, open **Settings** and paste that address into **Relay address**, with your OpenAI API key.

If you host the app somewhere other than `https://brewer1293.github.io`, add that address to `ALLOWED_ORIGINS` at the
top of `worker.js` and deploy again.

Cloudflare's free plan allows 100,000 requests a day: each screenshot is one request.
