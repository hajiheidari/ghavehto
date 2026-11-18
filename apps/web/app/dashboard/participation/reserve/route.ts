import {panelId,participationVersion,reserveParticipation} from '../../../../lib/cafe-panel';
import {readPanelForm,rejectPanelForm} from '../../../../lib/panel-form';

export async function POST(request:Request) {
  if(process.env.PRIVATE_PARTICIPATION_VIEW!=='1') return rejectPanelForm(404);
  const form=await readPanelForm(request,512);
  if(form instanceof Response) return form;
  const experienceId=form.get('experienceId'),branchId=form.get('branchId'),operationId=form.get('operationId');
  const version=participationVersion(form.get('version'));
  if(form.size!==4||!panelId(experienceId)||!panelId(branchId)||!panelId(operationId)||version===null) return rejectPanelForm(400);
  const result=await reserveParticipation({experienceId,branchId,operationId,version});
  if(result.state==='signed-out') return rejectPanelForm(401);
  // Recover by operation even when the upstream response was interrupted after commit.
  const query=new URLSearchParams({operation:operationId});
  if(result.state==='unavailable') query.set('reservation','unconfirmed');
  return new Response(null,{status:303,headers:{Location:'/dashboard/participation?'+query.toString(),'Cache-Control':'no-store'}});
}
