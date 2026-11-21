import { cookies } from 'next/headers';

export const accessCookieName = '__Host-ghahvehto-access';
export type PanelResult<T> = {state:'ready';data:T}|{state:'signed-out'}|{state:'unavailable'};
type Cafe = {cafeId:string;name:string;canManageStaff:boolean};
type Branch = {branchId:string;cafeId:string;name:string};
type Page<T> = {items:T[];nextCursor:string|null};
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export const panelId = (input:unknown):input is string => typeof input === 'string' && uuid.test(input);
const object = (value:unknown):value is Record<string,unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

async function read<T>(path:string,parse:(input:unknown)=>T,change?:{method:'PUT'|'PATCH'|'POST';body:object}):Promise<PanelResult<T>> {
  const token = (await cookies()).get(accessCookieName)?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return {state:'signed-out'};
  try {
    const response = await fetch(new URL(path,process.env.API_BASE_URL ?? 'http://127.0.0.1:4101'),{
      cache:'no-store',redirect:'error',credentials:'omit',signal:AbortSignal.timeout(3000),
      headers:{Authorization:`Bearer ${token}`,...(change?{'Content-Type':'application/json'}:{})},
      ...(change?{method:change.method,body:JSON.stringify(change.body)}:{}),
    });
    if (response.status===401) return {state:'signed-out'};
    if (!response.ok) return {state:'unavailable'};
    return {state:'ready',data:parse(await response.json())};
  } catch { return {state:'unavailable'}; }
}
export function staffPanelOrigin():string|null {
  const value=process.env.PANEL_WRITE_ORIGIN;
  if(!value) return null;
  try {
    const origin=new URL(value);
    return origin.protocol==='https:'&&origin.origin===value?value:null;
  } catch {return null;}
}
export function changePanelStaff(cafeId:string,branchId:string,userId:string,enabled:boolean) {
  if(![cafeId,branchId,userId].every(panelId)) return Promise.resolve({state:'unavailable'} as const);
  return read(`/v1/cafes/${cafeId}/branches/${branchId}/staff/${userId}`,input=>{
    if(!object(input)||input.enabled!==enabled) throw new Error('Invalid staff update response');
    return enabled;
  },{method:'PUT',body:{enabled}});
}
export function cafeProfile(cafeId:string,name?:string):Promise<PanelResult<{name:string}>> {
  if(!panelId(cafeId)) return Promise.resolve({state:'unavailable'});
  return read(`/v1/cafes/${cafeId}/profile`,input=>{
    if(!object(input)||input.cafeId!==cafeId||typeof input.name!=='string') throw new Error('Invalid café profile');
    return {name:input.name};
  },name===undefined?undefined:{method:'PATCH',body:{name}});
}
function page<T>(input:unknown,valid:(item:unknown)=>item is T):Page<T> {
  if (!object(input) || !Array.isArray(input.items) || input.items.length>50 ||
      !input.items.every(valid) || !(input.nextCursor===null || panelId(input.nextCursor))) throw new Error('Invalid panel response');
  return {items:input.items,nextCursor:input.nextCursor as string|null};
}
export function getMyCafes(after?:string):Promise<PanelResult<Page<Cafe>>> {
  return read('/v1/cafes'+(after?`?after=${encodeURIComponent(after)}`:''),input=>page(input,
    (row):row is Cafe => object(row)&&panelId(row.cafeId)&&typeof row.name==='string'&&typeof row.canManageStaff==='boolean'));
}
export function getMyBranches(cafeId:string,after?:string):Promise<PanelResult<Page<Branch>>> {
  if (!panelId(cafeId)) return Promise.resolve({state:'unavailable'});
  return read(`/v1/cafes/${cafeId}/branches`+(after?`?after=${encodeURIComponent(after)}`:''),input=>page(input,
    (row):row is Branch => object(row)&&panelId(row.branchId)&&row.cafeId===cafeId&&typeof row.name==='string'));
}
export function getBranchStaff(cafeId:string,branchId:string,after?:string):Promise<PanelResult<{userIds:string[];nextCursor:string|null}>> {
  if (!panelId(cafeId)||!panelId(branchId)) return Promise.resolve({state:'unavailable'});
  return read(`/v1/cafes/${cafeId}/branches/${branchId}/staff`+(after?`?after=${encodeURIComponent(after)}`:''),input=>{
    if (!object(input)||!Array.isArray(input.userIds)||input.userIds.length>50||
      !input.userIds.every(panelId)||!(input.nextCursor===null||panelId(input.nextCursor))) throw new Error('Invalid staff roster');
    return {userIds:input.userIds as string[],nextCursor:input.nextCursor as string|null};
  });
}

