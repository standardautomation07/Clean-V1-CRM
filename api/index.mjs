// Vercel serverless entry. The Express app is built by
// `pnpm --filter @workspace/api-server run build` into
// artifacts/api-server/dist/vercel.mjs (self-contained bundle, see build.mjs);
// vercel.json includes that directory in the function and rewrites /api/* here.
let appPromise;

export default async function handler(req, res) {
  appPromise ??= import("../artifacts/api-server/dist/vercel.mjs").then((m) => m.default);
  const app = await appPromise;
  return app(req, res);
}
