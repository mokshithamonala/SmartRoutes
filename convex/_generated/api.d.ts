/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as aiChatbot from "../aiChatbot.js";
import type * as auth from "../auth.js";
import type * as chat from "../chat.js";
import type * as community from "../community.js";
import type * as emergency from "../emergency.js";
import type * as http from "../http.js";
import type * as journeys from "../journeys.js";
import type * as mapsIntegration from "../mapsIntegration.js";
import type * as parking from "../parking.js";
import type * as paymentIntegration from "../paymentIntegration.js";
import type * as preferences from "../preferences.js";
import type * as router from "../router.js";
import type * as routes from "../routes.js";
import type * as trafficAI from "../trafficAI.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  aiChatbot: typeof aiChatbot;
  auth: typeof auth;
  chat: typeof chat;
  community: typeof community;
  emergency: typeof emergency;
  http: typeof http;
  journeys: typeof journeys;
  mapsIntegration: typeof mapsIntegration;
  parking: typeof parking;
  paymentIntegration: typeof paymentIntegration;
  preferences: typeof preferences;
  router: typeof router;
  routes: typeof routes;
  trafficAI: typeof trafficAI;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
