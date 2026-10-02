// 임시저장: 이 브라우저의 IndexedDB에 현재 작업(원본 이미지 Blob 포함)을 보관한다. 파일로 내보내는 .sabari 와는 별개다.
import type { OpenedProject } from './project';

export interface Draft extends OpenedProject { savedAt: number }

const DB = 'sabari-mockup', STORE = 'drafts', KEY = 'current';

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    if (!('indexedDB' in window)) return rej(new Error('이 브라우저에서는 임시저장을 사용할 수 없습니다.'));
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(new Error('임시저장 공간을 열지 못했습니다. 브라우저의 사이트 데이터 차단 설정을 확인해 주세요.'));
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); res(req.result); };
    t.onerror = t.onabort = () => { db.close(); rej(new Error('임시저장에 실패했습니다. 저장 공간이 부족할 수 있습니다. 프로젝트 저장(.sabari)을 사용해 주세요.')); };
  });
}

export const putDraft = (d: Draft) => tx('readwrite', (s) => s.put(d, KEY));
export const getDraft = () => tx<Draft | undefined>('readonly', (s) => s.get(KEY));
