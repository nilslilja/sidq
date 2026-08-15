import { forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

/*
 * Flat by construction. No shadow, no gradient, no ring-offset glow.
 * States are carried by border and background alone, and every variant has a
 * designed hover, focus, active and disabled, including the quiet ones.
 */
export const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'font-medium select-none',
    'transition-[background-color,border-color,color,transform,box-shadow] duration-(--duration-fast) ease-(--ease-out-expo)',
    'active:scale-[0.985]',
    'disabled:pointer-events-none disabled:opacity-40',
  ],
  {
    variants: {
      variant: {
        accent:
          'sheen bg-accent text-accent-text shadow-[0_8px_24px_-8px_rgba(79,70,229,0.55)] ' +
          'hover:bg-accent/92 hover:-translate-y-px active:translate-y-0 active:bg-accent',
        outline: 'sheen glass text-text hover:-translate-y-px active:translate-y-0',
        ghost: 'text-muted hover:text-text',
        danger: 'glass text-muted hover:text-text',
      },
      size: {
        sm: 'h-9 px-3 text-sm rounded-sm',
        md: 'h-11 px-5 text-[0.9375rem] rounded-(--radius)',
        lg: 'h-13 px-7 text-base rounded-(--radius)',
        icon: 'size-11 rounded-full',
      },
      block: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'accent', size: 'md', block: false },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, block, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size, block }), className)}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
