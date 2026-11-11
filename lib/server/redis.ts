/**
 * redis.ts
 *
 * Upstash Redis 클라이언트 (Vercel 환경 변수 UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN 사용)
 * 값은 직접 JSON 직렬화하므로 자동 역직렬화는 끕니다.
 */

import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  automaticDeserialization: false,
});
