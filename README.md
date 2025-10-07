# Unith Streaming Avatar App

A minimal React + Vite + Tailwind single-page app that authenticates with the Unith Platform API,
lists head visuals with thumbnails (paginated), and creates a **streaming-ready** Digital Human.

## Run (separate port)

```bash
npm install
npm run dev -- --port=5175
# then open http://localhost:5175
```

## Flow

- `/auth/token` → get 7-day Bearer token
- `/head_visual/all` → list visuals (12 per page)
- `/head/create` → create head with ElevenLabs & empty greetings
- `/head/{id}/splitter?splitter=false` (PUT) → disable splitter for streaming
- `/head/{id}` → retrieve `publicUrl` and convert to `https://stream.unith.ai/<orgId>/<headId>?api_key=<orgApiKey>`

Security: secret key is only posted to `https://platform-api.unith.ai/auth/token` from your browser and is not stored.
