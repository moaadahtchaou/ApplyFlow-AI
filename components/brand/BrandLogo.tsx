import Image from 'next/image';
import { cn } from '@/lib/utils';

const LOGO_SRC = '/brand/applyflow-logo.png';

export function BrandWordmark({
  className,
  priority = false
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <span
      className={cn(
        'relative block h-10 w-44 shrink-0 overflow-hidden rounded-md bg-white',
        'ring-1 ring-black/5 dark:ring-white/10',
        className
      )}
    >
      <Image
        src={LOGO_SRC}
        alt="ApplyFlow AI"
        width={1536}
        height={1536}
        priority={priority}
        sizes="196px"
        className="absolute left-1/2 top-1/2 h-auto w-full -translate-x-1/2 -translate-y-1/2"
      />
    </span>
  );
}

export function BrandMark({
  className,
  priority = false
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <span
      className={cn(
        'relative block h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-white',
        'shadow-sm ring-1 ring-black/5 dark:ring-white/10',
        className
      )}
    >
      <Image
        src={LOGO_SRC}
        alt=""
        aria-hidden="true"
        width={1536}
        height={1536}
        priority={priority}
        sizes="180px"
        className="absolute left-0 top-1/2 h-auto w-[180px] max-w-none -translate-y-1/2"
      />
    </span>
  );
}
