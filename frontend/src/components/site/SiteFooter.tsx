import { Link } from "@tanstack/react-router";
import { LogoMark } from "./Logo";

export function SiteFooter() {
  return (
    <footer className="no-print mt-auto border-t border-border">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-2">
          <LogoMark className="h-5 w-5" />
          <span>© {new Date().getFullYear()} LocalLens · Business-location research for India</span>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Footer">
          <Link to="/explore" className="hover:text-foreground">Explore</Link>
          <Link to="/analyse" className="hover:text-foreground">Analyse</Link>
          <Link to="/compare" className="hover:text-foreground">Compare</Link>
          <Link to="/settings" className="hover:text-foreground">Data sources</Link>
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="hover:text-foreground">
            © OpenStreetMap contributors
          </a>
        </nav>
      </div>
    </footer>
  );
}