export type ExperiencePreview={experienceId:string;cafeId:string;title:string|null;active:boolean;version:number;branchId:string|null;branchName:string|null;startsAt:string;endsAt:string;firstRecordedVisitOnly:boolean;perMemberLimit:number;remainingStock:number;remainingBudgetUnits:string};
export function getOwnerExperiences(cafeId:string,after?:string):Promise<PanelResult<Page<ExperiencePreview>>> {
  if(!panelId(cafeId)||(after!==undefined&&!panelId(after))) return Promise.resolve({state:'unavailable'});
  const date=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value));
  return read(`/v1/cafes/${cafeId}/experiences`+(after?`?after=${encodeURIComponent(after)}`:''),input=>page(input,
    (row):row is ExperiencePreview=>object(row)&&panelId(row.experienceId)&&row.cafeId===cafeId
      &&(row.title===null||typeof row.title==='string'&&row.title.length<=120)&&typeof row.active==='boolean'
      &&Number.isInteger(row.version)&&Number(row.version)>0&&(row.branchId===null||panelId(row.branchId))
      &&(row.branchName===null||typeof row.branchName==='string')&&date(row.startsAt)&&date(row.endsAt)
      &&typeof row.firstRecordedVisitOnly==='boolean'&&Number.isInteger(row.perMemberLimit)&&Number(row.perMemberLimit)>0
      &&Number.isInteger(row.remainingStock)&&Number(row.remainingStock)>=0
      &&typeof row.remainingBudgetUnits==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(row.remainingBudgetUnits)));
}

export async function getParticipationReceipt(operationId:string) {
  if(!panelId(operationId)) return {state:'unavailable'} as const;
  return read('/v1/internal/participation/reservations/'+operationId,input=>{
    if(!object(input)||!panelId(input.claimId)||
      (input.state!=='reserved'&&input.state!=='cancelled'&&input.state!=='fulfilled')) throw new Error('Invalid participation receipt');
    return {claimId:input.claimId,state:input.state} as const;
  });
}

export function participationVersion(input:unknown):number|null {
  if(typeof input!=='string'||!/^[1-9][0-9]{0,9}$/.test(input)) return null;
  const version=Number(input);
  return version<=2147483647?version:null;
}

export function reserveParticipation(input:{experienceId:string;branchId:string;operationId:string;version:number}) {
  return read('/v1/internal/participation/reservations',receipt=>{
    if(!object(receipt)||!panelId(receipt.id)) throw new Error('Invalid reservation response');
    return receipt.id;
  },{method:'POST',body:input});
}
export const participationEligibility={
  eligible:'قابل رزرو',
  outside_window:'خارج از بازهٔ رزرو',
  capacity_unavailable:'ظرفیت رزرو تکمیل است',
  limit_reached:'به سقف مشارکت رسیده‌اید',
  prior_participation:'این پیشنهاد ویژهٔ نخستین مشارکت ثبت‌شده است',
} as const;

export function getParticipationOffer(experienceId:string,branchId:string,version:number) {
  const query=new URLSearchParams({experienceId,branchId,version:String(version)});
  return read('/v1/internal/participation/offer?'+query,input=>{
    if(!object(input)||(input.title!==null&&typeof input.title!=='string')||typeof input.branchName!=='string'||
      typeof input.startsAt!=='string'||!Number.isFinite(Date.parse(input.startsAt))||
      typeof input.endsAt!=='string'||!Number.isFinite(Date.parse(input.endsAt))||
      typeof input.eligibility!=='string'||!Object.hasOwn(participationEligibility,input.eligibility)) throw new Error('Invalid participation offer');
    return {title:input.title,branchName:input.branchName,startsAt:new Date(input.startsAt),endsAt:new Date(input.endsAt),
      eligibility:input.eligibility as keyof typeof participationEligibility};
  });
}

export function cancelParticipation(input:{claimId:string;operationId:string;reason:string}) {
  return read('/v1/internal/participation/cancellations',receipt=>{
    if(!object(receipt)||!panelId(receipt.id)) throw new Error('Invalid cancellation response');
    return receipt.id;
  },{method:'POST',body:input});
}

