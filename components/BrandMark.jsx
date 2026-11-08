export default function BrandMark({ className = "" }) {
  return (
    <svg
      className={`brand-mark ${className}`}
      viewBox="0 0 48 48"
      role="img"
      aria-label="Símbolo MECAFUT"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="1" y="1" width="46" height="46" rx="15" fill="#16836a" />
      <path d="M12 33V15l8.1 9.4L28 15v18M29 15h8v5.5h-5.2v2.2h4.1v5.1h-4.1V33h-3.1" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="36.5" cy="34.5" r="3.5" fill="#d9f2e9" />
    </svg>
  );
}
