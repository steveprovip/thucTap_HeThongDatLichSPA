// Giữ API trên Render Free luôn thức (Render ngủ sau 15 phút không có truy cập, đánh thức mất ~1 phút).
// Cloudflare Worker gói miễn phí, hẹn giờ mỗi 10 phút gọi GET /health/live — endpoint KHÔNG đụng CSDL nên CSDL miễn phí
// (Neon / Supabase) vẫn được ngủ khi tiệm vắng. 1 dịch vụ chạy 24/7 ≈ 744 giờ/tháng < 750 giờ miễn phí của Render.
// Triển khai: npm run deploy:cloud (scripts/deploy-cloud.mjs) — tự đặt API_HEALTH_URL.
export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(ping(env));
  },
  // Mở địa chỉ Worker trên trình duyệt để xem nhanh API có đang thức không
  async fetch(_request, env) {
    return Response.json(await ping(env));
  },
};

async function ping(env) {
  const started = Date.now();
  try {
    const res = await fetch(env.API_HEALTH_URL, { headers: { 'user-agent': 'huongsen-keepalive' }, signal: AbortSignal.timeout(90_000) });
    return { ok: res.ok, status: res.status, ms: Date.now() - started, url: env.API_HEALTH_URL };
  } catch (e) {
    return { ok: false, error: String(e), ms: Date.now() - started, url: env.API_HEALTH_URL };
  }
}
