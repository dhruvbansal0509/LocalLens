import { Link } from "@tanstack/react-router";

export function LogoMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" fill="none">
      <circle cx="16" cy="14" r="11" className="stroke-border" strokeWidth="1.2" />
      <circle cx="16" cy="14" r="7" className="stroke-primary" strokeWidth="1.4" />
      <circle cx="16" cy="14" r="2.6" className="fill-terracotta" />
      <path d="M16 25v5" className="stroke-foreground" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 text-foreground" aria-label="LocalLens home">
      <LogoMark />
      <span className="font-display text-2xl">LocalLens</span>
    </Link>
  );
}
