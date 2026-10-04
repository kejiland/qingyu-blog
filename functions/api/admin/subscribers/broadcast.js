/* Cloudflare Pages Functions · /api/admin/subscribers/broadcast
 * POST → 站长按分组群发邮件（写入 mail_outbox，由 Cron 异步发送）
 */
import { handleSubscriberBroadcast } from '../../../_lib/subscribe.js';
export async function onRequest(context) { return handleSubscriberBroadcast(context.request, context.env); }
export async function onRequestOptions(context) { return handleSubscriberBroadcast(context.request, context.env); }
