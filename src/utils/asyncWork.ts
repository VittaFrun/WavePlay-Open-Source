/** Share identical reads; invalidation prevents obsolete results from being applied. */
export function createLatestRead<T>(read: () => Promise<T>, apply: (value: T) => void) {
  let generation = 0;
  let pending: { generation: number; promise: Promise<void> } | undefined;
  return {
    invalidate() { generation += 1; },
    run() {
      if (pending?.generation === generation) return pending.promise;
      const requested = generation;
      const promise = read().then(value => { if (generation === requested) apply(value); })
        .finally(() => { if (pending?.promise === promise) pending = undefined; });
      pending = { generation: requested, promise };
      return promise;
    },
  };
}

export function reconcileRows<T>(previous: T[], next: T[], key: (row:T)=>string|number = row=>(row as {id:string|number}).id): T[] {
  const indexed = new Map(previous.map(row => [key(row), row]));
  const result = next.map(row => {
    const old = indexed.get(key(row));
    return old && Object.keys(row as object).length === Object.keys(old as object).length &&
      Object.keys(row as object).every(key => {
        const a=row[key as keyof T], b=old[key as keyof T];
        return Object.is(a,b)||(Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((value,index)=>Object.is(value,b[index])));
      }) ? old : row;
  });
  return result.length === previous.length && result.every((row, index) => row === previous[index]) ? previous : result;
}

export function createProgressGate() {
  let previous = -1, previousAt = 0;
  return (value:number, now:number) => {
    const progress = Math.max(0, Math.min(1, value));
    if (progress === previous) return false;
    if (previous < 0 || progress === 1 || (now - previousAt >= 120 && Math.abs(progress - previous) >= 0.01)) {
      previous=progress; previousAt=now; return true;
    }
    return false;
  };
}

/** Retain the newest queued snapshot while the current disk write completes. */
export function createCoalescedWriter<T>(write:(value:T)=>Promise<void>) {
  let pending:{value:T}|undefined;
  let draining:Promise<void>|undefined;
  const drain=async()=>{
    while(pending){const current=pending.value;pending=undefined;await write(current);}
  };
  const flush=():Promise<void>=>{
    if(!draining)draining=Promise.resolve().then(drain).then(()=>{
      draining=undefined;
      // A submit may land after drain's last await and before settlement.
      if(pending)return flush();
    },error=>{draining=undefined;throw error;});
    return draining;
  };
  return {
    submit(value:T){
      pending={value};
      return flush();
    },
  };
}

export function recoveryDelay(connected: boolean, failures: number) {
  return failures ? Math.min(60_000, 5_000 * 2 ** Math.min(failures - 1, 4)) : connected ? 15_000 : 5_000;
}

/** Preserve every incremental write; a failed item is retried before newer items. */
export function createBufferedWriter<T>(write:(value:T)=>Promise<void>) {
  const pending:T[]=[];
  let draining:Promise<void>|undefined;
  const flush=():Promise<void>=>{
    if(!draining)draining=Promise.resolve().then(async()=>{
      while(pending.length){
        const current=pending[0];
        await write(current);
        pending.shift();
      }
    }).then(()=>{draining=undefined;if(pending.length)return flush();},error=>{draining=undefined;throw error;});
    return draining;
  };
  return {submit(value:T){pending.push(value);return flush();},flush};
}
