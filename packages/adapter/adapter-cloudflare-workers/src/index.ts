/// <reference types="@cloudflare/workers-types"/>

import type { AdapterRequestContext, HattipHandler } from "@hattip/core";
import { getAssetFromKV, NotFoundError } from "@cloudflare/kv-asset-handler";
import manifestText from "__STATIC_CONTENT_MANIFEST";

const manifest = JSON.parse(manifestText);

export interface CloudflareWorkersPlatformInfo<Env = unknown> {
	/** Platform name */
	name: "cloudflare-workers";
	/**
	 * Bindings for secrets, environment variables, and other resources like
	 * KV namespaces etc.
	 * @see https://developers.cloudflare.com/workers/platform/environment-variables
	 * @see https://developers.cloudflare.com/workers/configuration/bindings
	 */
	env: Env;
	/**
	 * Execution context
	 * @see https://developers.cloudflare.com/workers/runtime-apis/fetch-event/#parameters
	 */
	context: ExecutionContext;
}

export default function cloudflareWorkersAdapter<Env = unknown>(
	handler: HattipHandler<CloudflareWorkersPlatformInfo<Env>>,
): ExportedHandlerFetchHandler<Env> {
	return async function fetchHandler(request, env, ctx) {
		if (request.method === "GET" || request.method === "HEAD") {
			try {
				return await getAssetFromKV(
					{
						request,
						waitUntil: (promise) => ctx.waitUntil(promise),
					},
					{
						ASSET_NAMESPACE: (env as any).__STATIC_CONTENT,
						ASSET_MANIFEST: manifest,
					},
				);
			} catch (error) {
				if (!(error instanceof NotFoundError)) {
					console.error(error);
					return new Response("Internal Server Error", { status: 500 });
				}
			}
		}

		const context: AdapterRequestContext<CloudflareWorkersPlatformInfo<Env>> = {
			request,
			ip: request.headers.get("CF-Connecting-IP") || "127.0.0.1", // wrangler no longer sets this header
			waitUntil: ctx.waitUntil.bind(ctx),
			passThrough() {
				// Do nothing
			},
			platform: {
				name: "cloudflare-workers",
				env,
				context: ctx,
			},
			env(variable) {
				const value = (env as any)[variable];
				return typeof value === "string" ? value : undefined;
			},
		};

		return handler(context);
	};
}
