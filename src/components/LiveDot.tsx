/* The pulsing "on air" dot on the Live Now buttons. It takes the button's text
   colour, and the pulse stops for people who ask for reduced motion (the solid
   dot stays). Decorative: the button's own text says what it is. */
export default function LiveDot({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`relative flex h-2 w-2 shrink-0 ${className}`}>
      <span className="absolute inline-flex h-full w-full rounded-full bg-current opacity-75 motion-safe:animate-ping" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
    </span>
  );
}
