import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeVapidPublicKey,
  subscriptionUsesVapidKey,
} from "./push-subscription.ts";

test("detects whether a browser subscription belongs to the current VAPID key", () => {
  const key = "BEl62iUYgUivxIkv69yViEuiBIa40HI0HTv7cwH3cZJ1E4K1pJdJ-A_Eq5K2sO5aK6lJ9f5rZg3A9t3x8fQwP0";
  const decoded = decodeVapidPublicKey(key);

  assert.equal(subscriptionUsesVapidKey(decoded.buffer, decoded), true);
  const other = decoded.slice();
  other[10] ^= 1;
  assert.equal(subscriptionUsesVapidKey(other.buffer, decoded), false);
});

