import { cookies } from 'next/headers';

export const accessCookieName = '__Host-ghahvehto-access';
export type PanelResult<T> = {state:'ready';data:T}|{state:'signed-out'}|{state:'unavailable'};
type Cafe = {cafeId:string;name:string;canManageStaff:boolean};
type Branch = {branchId:string;cafeId:string;name:string};
type Page<T> = {items:T[];nextCursor:string|null};
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export const panelId = (input:unknown):input is string => typeof input === 'string' && uuid.test(input);
const object = (value:unknown):value is Record<string,unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

async function read<T>(path:string,parse:(input:unknown)=>T,change?:{method:'PUT'|'PATCH';body:object}):Promise<PanelResult<T>> {
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
