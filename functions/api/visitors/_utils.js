/**
 * Visitor tracking — shared KV utilities
 * =======================================
 * KV key: visitor:{sessionId}
 * TTL: 300s (5 min without heartbeat = offline)
 *
 * 统计键：
 *   visitor:stats:total        → 累计访问（新会话数）
 *   visitor:stats:day:{YYYY-MM-DD} → 当日访问（保留 30 天）
 */

const KV_PREFIX = 'visitor:';
const STATS_TOTAL_KEY = KV_PREFIX + 'stats:total';
const STATS_DAY_PREFIX = KV_PREFIX + 'stats:day:';
const STATS_KEEP_DAYS = 30;
const HEARTBEAT_TTL = 300; // seconds

export function getVisitorKey(sessionId) {
  return KV_PREFIX + sessionId;
}

/**
 * Throws a descriptive error if the KV binding is missing
 * (e.g. GitHub-integrated Pages build without dashboard bindings).
 */
export function requireStore(env) {
  if (!env || !env.VISITOR_STORE) {
    throw new Error('KV binding VISITOR_STORE not configured');
  }
  return env.VISITOR_STORE;
}

function dayKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return STATS_DAY_PREFIX + y + '-' + m + '-' + day;
}

/** Read-modify-write +1 on a stats counter. */
async function bumpCounter(store, key) {
  const raw = await store.get(key);
  const n = (parseInt(raw, 10) || 0) + 1;
  await store.put(key, String(n), { expirationTtl: 86400 * STATS_KEEP_DAYS });
  return n;
}

/**
 * Record or refresh a visitor heartbeat.
 * Returns the stored entry.
 */
export async function recordHeartbeat(env, sessionId, data) {
  const store = requireStore(env);
  const key = getVisitorKey(sessionId);
  const existing = await store.get(key, 'json');

  const now = Date.now();
  const entry = {
    sessionId,
    ip: data.ip || '未知',
    country: data.country || '未知',
    userAgent: data.userAgent || '未知',
    page: data.page || '/',
    referrer: data.referrer || '',
    firstSeen: existing ? existing.firstSeen : now,
    lastSeen: now,
  };

  await store.put(key, JSON.stringify(entry), {
    expirationTtl: HEARTBEAT_TTL
  });

  // 新会话才计一次流量（同一个 sessionId 的心跳不重复计数）
  if (!existing) {
    try {
      await bumpCounter(store, STATS_TOTAL_KEY);
      await bumpCounter(store, dayKey(new Date()));
    } catch (e) {
      // 统计失败不影响心跳本身
    }
  }

  return entry;
}

/**
 * Fetch all currently online visitors (keys that haven't expired).
 * Sorted by lastSeen descending.
 */
export async function getOnlineVisitors(env) {
  const store = requireStore(env);
  const list = await store.list({ prefix: KV_PREFIX });
  const visitors = [];

  for (const key of list.keys) {
    const data = await store.get(key.name, 'json');
    if (data) {
      visitors.push(data);
    }
  }

  // Sort by lastSeen descending (most recent first)
  visitors.sort((a, b) => b.lastSeen - a.lastSeen);

  return visitors;
}

/**
 * Traffic stats: total visits + daily counts for the last `days` days.
 */
export async function getVisitorStats(env, days) {
  const store = requireStore(env);
  const total = parseInt(await store.get(STATS_TOTAL_KEY), 10) || 0;

  const daily = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const count = parseInt(await store.get(dayKey(d)), 10) || 0;
    daily.push({
      date: dayKey(d).slice(STATS_DAY_PREFIX.length),
      count
    });
  }

  return { total, daily };
}

/**
 * Simplify a User-Agent string to just browser name.
 */
export function simplifyUA(ua) {
  if (!ua) return '未知';
  if (ua.includes('Edg/')) return 'Edge';
  if (ua.includes('Chrome/')) return 'Chrome';
  if (ua.includes('Firefox/')) return 'Firefox';
  if (ua.includes('Safari/') && !ua.includes('Chrome/')) return 'Safari';
  // Mobile apps / other
  if (ua.includes('Mobile')) return 'Mobile';
  return ua.split('/')[0].split(' ')[0] || '未知';
}
