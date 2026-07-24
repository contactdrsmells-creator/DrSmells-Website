export default function MalaysiaIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 100 60"
      fill="none"
      style={style}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Peninsular Malaysia */}
      <path d="M15 10 C18 8, 22 7, 25 9 C27 10, 28 12, 30 14 C31 16, 30 18, 29 20 C28 22, 27 24, 26 27 C25 30, 24 33, 22 36 C21 38, 19 40, 18 42 C17 44, 16 46, 15 48 C14 49, 13 50, 12 49 C11 48, 12 46, 13 44 C14 42, 14 40, 13 38 C12 36, 11 34, 11 32 C10 30, 10 28, 11 26 C12 24, 12 22, 12 20 C12 18, 13 16, 14 14 C14 12, 14 11, 15 10Z" />
      {/* East Malaysia */}
      <path d="M50 18 C52 16, 55 15, 58 14 C61 13, 64 13, 67 14 C70 15, 73 16, 76 17 C79 18, 82 18, 85 17 C87 16, 88 15, 90 16 C91 17, 90 19, 88 20 C86 21, 84 22, 82 23 C80 24, 78 25, 76 25 C74 25, 72 24, 70 24 C68 24, 66 25, 64 25 C62 25, 60 24, 58 23 C56 22, 54 21, 52 20 C51 19, 50 19, 50 18Z" />
    </svg>
  );
}
