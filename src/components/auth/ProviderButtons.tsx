import { cn } from '@/lib/cn';

/*
 * OAuth provider buttons.
 *
 * Brand marks are inlined as paths rather than pulled from an icon set, because
 * Google and Apple both require their official mark and neither ships in Lucide.
 * Colours and proportions follow each provider's brand guidelines: Google keeps its
 * four-colour G on white, Apple and GitHub use their monochrome marks.
 */

export type Provider = 'google' | 'apple' | 'github';

export const PROVIDER_LABEL: Record<Provider, string> = {
  google: 'Continue with Google',
  apple: 'Continue with Apple',
  github: 'Continue with GitHub',
};

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3.01h3.88c2.27-2.09 3.58-5.17 3.58-8.82Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.94-2.91l-3.88-3.01c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.29v3.11A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.29 14.28a7.2 7.2 0 0 1 0-4.56V6.61H1.29a12 12 0 0 0 0 10.78l4-3.11Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.34.61 4.59 1.8l3.43-3.43C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.61l4 3.11C6.23 6.86 8.88 4.75 12 4.75Z"
      />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" fill="currentColor" aria-hidden="true">
      <path d="M17.05 12.72c-.03-2.62 2.14-3.88 2.24-3.94-1.22-1.79-3.12-2.03-3.8-2.06-1.62-.16-3.16.95-3.98.95-.82 0-2.09-.93-3.43-.9-1.77.03-3.4 1.03-4.31 2.61-1.84 3.19-.47 7.91 1.32 10.5.87 1.27 1.91 2.69 3.28 2.64 1.32-.05 1.82-.85 3.41-.85 1.59 0 2.04.85 3.43.82 1.42-.02 2.31-1.29 3.18-2.56 1-1.47 1.41-2.89 1.44-2.96-.03-.01-2.76-1.06-2.78-4.2ZM14.6 4.6c.72-.88 1.21-2.1 1.08-3.31-1.04.04-2.3.69-3.05 1.56-.67.78-1.25 2.02-1.09 3.21 1.16.09 2.34-.59 3.06-1.46Z" />
    </svg>
  );
}

function GithubMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" fill="currentColor" aria-hidden="true">
      <path d="M12 .3a12 12 0 0 0-3.79 23.4c.6.1.82-.26.82-.58l-.01-2.04c-3.34.72-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.11-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6.01 0c2.29-1.55 3.3-1.23 3.3-1.23.65 1.66.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.8 5.62-5.48 5.92.43.37.81 1.1.81 2.22l-.01 3.29c0 .32.21.69.82.57A12 12 0 0 0 12 .3Z" />
    </svg>
  );
}

const MARKS: Record<Provider, () => React.ReactElement> = {
  google: GoogleMark,
  apple: AppleMark,
  github: GithubMark,
};

interface ProviderButtonProps {
  provider: Provider;
  onClick: (provider: Provider) => void;
  busy?: boolean;
  disabled?: boolean;
}

export function ProviderButton({ provider, onClick, busy, disabled }: ProviderButtonProps) {
  const Mark = MARKS[provider];
  return (
    <button
      onClick={() => onClick(provider)}
      disabled={disabled || busy}
      className={cn(
        'sheen glass group flex min-h-[3.25rem] w-full items-center justify-center gap-3',
        'rounded-(--radius) px-5 text-[0.9375rem] font-medium text-text',
        'transition-[transform,box-shadow] duration-(--duration-fast) ease-(--ease-out-expo)',
        'hover:-translate-y-px active:translate-y-0 active:scale-[0.99]',
        'disabled:pointer-events-none disabled:opacity-50',
      )}
    >
      {busy ? <Spinner /> : <Mark />}
      {PROVIDER_LABEL[provider]}
    </button>
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px] animate-spin [animation-duration:800ms]" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="none" stroke="var(--color-line)" strokeWidth="2.5" />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
