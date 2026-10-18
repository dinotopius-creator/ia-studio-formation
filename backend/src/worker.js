const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

function cors(request, env) {
  const origin = request.headers.get('Origin');
  return origin === env.ALLOWED_ORIGIN ? {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS',
    'vary': 'Origin'
  } : {};
}
function json(body, status = 200, extra = {}) { return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } }); }
function err(message, status = 400, extra = {}) { return json({ error: message }, status, extra); }
function clean(value, max = 500) { return typeof value === 'string' ? value.trim().replace(/[<>]/g, '').slice(0, max) : ''; }
function randomId() { return crypto.randomUUID().replaceAll('-', ''); }
function cookieValue(request, key) { return (request.headers.get('Cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith(key + '='))?.slice(key.length + 1) || ''; }
async function hmac(secret, value) { const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)); return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join(''); }
function constantTimeEqual(a, b) { if (!a || !b || a.length !== b.length) return false; let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i); return diff === 0; }
async function validAdmin(request, env) { const token = cookieValue(request, 'ia_admin'); const [expires, signature] = token.split('.'); if (!expires || !signature || Number(expires) < Date.now()) return false; return constantTimeEqual(signature, await hmac(env.ADMIN_SESSION_SECRET, `admin.${expires}`)); }
async function stripe(requestBody, env, path, form) { const response = await fetch(`https://api.stripe.com/v1/${path}`, { method: 'POST', headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded' }, body: form.toString() }); const data = await response.json(); if (!response.ok) throw new Error(data.error?.message || 'Stripe a refusé la demande.'); return data; }
async function sendWelcomeEmail(env, order) {
  if (!env.MAIL_WEBHOOK_URL || !env.MAIL_SHARED_SECRET) return false;
  const response = await fetch(env.MAIL_WEBHOOK_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: env.MAIL_SHARED_SECRET, email: order.customerEmail, customerName: order.customerName, orderNumber: order.orderNumber, project: order.project || '' }) });
  if (!response.ok) throw new Error('Le service d’e-mail a refusé l’envoi.');
  const result = await response.json().catch(() => null); if (!result?.ok) throw new Error('Le service d’e-mail n’a pas confirmé l’envoi.');
  return true;
}
async function createCheckout(request, env, headers) {
  const body = await request.json().catch(() => null); const firstName = clean(body?.firstName, 80), lastName = clean(body?.lastName, 80), project = clean(body?.project, 120), detail = clean(body?.detail, 700);
  if (!firstName || !lastName || !project) return err('Informations de projet incomplètes.', 422, headers);
  if (body?.digitalConsent !== true) return err('Ton accord explicite pour l’accès immédiat est requis avant le paiement.', 422, headers);
  const leadId = randomId(), now = new Date().toISOString();
  await env.DB.prepare('INSERT INTO leads (id, first_name, last_name, project, project_detail, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(leadId, firstName, lastName, project, detail, now).run();
  try {
    const form = new URLSearchParams({ mode: 'payment', 'line_items[0][price]': env.STRIPE_PRICE_ID, 'line_items[0][quantity]': '1', customer_creation: 'always', success_url: `${env.SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`, cancel_url: env.CANCEL_URL, 'metadata[lead_id]': leadId, 'metadata[source]': 'ia-studio-site', 'metadata[digital_access_consent]': 'true', 'metadata[digital_access_consent_at]': now, 'metadata[terms_version]': '2026-10-18' });
    const session = await stripe(request, env, 'checkout/sessions', form);
    return json({ checkoutUrl: session.url }, 200, headers);
  } catch (error) { await env.DB.prepare('DELETE FROM leads WHERE id = ?').bind(leadId).run(); return err(error.message, 502, headers); }
}
async function receiveStripe(request, env) {
  const payload = await request.text(), signature = request.headers.get('Stripe-Signature') || '';
  const timestamp = signature.split(',').find(x => x.startsWith('t='))?.slice(2), sent = signature.split(',').find(x => x.startsWith('v1='))?.slice(3);
  if (!timestamp || !sent || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 || !constantTimeEqual(sent, await hmac(env.STRIPE_WEBHOOK_SECRET, `${timestamp}.${payload}`))) return err('Signature Stripe invalide.', 400);
  const event = JSON.parse(payload); if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) return json({ received: true });
  const session = event.data.object; if (session.payment_status !== 'paid') return json({ received: true });
  const leadId = session.metadata?.lead_id || null, lead = leadId ? await env.DB.prepare('SELECT first_name, last_name, project, project_detail FROM leads WHERE id = ?').bind(leadId).first() : null, now = new Date().toISOString();
  const customerName = session.customer_details?.name || [lead?.first_name, lead?.last_name].filter(Boolean).join(' ') || null;
  const orderNumber = `IA-${new Date(session.created * 1000).getFullYear()}-${session.id.slice(-8).toUpperCase()}`;
  await env.DB.prepare(`INSERT INTO orders (stripe_session_id, stripe_payment_intent_id, stripe_customer_id, order_number, customer_name, customer_email, lead_id, project, project_detail, amount_total, currency, status, paid_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid', ?, ?) ON CONFLICT(stripe_session_id) DO UPDATE SET updated_at=excluded.updated_at`).bind(session.id, session.payment_intent || null, session.customer || null, orderNumber, customerName, session.customer_details?.email || null, leadId, lead?.project || null, lead?.project_detail || null, session.amount_total || 0, session.currency || 'eur', new Date(session.created * 1000).toISOString(), now).run();
  const order = await env.DB.prepare('SELECT order_number AS orderNumber, customer_name AS customerName, customer_email AS customerEmail, project, status FROM orders WHERE stripe_session_id = ?').bind(session.id).first();
  if (order?.status === 'paid' && order.customerEmail && await sendWelcomeEmail(env, order)) await env.DB.prepare("UPDATE orders SET status = 'guide_sent', updated_at = ? WHERE stripe_session_id = ?").bind(new Date().toISOString(), session.id).run();
  return json({ received: true });
}
async function orders(request, env, headers) { if (!await validAdmin(request, env)) return err('Non autorisé.', 401, headers); const rows = (await env.DB.prepare('SELECT order_number AS orderNumber, customer_name AS customerName, customer_email AS customerEmail, project, project_detail AS projectDetail, amount_total AS amountTotal, currency, status, paid_at AS paidAt FROM orders ORDER BY paid_at DESC LIMIT 250').all()).results; const summary = { paid: rows.length, guidePending: rows.filter(x => x.status === 'paid').length, bookingPending: rows.filter(x => ['paid','guide_sent'].includes(x.status)).length }; return json({ orders: rows, summary }, 200, headers); }
async function updateOrder(request, env, headers, orderNumber) { if (!await validAdmin(request, env)) return err('Non autorisé.', 401, headers); const body = await request.json().catch(() => null), status = clean(body?.status, 40); if (!['paid', 'guide_sent', 'appointment_scheduled', 'completed'].includes(status)) return err('Statut invalide.', 422, headers); await env.DB.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE order_number = ?').bind(status, new Date().toISOString(), orderNumber).run(); return json({ ok: true }, 200, headers); }
async function publicReviews(env, headers) { const rows = (await env.DB.prepare("SELECT author_name AS authorName, rating, message, published_at AS publishedAt FROM reviews WHERE status = 'approved' ORDER BY published_at DESC LIMIT 12").all()).results; return json({ reviews: rows }, 200, headers); }
async function submitReview(request, env, headers) { const body = await request.json().catch(() => null), orderNumber = clean(body?.orderNumber, 100).toUpperCase(), email = clean(body?.email, 254).toLowerCase(), message = clean(body?.message, 750), rating = Number(body?.rating); if (!orderNumber || !email || !message || message.length < 20 || !Number.isInteger(rating) || rating < 1 || rating > 5) return err('Complète ton numéro de commande, ton e-mail, ta note et un avis d’au moins 20 caractères.', 422, headers); const order = await env.DB.prepare('SELECT customer_name FROM orders WHERE order_number = ? AND lower(customer_email) = ?').bind(orderNumber, email).first(); if (!order) return err('Impossible de vérifier cette commande avec cet e-mail.', 404, headers); const authorName = clean(order.customer_name?.split(/\\s+/)[0] || 'Client vérifié', 80), now = new Date().toISOString(); try { await env.DB.prepare("INSERT INTO reviews (id, order_number, author_name, rating, message, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)").bind(randomId(), orderNumber, authorName, rating, message, now).run(); return json({ ok: true }, 201, headers); } catch (error) { return err('Un avis est déjà en attente ou publié pour cette commande.', 409, headers); } }
async function adminReviews(request, env, headers) { if (!await validAdmin(request, env)) return err('Non autorisé.', 401, headers); const rows = (await env.DB.prepare('SELECT id, order_number AS orderNumber, author_name AS authorName, rating, message, status, created_at AS createdAt, published_at AS publishedAt FROM reviews ORDER BY created_at DESC LIMIT 100').all()).results; return json({ reviews: rows }, 200, headers); }
async function updateReview(request, env, headers, id) { if (!await validAdmin(request, env)) return err('Non autorisé.', 401, headers); const body = await request.json().catch(() => null), status = clean(body?.status, 20); if (!['approved', 'rejected'].includes(status)) return err('Statut invalide.', 422, headers); const now = new Date().toISOString(); await env.DB.prepare('UPDATE reviews SET status = ?, published_at = CASE WHEN ? = \'approved\' THEN ? ELSE published_at END WHERE id = ?').bind(status, status, now, id).run(); return json({ ok: true }, 200, headers); }

export default { async fetch(request, env) { const url = new URL(request.url), headers = cors(request, env); if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers }); try {
  if (url.pathname === '/webhooks/stripe' && request.method === 'POST') return receiveStripe(request, env);
  if (url.pathname === '/checkout' && request.method === 'POST') return createCheckout(request, env, headers);
  if (url.pathname === '/admin/login' && request.method === 'POST') { const body = await request.json().catch(()=>null); if (!constantTimeEqual(clean(body?.password, 300), env.ADMIN_PASSWORD)) return err('Non autorisé.', 401, headers); const expires = String(Date.now() + 1000 * 60 * 60 * 12), signature = await hmac(env.ADMIN_SESSION_SECRET, `admin.${expires}`); return json({ ok: true }, 200, { ...headers, 'set-cookie': `ia_admin=${expires}.${signature}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=43200` }); }
  if (url.pathname === '/admin/logout' && request.method === 'POST') return json({ ok: true }, 200, { ...headers, 'set-cookie': 'ia_admin=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0' });
  if (url.pathname === '/admin/orders' && request.method === 'GET') return orders(request, env, headers);
  if (url.pathname.startsWith('/admin/orders/') && request.method === 'PATCH') return updateOrder(request, env, headers, decodeURIComponent(url.pathname.slice('/admin/orders/'.length)));
  if (url.pathname === '/reviews' && request.method === 'GET') return publicReviews(env, headers);
  if (url.pathname === '/reviews' && request.method === 'POST') return submitReview(request, env, headers);
  if (url.pathname === '/admin/reviews' && request.method === 'GET') return adminReviews(request, env, headers);
  if (url.pathname.startsWith('/admin/reviews/') && request.method === 'PATCH') return updateReview(request, env, headers, decodeURIComponent(url.pathname.slice('/admin/reviews/'.length)));
  return err('Route introuvable.', 404, headers);
} catch (error) { return err('Erreur interne. Réessaie plus tard.', 500, headers); } } };
