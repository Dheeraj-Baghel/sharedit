# Deploy Sharedit

Use Vercel for the frontend and one persistent Docker backend for Yjs and Socket.IO. The shared document is still in memory, so a backend restart or a free host spinning down may clear it. Do not scale the backend to multiple instances without shared state.

1. Import the repository into Vercel with its root directory unchanged. Note the production origin (for example, `https://your-sharedit-project.vercel.app`).
2. Create a Render Blueprint from `render.yaml`, or deploy the root `Dockerfile` on another WebSocket-capable host. Set `SHAREDIT_PUBLIC_ORIGIN` to the exact Vercel production origin, without a trailing slash. Verify the backend's `/health` endpoint returns `{"status":"ok"}`.
3. In Vercel, set `VITE_SHAREDIT_BACKEND_URL` to the HTTPS backend origin, without a trailing slash, and deploy. Open the production URL in two independent browser sessions and verify presence and shared editing in both directions.

The AI tutor is optional. To enable it, add a same-origin Vercel rewrite from `/api/ai/:path*` to `https://<your-backend>/api/ai/:path*`. Set `AI_PUBLIC_ORIGIN` to the Vercel production origin and `AI_TRUST_PROXY=1` on the backend. Configure the tutor secrets on the backend only, and use persistent storage for the quota ledger before enabling the tutor publicly. See the README for the tutor's settings.

Display names are not authentication. Anyone allowed to reach the app can join the shared document.