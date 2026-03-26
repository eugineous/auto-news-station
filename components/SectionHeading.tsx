type Props = {
  eyebrow?: string;
  title: string;
  description?: string;
  cta?: React.ReactNode;
};

export function SectionHeading({ eyebrow, title, description, cta }: Props) {
  return (
    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        {eyebrow ? (
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="text-2xl font-semibold text-white md:text-3xl">{title}</h2>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm text-white/70">{description}</p>
        ) : null}
      </div>
      {cta ? <div className="shrink-0">{cta}</div> : null}
    </div>
  );
}
