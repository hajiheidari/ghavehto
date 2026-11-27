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
export function logoutPanelSession() {
  return read('/v1/session/logout',input=>{
    if(!object(input)||input.revoked!==true) throw new Error('Invalid logout receipt');
    return true;
  },{method:'POST',body:{}});
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
    return {documentId:input.documentId,title:input.title,body:input.body,sources:input.sources,revision:Number(input.revision)};
  });
}

export function reviewEditorialRevision(input:{revisionId:string;operationId:string;decision:'approved'|'rejected';lifetimeSeconds:number;reason:string}) {
  return read('/v1/internal/editorial/reviews',receipt=>{
    if(!object(receipt)||!panelId(receipt.id)) throw new Error('Invalid review receipt');
    return receipt.id;
  },{method:'POST',body:input});
}

export function createEditorialDocument(documentId:string,slug:string) {
  return read('/v1/internal/editorial/documents',input=>{
    if(!object(input)||input.id!==documentId) throw new Error('Invalid document receipt');
    return documentId;
  },{method:'POST',body:{documentId,slug}});
}

export function saveEditorialRevision(input:{documentId:string;operationId:string;expectedRevision:number;title:string;body:string;sources:unknown[]}) {
  return read('/v1/internal/editorial/revisions',receipt=>{
    if(!object(receipt)||!panelId(receipt.id)) throw new Error('Invalid revision receipt');
    return receipt.id;
  },{method:'POST',body:input});
}

type EditorialReview={reviewId:string;decision:'approved'|'rejected';reason:string;createdAt:string;expiresAt:string;usable:boolean};
function reviewReceipt(path:string) {
  return read(path,input=>{
    if(!object(input)) throw new Error('Invalid review response');
    const row=input.receipt;
    if(row===null) return null;
    if(!object(row)||!panelId(row.reviewId)||(row.decision!=='approved'&&row.decision!=='rejected')||
      typeof row.reason!=='string'||typeof row.usable!=='boolean'||
      typeof row.createdAt!=='string'||!Number.isFinite(Date.parse(row.createdAt))||
      typeof row.expiresAt!=='string'||!Number.isFinite(Date.parse(row.expiresAt))) throw new Error('Invalid review receipt');
    return row as EditorialReview;
  });
}

export function getEditorialReview(revisionId:string) {
  return reviewReceipt('/v1/internal/editorial/revisions/'+revisionId+'/review');
}
export function getAgentReview(jobId:string) {
  return reviewReceipt('/v1/internal/editorial/jobs/'+jobId+'/review');
}
export function reviewAgentDraft(input:{jobId:string;operationId:string;decision:'approved'|'rejected';lifetimeSeconds:number;reason:string}) {
  return read('/v1/internal/editorial/reviews',receipt=>{
    if(!object(receipt)||!panelId(receipt.id)) throw new Error('Invalid agent review receipt');
    return receipt.id;
  },{method:'POST',body:input});
}
type PendingAgentReview={jobId:string;kind:string;createdAt:string;paused:boolean};
export function getPendingAgentReviews(after?:string) {
  return read('/v1/internal/editorial/jobs'+(after?'?after='+encodeURIComponent(after):''),input=>{
    if(!object(input)||!Array.isArray(input.items)||input.items.length>20||
      !(input.nextCursor===null||panelId(input.nextCursor))||
      !input.items.every((item):item is PendingAgentReview=>object(item)&&panelId(item.jobId)&&typeof item.kind==='string'&&
        typeof item.paused==='boolean'&&typeof item.createdAt==='string'&&Number.isFinite(Date.parse(item.createdAt)))) throw new Error('Invalid review queue');
    return {items:input.items,nextCursor:input.nextCursor};
  });
}
export function getAgentReviewSubject(jobId:string) {
  return read('/v1/internal/editorial/jobs/'+jobId,input=>{
    if(!object(input)||input.jobId!==jobId||typeof input.kind!=='string'||!object(input.payload)||!object(input.result)) throw new Error('Invalid agent review subject');
    return {kind:input.kind,payload:input.payload,result:input.result};
  });
}

type AgentControl={kind:'research'|'content'|'discovery'|'outreach';configured:boolean;paused:boolean;attemptLimit:number};
export function getAgentControls() {
  return read('/v1/internal/editorial/controls',input=>{
    if(!object(input)||!Array.isArray(input.items)||input.items.length!==4||
      !input.items.every((row):row is AgentControl=>object(row)&&['research','content','discovery','outreach'].includes(String(row.kind))&&
        typeof row.configured==='boolean'&&typeof row.paused==='boolean'&&Number.isInteger(row.attemptLimit)&&
        Number(row.attemptLimit)>=1&&Number(row.attemptLimit)<=10)||
      new Set(input.items.map(row=>row.kind)).size!==4) throw new Error('Invalid agent controls');
    return input.items;
  });
}
export function changeAgentControl(input:{kind:'research'|'content';paused:boolean;attemptLimit:number;reason:string}) {
  return read('/v1/internal/editorial/controls',result=>{
    if(!object(result)||typeof result.changed!=='boolean') throw new Error('Invalid control receipt');
    return result.changed;
  },{method:'PUT',body:input});
}
export function changeInternalRole(input:{userId:string;role:'editor'|'operator';enabled:boolean;reason:string}) {
  return read('/v1/internal/editorial/roles',result=>{
    if(!object(result)||typeof result.changed!=='boolean') throw new Error('Invalid role receipt');
    return result.changed;
  },{method:'PUT',body:input});
}

