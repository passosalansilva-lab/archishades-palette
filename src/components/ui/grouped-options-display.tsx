import { cn } from '@/lib/utils';

interface OptionItem {
  name: string;
  groupName?: string;
  priceModifier?: number;
}

interface GroupedOptionsDisplayProps {
  options: OptionItem[];
  className?: string;
  showGroupName?: boolean;
  variant?: 'default' | 'compact' | 'badges';
}

/**
 * Agrupa opções pelo groupName e exibe de forma organizada
 * Exemplo: "Massa: Penne" ou "Proteína: Carne Moída, Calabresa"
 */
export function groupOptionsByName(options: OptionItem[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  
  options.forEach((opt) => {
    const group = opt.groupName || 'Itens';
    if (!grouped.has(group)) {
      grouped.set(group, []);
    }
    grouped.get(group)!.push(opt.name);
  });
  
  return grouped;
}

export function GroupedOptionsDisplay({ 
  options, 
  className,
  showGroupName = true,
  variant = 'default'
}: GroupedOptionsDisplayProps) {
  if (!options || options.length === 0) return null;
  
  const hasGroupNames = options.some(o => o.groupName);
  const grouped = groupOptionsByName(options);
  
  if (variant === 'badges') {
    return (
      <div className={cn("flex flex-wrap gap-1", className)}>
        {Array.from(grouped.entries()).map(([groupName, names], idx) => (
          <span 
            key={idx}
            className="inline-flex items-center px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground text-xs"
          >
            {showGroupName && hasGroupNames && (
              <span className="font-medium mr-1">{groupName}:</span>
            )}
            {names.join(', ')}
          </span>
        ))}
      </div>
    );
  }
  
  if (variant === 'compact') {
    return (
      <div className={cn("text-xs text-muted-foreground", className)}>
        {Array.from(grouped.entries()).map(([groupName, names], idx) => (
          <span key={idx}>
            {idx > 0 && ' • '}
            {showGroupName && hasGroupNames && (
              <span className="font-medium">{groupName}: </span>
            )}
            {names.join(', ')}
          </span>
        ))}
      </div>
    );
  }
  
  // Default: cada grupo em uma linha
  return (
    <div className={cn("space-y-0.5", className)}>
      {Array.from(grouped.entries()).map(([groupName, names], idx) => (
        <p key={idx} className="text-xs text-muted-foreground">
          {showGroupName && hasGroupNames ? (
            <>
              <span className="font-medium text-foreground/70">{groupName}:</span>{' '}
              {names.join(', ')}
            </>
          ) : (
            <>+ {names.join(', ')}</>
          )}
        </p>
      ))}
    </div>
  );
}
