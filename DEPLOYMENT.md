# Deploy Sharedit

Use Vercel for the frontend and one persistent Docker backend for Yjs and Socket.IO. The shared document is still in memory, so a backend restart or a free host spinning down may clear it. Do not scale the backend to multiple instances without shared state.

1. Import the repository into Vercel with the root directory set to `frontend` so it deploys Vite rather than detecting the Docker backend. Note the production origin (for example, `https://your-sharedit-project.vercel.app`).
2. Create a Render Blueprint from `render.yaml`, or deploy the root `Dockerfile` on another WebSocket-capable host. Set `SHAREDIT_PUBLIC_ORIGIN` to the exact Vercel production origin, without a trailing slash. Verify the backend's `/health` endpoint returns `{"status":"ok"}`.
3. In Vercel, set `VITE_SHAREDIT_BACKEND_URL` to the HTTPS backend origin, without a trailing slash, and deploy. Open the production URL in two independent browser sessions and verify presence and shared editing in both directions.

The AI tutor is optional. `frontend/vercel.json` forwards `/api/ai/:path*` to the production Render backend. Update the destination if you deploy to a different backend. Set `AI_PUBLIC_ORIGIN` to the exact Vercel production origin and set `GROQ_API_KEY` only on the backend. Leave `AI_TRUST_PROXY` unset while the backend is directly reachable. Use persistent quota storage and access controls before opening tutor access to everyone. See the README for details.

Display names are not authentication. Anyone allowed to reach the app can join the shared document.