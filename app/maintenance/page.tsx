import styles from './Maintenance.module.css';

export const metadata = {
  title: '시스템 점검 중 | Maintenance',
  description: '더 나은 서비스를 위해 시스템 점검을 진행하고 있습니다.',
};

export default function MaintenancePage() {
  return (
    <main className={styles.container}>
      <div className={styles.card}>
        <div className={styles.iconWrapper}>
          <svg
            className={styles.icon}
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
        </div>
        <h1 className={styles.title}>시스템 점검 중</h1>
        <p className={styles.subtitle}>
          더 안정적이고 즐거운 게임 환경을 위해 서버 점검을 진행하고 있습니다.<br />
          잠시 후 다시 접속해 주세요. 이용에 불편을 드려 죄송합니다.
        </p>
        <div className={styles.statusTag}>현재 점검 진행 중</div>
      </div>
    </main>
  );
}
