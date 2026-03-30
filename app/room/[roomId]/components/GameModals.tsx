/**
 * GameModals.tsx
 * 
 * 게임 중 발생하는 팝업 창(질문 입력, 정답 제출)들을 관리하는 컴포넌트입니다.
 * 재사용 가능한 Modal 프레임과 각 상황에 맞는 모달들을 포함합니다.
 */

"use client";

import styles from "../Room.module.css";

interface ModalProps {
  isOpen: boolean;        // 모달 표시 여부
  title: string;         // 모달 제목
  description: string;   // 모달 설명 문구
  value: string;         // 입력 필드 값
  setValue: (val: string) => void;
  onSubmit: (e?: React.FormEvent) => void;
  onCancel: () => void;  // 취소 시 콜백
  submitLabel: string;   // 확인 버튼 라벨
  isTextArea?: boolean;  // 텍스트 영역(textarea) 사용 여부
}

/** 재사용 가능한 기본 모달 컴포넌트 */
function Modal({ isOpen, title, description, value, setValue, onSubmit, onCancel, submitLabel, isTextArea }: ModalProps) {
  if (!isOpen) return null;
  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <h3>{title}</h3>
        <p>{description}</p>
        {isTextArea ? (
          <textarea
            className={styles.textarea}
            placeholder="내용을 입력하세요..."
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        ) : (
          <input
            className={styles.input}
            placeholder="내용을 입력하세요..."
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        )}
        <div className={styles.modalButtons}>
          <button className={styles.modalCancel} onClick={onCancel}>취소</button>
          <button className={styles.modalSubmit} onClick={() => onSubmit()}>{submitLabel}</button>
        </div>
      </div>
    </div>
  );
}

/** 게임에서 사용하는 구체적인 모달들의 집합 */
export function GameModals({
  questionModalOpen,
  setQuestionModalOpen,
  questionText,
  setQuestionText,
  handlePostQuestion,
  answerModalOpen,
  setAnswerModalOpen,
  answerText,
  setAnswerText,
  handlePostAnswer,
}: any) {
  return (
    <>
      {/* 질문하기 모달: 플레이어가 공통 질문을 던질 때 사용 */}
      <Modal
        isOpen={questionModalOpen}
        title="❓ 질문하기"
        description="공통 채팅창에 공개될 질문을 입력하세요."
        value={questionText}
        setValue={setQuestionText}
        onSubmit={handlePostQuestion}
        onCancel={() => setQuestionModalOpen(false)}
        submitLabel="질문 전송"
        isTextArea
      />
      
      {/* 정답 제출 모달: 플레이어가 자신의 단어를 확신할 때 사용 */}
      <Modal
        isOpen={answerModalOpen}
        title="🎯 정답 제시하기"
        description="당신의 비밀 단어는 무엇인가요?"
        value={answerText}
        setValue={setAnswerText}
        onSubmit={handlePostAnswer}
        onCancel={() => setAnswerModalOpen(false)}
        submitLabel="정답 시도"
      />
    </>
  );
}
