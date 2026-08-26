export function Panel({
  title,
  meta,
  children,
  className = "",
  flush = false,
  bound = false,
  refuse = false,
}: {
  title?: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  flush?: boolean;
  bound?: boolean;
  refuse?: boolean;
}) {
  return (
    <section
      className={`panel ${flush ? "panel-flush" : ""} ${bound ? "panel-bound" : ""} ${refuse ? "panel-refuse" : ""} ${className}`}
    >
      {title || meta ? (
        <header className={`panel-head ${flush ? "px-4 pt-3 mb-0 pb-2" : ""}`}>
          {title ? <h2 className="label m-0">{title}</h2> : <span />}
          {meta ? <div className="mono text-mute">{meta}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}
