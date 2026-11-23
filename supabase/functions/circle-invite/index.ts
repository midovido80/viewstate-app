export function invitationResponse(request: Request): Response {
  const url = new URL(request.url), token = url.searchParams.get('token');
  if (request.method !== 'GET' || !token || !/^[a-f0-9]{64}$/.test(token)) return new Response('رابط الدعوة غير صحيح.', { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  return new Response(null, { status: 302, headers: { Location: 'viewstate://circle-invite/' + token, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' } });
}
Deno.serve(invitationResponse);
