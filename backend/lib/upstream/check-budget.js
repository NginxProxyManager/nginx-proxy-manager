import { createRateLimiter } from "./rate-limit.js";

/**
 * The per user budget of upstream reachability probes (DNS + TCP connect), shared by everything that probes on
 * a user's request: POST /upstreams/check and the "Test config" endpoints. One unit per target.
 */
const CHECK_BUDGET_PER_MINUTE = 60;

const checkBudget = createRateLimiter({ limit: CHECK_BUDGET_PER_MINUTE, windowMs: 60 * 1000 });

/**
 * @param   {Access} access
 * @returns {string}
 */
const checkBudgetKey = (access) => `${access.token.getUserId(0)}`;

/**
 * @param   {Access} access
 * @param   {number} units  number of targets about to be probed
 * @returns {{ok: boolean, remaining: number, retryAfter: number}}  nothing is consumed when not ok
 */
const consumeCheckBudget = (access, units) => checkBudget.consume(checkBudgetKey(access), units);

export { CHECK_BUDGET_PER_MINUTE, checkBudget, checkBudgetKey, consumeCheckBudget };
