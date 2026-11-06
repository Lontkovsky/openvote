import { useRef } from 'react';
import { Categories } from '../../../packages/domain/src/index.ts';

type CategorySelectProps = {
  multiple: boolean;
  selected: string[];
  onChange: (selected: string[]) => void;
};

export function CategorySelect({ multiple, selected, onChange }: CategorySelectProps) {
  const details = useRef<HTMLDetailsElement>(null);
  const select = (category: string) => {
    if (multiple) {
      onChange(selected.includes(category) ? selected.filter(item => item !== category) : [...selected, category]);
      return;
    }
    onChange([category]);
    details.current?.removeAttribute('open');
  };
  return <details ref={details} className="category-select" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.removeAttribute('open'); }} onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.removeAttribute('open'); event.currentTarget.querySelector('summary')?.focus(); } }}>
    <summary><span className="visually-hidden">Категорія: </span>{multiple ? (selected.length === 0 ? 'Усі категорії' : `Обрано: ${selected.length}`) : (selected[0] ?? 'Оберіть категорію')}</summary>
    <div className="category-options" role="group" aria-label={multiple ? 'Категорії' : 'Категорія'}>
      {multiple && <button type="button" aria-pressed={selected.length === 0} onClick={() => onChange([])}>Усі категорії</button>}
      {Categories.map(category => <button type="button" aria-pressed={selected.includes(category)} key={category} onClick={() => select(category)}>{category}</button>)}
    </div>
  </details>;
}
