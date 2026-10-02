import { handleSubscribe } from '../_lib/subscribe.js';
export async function onRequest(context) { return handleSubscribe(context.request, context.env); }
export async function onRequestOptions(context) { return handleSubscribe(context.request, context.env); }
