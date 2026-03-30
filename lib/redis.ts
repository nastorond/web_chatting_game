/**
 * redis.ts
 * 
 * Upstash Redis 클라이언트를 초기화하고 내보내는 설정 파일입니다.
 * 모든 게임 상태와 채팅 데이터는 이 클라이언트를 통해 Redis에 저장됩니다.
 */

import { Redis } from "@upstash/redis";

// 환경 변수에서 Redis 접속 정보(URL, Token)를 읽어와 클라이언트를 생성합니다.
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});
