import { type ReactNode } from "react";

type PageHeaderProps = {
  titleId: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  navigation?: ReactNode;
};

export function PageHeader({ titleId, title, description, actions, navigation }: PageHeaderProps) {
  return (
    <header className="border-b border-app-border pb-5">
      {navigation !== undefined ? <div className="mb-4">{navigation}</div> : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 id={titleId} className="text-2xl font-semibold leading-tight text-app-foreground">
            {title}
          </h1>
          {description !== undefined ? (
            <div className="mt-1.5 min-h-5 text-sm text-app-foreground-muted">{description}</div>
          ) : null}
        </div>
        {actions !== undefined ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </header>
  );
}
