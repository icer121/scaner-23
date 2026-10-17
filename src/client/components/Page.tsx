/**
 * Page wrapper template to be used as a base for all pages.
 */

import React from 'react';
import { Link } from 'react-router';
import { useSession } from 'modelence/client';
import LoadingSpinner from '@/client/components/LoadingSpinner';
import { Seo, type SeoProps } from '@/client/components/Seo';
import { Button } from '@/client/components/ui/Button';
import { cn } from '@/client/lib/utils';

interface PageProps {
  children?: React.ReactNode;
  isLoading?: boolean;
  className?: string;
  /** Per-page <head> overrides (title, description, OG image, etc). */
  seo?: SeoProps;
}

function Header() {
  const { user } = useSession();

  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-slate-950/60 backdrop-blur-xl">
      <Link to="/">
        <Button variant="ghost" className="text-slate-300 hover:text-white hover:bg-slate-800/60">
          Home
        </Button>
      </Link>

      {user ? (
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-400 font-mono-tabular">
            {user.handle}
          </span>
          <Link to="/logout">
            <Button variant="outline" className="border-white/10 text-slate-300 hover:text-white hover:bg-slate-800/60">
              Logout
            </Button>
          </Link>
        </div>
      ) : (
        <Link to="/login">
          <Button variant="outline" className="border-white/10 text-slate-300 hover:text-white hover:bg-slate-800/60">
            Sign in
          </Button>
        </Link>
      )}
    </header>
  );
}

function PageWrapper({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col min-h-screen max-w-full overflow-x-hidden bg-[#0b0f19]">{children}</div>;
}

function PageBody({ children, className, isLoading = false }: PageProps) {
  return (
    <div className="flex flex-1 w-full min-h-0">
      <main className={cn("flex flex-col flex-1 p-4 space-y-4 overflow-x-hidden", className)}>
        {isLoading ? (
          <div className="flex items-center justify-center w-full h-full">
            <LoadingSpinner />
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}

export default function Page({ children, className, isLoading = false, seo }: PageProps) {
  return (
    <PageWrapper>
      <Seo {...seo} />
      <Header />
      <PageBody className={className} isLoading={isLoading}>{children}</PageBody>
    </PageWrapper>
  );
}
