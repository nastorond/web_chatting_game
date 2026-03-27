# 🎭 Web Chatting party_game

심판과 함께하는 실시간 단어 맞추기 웹 채팅 게임입니다. Next.js와 WebSocket을 사용하여 구현되었습니다.

## 🚀 주요 기능

- **실시간 소통**: WebSocket을 기반으로 한 빠른 메시지 전송 및 게임 상태 동기화.
- **방 시스템**: 고유한 Room ID를 통한 개별 게임 공간 생성 및 참여.
- **심판 시스템**: 게임 진행을 총괄하고 플레이어에게 경고나 침묵(Mute) 조치를 내릴 수 있는 심판 역할 지원.
- **Q&A 로그**: 질문과 답변이 기록되어 게임 진행 상황을 한눈에 파악 가능.
- **다양한 게임 모드**: '첫 번째 승자' 또는 '마지막 생존자' 등 다양한 종료 조건 설정 가능 (준비 중).

## 🛠 기술 스택

- **Framework**: [Next.js](https://nextjs.org/) (App Router)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Communication**: WebSocket (`WebSocketPair` API)
- **Styling**: Vanilla CSS (Modern & Premium Design)

## 📦 시작하기

### 설치

```bash
npm install
```

### 개발 서버 실행

```bash
npm run dev
```

브라우저에서 `http://localhost:3000`에 접속하여 닉네임을 입력하고 게임을 시작하세요!

## 🎮 게임 방법

1. **로비**: 닉네임을 입력하고 새로운 방을 만들거나 기존 방 ID를 입력하여 입장합니다.
2. **준비**: 모든 플레이어가 모이면 게임이 시작됩니다.
3. **진행**: 자신의 차례에 다른 플레이어에게 질문을 던져 자신의 단어를 유추합니다.
4. **승리**: 자신의 단어를 정확히 맞추면 승리!

## 📄 라이선스

이 프로젝트는 MIT 라이선스를 따릅니다.

---

## 📅 Roadmap & TODO (Next Steps)

### 1. UX & Rule Enhancements
- [ ] **방 유지 및 재시작**: 게임 종료 후 로비로 나가는 대신, 현재 플레이어들과 방을 유지하며 다시 시작할 수 있는 기능.
- [ ] **단일 액션 제약**: 질문 또는 정답 시도 중 **단 하나만, 딱 한 번만** 수행 가능하도록 제한 (수행 시 즉시 버튼 비활성화).

### 2. Stability & Persistence
- [ ] **배포 환경 안정화**:
    - **문제**: Vercel 등 서버리스 환경에서 인메모리 `Map` 휘발로 인해 방이 주기적으로 사라지는 현상 해결 필요.

### 3. Advanced Features
- [ ] 다양한 게임 모드(Last Survivor 등) 정식 지원.
- [ ] 실시간 음성/화상 채팅 연동 검토.
