import {randomUUID} from 'node:crypto';
export default function RevisionForm({documentId,revision=0,title='',body='',sources=[]}:{documentId:string;revision?:number;title?:string;body?:string;sources?:unknown[]}) {
  return <form method="post" action="/dashboard/editorial/save">
    <h2>ثبت نسخهٔ تازه</h2>
    <input type="hidden" name="documentId" value={documentId}/>
    <input type="hidden" name="operationId" value={randomUUID()}/>
    <input type="hidden" name="expectedRevision" value={revision}/>
    <label htmlFor="title">عنوان</label><input id="title" name="title" required maxLength={160} defaultValue={title}/>
    <label htmlFor="body">متن</label><textarea id="body" name="body" required maxLength={50000} defaultValue={body}/>
    <label htmlFor="sources">مستندات منابع به قالب JSON</label>
    <textarea id="sources" name="sources" dir="ltr" required defaultValue={JSON.stringify(sources,null,2)}/>
    <p>برای محتوای تألیفی rights برابر original و برای منبع دارای مجوز، rights برابر permitted همراه با نشانی HTTPS و مستندات مجوز ثبت شود.</p>
    <button type="submit">ثبت نسخهٔ تازه</button>
  </form>;
}