export function submitAgentDraft(input:{kind:'research'|'content';operationId:string;title:string;body:string;sources:unknown[]}) {
  return read('/v1/internal/editorial/jobs',receipt=>{
    if(!object(receipt)||!panelId(receipt.id)) throw new Error('Invalid draft submission receipt');
    return receipt.id;
  },{method:'POST',body:input});
}
export function getDraftSubmission(operation:string) {
  return read('/v1/internal/editorial/submissions/'+operation,input=>{
    if(!object(input)||!panelId(input.jobId)||!['research','content'].includes(String(input.kind))||
      !['queued','leased','retry_wait','awaiting_review','dead'].includes(String(input.state))||
      !Number.isInteger(input.attempts)||!Number.isInteger(input.attemptLimit)||Number(input.attempts)<0||
      Number(input.attemptLimit)<1||Number(input.attemptLimit)>10||Number(input.attempts)>Number(input.attemptLimit)||
      typeof input.paused!=='boolean') throw new Error('Invalid draft submission status');
    return {kind:input.kind as 'research'|'content',state:input.state as 'queued'|'leased'|'retry_wait'|'awaiting_review'|'dead',
      attempts:Number(input.attempts),attemptLimit:Number(input.attemptLimit),paused:input.paused};
  });
}

const trackingMetricKeys=['qrScans','storeClicks','registrations','phoneVerifications','confirmedInteractions'] as const;
export function getOwnerTrackingMetrics(cafeId:string,linkId:string) {
  return read('/v1/internal/tracking-owner/metrics?'+new URLSearchParams({cafeId,linkId}),input=>{
    if(!object(input)||input.linkId!==linkId.toLowerCase()||
      !trackingMetricKeys.every(key=>typeof input[key]==='string'&&/^(0|[1-9][0-9]*)$/.test(input[key]))) {
      throw new Error('Invalid tracking metrics');
    }
    return input as {linkId:string}&Record<typeof trackingMetricKeys[number],string>;
  });
}

type NotificationPreferences={revision:number;loyalty:boolean;experiences:boolean;editorial:boolean;dailyLimit:number};
export type LoyaltyLedger='stamp'|'star'|'tier';
export function getLoyaltySummary() {
  return read('/v1/internal/loyalty-history/summary',input=>{
    const count=(value:unknown)=>value===null||typeof value==='string'&&/^(0|[1-9][0-9]*)$/.test(value);
    if(!object(input)||typeof input.asOf!=='string'||!Number.isFinite(Date.parse(input.asOf))||
      !object(input.stars)||!count(input.stars.availableUnits)||!object(input.tier)||!count(input.tier.points)||
      !Number.isInteger(input.tier.year)||Number(input.tier.year)<2000||Number(input.tier.year)>9999) throw new Error('Invalid loyalty summary');
    return input as {asOf:string;stars:{availableUnits:string|null};tier:{year:number;points:string|null}};
  });
}
export type LoyaltyHistoryEntry={id:string;units:number;kind:string;recordedAt:string;effectiveAt:string;reversalOf:string|null;
  expiresAt?:string|null;cafeId?:string;programId?:string;programVersion?:number;qualificationYear?:number};
export function getLoyaltyHistory(ledger:LoyaltyLedger,after?:string) {
  const date=(value:unknown):value is string=>typeof value==='string'&&Number.isFinite(Date.parse(value));
  return read('/v1/internal/loyalty-history?'+new URLSearchParams({ledger,...(after?{after}:{})}),input=>{
    if(!object(input)||input.ledger!==ledger||!Array.isArray(input.items)||input.items.length>20||
      !(input.nextCursor===null||panelId(input.nextCursor))||!input.items.every(row=>object(row)&&panelId(row.id)&&
        Number.isInteger(row.units)&&Number(row.units)!==0&&Math.abs(Number(row.units))<=1000000000&&
        ['award','spend','expire','reversal'].includes(String(row.kind))&&date(row.recordedAt)&&date(row.effectiveAt)&&
        (row.reversalOf===null||panelId(row.reversalOf))&&
        (ledger==='tier'?(Number.isInteger(row.qualificationYear)&&Number(row.qualificationYear)>=2000&&Number(row.qualificationYear)<=9999&&['award','reversal'].includes(String(row.kind))):
          ((row.expiresAt===null||date(row.expiresAt))&&(ledger!=='stamp'||(panelId(row.cafeId)&&panelId(row.programId)&&Number.isInteger(row.programVersion)&&Number(row.programVersion)>0)))))) {
      throw new Error('Invalid loyalty history');
    }
    return {items:input.items as LoyaltyHistoryEntry[],nextCursor:input.nextCursor as string|null};
  });
}
export function notificationPreferences(change?:{expectedRevision:number;loyalty:boolean;experiences:boolean;editorial:boolean;dailyLimit:number}) {
  return read('/v1/internal/preferences',input=>{
    if(!object(input)||!Number.isSafeInteger(input.revision)||Number(input.revision)<0||
      typeof input.loyalty!=='boolean'||typeof input.experiences!=='boolean'||typeof input.editorial!=='boolean'||
      !Number.isInteger(input.dailyLimit)||Number(input.dailyLimit)<0||Number(input.dailyLimit)>10) throw new Error('Invalid notification preferences');
    return input as NotificationPreferences;
  },change?{method:'PUT',body:change}:undefined);
}
