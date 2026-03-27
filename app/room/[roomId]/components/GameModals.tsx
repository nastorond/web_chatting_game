"use client";

import styles from "../Room.module.css";

interface ModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  value: string;
  setValue: (val: string) => void;
  onSubmit: (e?: React.FormEvent) => void;
  onCancel: () => void;
  submitLabel: string;
  isTextArea?: boolean;
}

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
