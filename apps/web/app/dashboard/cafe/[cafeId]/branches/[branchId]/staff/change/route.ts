import {changePanelStaff,panelId} from '../../../../../../../../lib/cafe-panel';
import {readPanelForm,rejectPanelForm} from '../../../../../../../../lib/panel-form';

export async function POST(request:Request,{params}:{params:Promise<{cafeId:string;branchId:string}>}) {
  const {cafeId,branchId}=await params;
  if(!panelId(cafeId)||!panelId(branchId)) return rejectPanelForm(400);
  const form=await readPanelForm(request,512);
  if(form instanceof Response) return form;
  const userId=form.get('userId'),operation=form.get('operation');
  if(form.size!==2||!panelId(userId)||(operation!=='grant'&&operation!=='revoke')) return rejectPanelForm(400);
  const result=await changePanelStaff(cafeId,branchId,userId,operation==='grant');
  const outcome=result.state==='ready'?'saved':result.state;
  return new Response(null,{status:303,headers:{
    Location:`/dashboard/cafe/${cafeId}/branches/${branchId}/staff?outcome=${outcome}`,
    'Cache-Control':'no-store',
  }});
}
