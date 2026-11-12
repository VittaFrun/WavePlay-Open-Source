export function toggleVisibleSelection(selected: ReadonlySet<string>, visible: string[]) {
  const next=new Set(selected);
  const remove=visible.length>0&&visible.every(id=>next.has(id));
  for(const id of visible) { if(remove)next.delete(id);else next.add(id); }
  return next;
}