export function getFulfillmentClaim(claimId:string) {
  return read('/v1/internal/participation/fulfillments/'+claimId,input=>{
    if(!object(input)||input.claimId!==claimId||(input.title!==null&&typeof input.title!=='string')||
      typeof input.branchName!=='string'||(input.state!=='reserved'&&input.state!=='cancelled'&&input.state!=='fulfilled')) {
      throw new Error('Invalid fulfillment preview');
    }
    return {title:input.title,branchName:input.branchName,state:input.state} as const;
  });
}

export function fulfillParticipation(input:{claimId:string;operationId:string;reason:string}) {
  return read('/v1/internal/participation/fulfillments',receipt=>{
    if(!object(receipt)||!panelId(receipt.id)) throw new Error('Invalid fulfillment response');
    return receipt.id;
  },{method:'POST',body:input});
}

type ParticipationHistoryItem={operationId:string;title:string|null;claimedAt:string;state:'reserved'|'cancelled'|'fulfilled'};

export function getParticipationHistory(after?:string) {
  return read('/v1/internal/participation/reservations'+(after?'?after='+encodeURIComponent(after):''),input=>{
    if(!object(input)||!Array.isArray(input.items)||input.items.length>20||
      !(input.nextCursor===null||panelId(input.nextCursor))) throw new Error('Invalid participation history');
    const items=input.items;
    if(!items.every((item):item is ParticipationHistoryItem=>object(item)&&panelId(item.operationId)&&
      (typeof item.title==='string'||item.title===null)&&typeof item.claimedAt==='string'&&Number.isFinite(Date.parse(item.claimedAt))&&
      (item.state==='reserved'||item.state==='cancelled'||item.state==='fulfilled'))) throw new Error('Invalid participation history item');
    return {items,nextCursor:input.nextCursor};
  });
}

type TrackingLink={linkId:string;branchId:string;active:boolean;expiresAt:string};
export function getOwnerTrackingLinks(cafeId:string,after?:string) {
  const query=new URLSearchParams({cafeId,...(after?{after}:{})});
  return read('/v1/internal/tracking-owner/links?'+query,input=>{
    if(!object(input)||!Array.isArray(input.items)||input.items.length>20||
      !(input.nextCursor===null||panelId(input.nextCursor))||
      !input.items.every((item):item is TrackingLink=>object(item)&&panelId(item.linkId)&&panelId(item.branchId)&&
        typeof item.active==='boolean'&&typeof item.expiresAt==='string'&&Number.isFinite(Date.parse(item.expiresAt)))) {
      throw new Error('Invalid tracking link page');
    }
    return {items:input.items,nextCursor:input.nextCursor};
  });
}
export function stopOwnerTrackingLink(cafeId:string,linkId:string,reason:string) {
  return read('/v1/internal/tracking-owner/stop-in-cafe',input=>{
    if(!object(input)||typeof input.changed!=='boolean') throw new Error('Invalid stop receipt');
    return input.changed;
  },{method:'POST',body:{cafeId,linkId,reason}});
}

type EditorialDocument={documentId:string;slug:string;revisionId:string|null;revision:number;title:string|null};
export function getEditorialDocuments(after?:string) {
  return read('/v1/internal/editorial/documents'+(after?'?after='+encodeURIComponent(after):''),input=>{
    if(!object(input)||!Array.isArray(input.items)||input.items.length>20||
      !(input.nextCursor===null||panelId(input.nextCursor))||
      !input.items.every((row):row is EditorialDocument=>object(row)&&panelId(row.documentId)&&typeof row.slug==='string'&&
        (row.revisionId===null||panelId(row.revisionId))&&Number.isSafeInteger(row.revision)&&Number(row.revision)>=0&&
        (row.title===null||typeof row.title==='string'))) throw new Error('Invalid editorial inventory');
    return {items:input.items,nextCursor:input.nextCursor};
  });
}
export function getEditorialRevision(id:string) {
  return read('/v1/internal/editorial/revisions/'+id,input=>{
    if(!object(input)||input.revisionId!==id||!panelId(input.documentId)||typeof input.title!=='string'||
      typeof input.body!=='string'||!Array.isArray(input.sources)||input.sources.length>50||
      !Number.isSafeInteger(input.revision)||Number(input.revision)<1) throw new Error('Invalid editorial revision');
    return {title:input.title,body:input.body,sources:input.sources,revision:Number(input.revision)};
  });
}
