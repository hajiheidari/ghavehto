import {panelId,submitOwnershipClaim,withdrawOwnershipClaim} from '../../../../lib/cafe-panel';
import {readPanelForm,rejectPanelForm} from '../../../../lib/panel-form';

export async function POST(request:Request) {
  if(process.env.PRIVATE_OWNERSHIP_CLAIMS_VIEW!=='1') return rejectPanelForm(404);
  const form=await readPanelForm(request,192);
  if(form instanceof Response) return form;
  const operation=form.get('operation'),id=form.get(operation==='submit'?'branchId':'claimId');
  if(form.size!==2||!panelId(id)||!['submit','withdraw'].includes(operation??'')) return rejectPanelForm(400);
  const result=operation==='submit'?await submitOwnershipClaim(id):await withdrawOwnershipClaim(id);
  if(result.state==='signed-out') return rejectPanelForm(401);
  return new Response(null,{status:303,headers:{Location:'/dashboard/ownership?result='+
    (result.state==='ready'?(operation==='submit'?'submitted':'withdrawn'):'unconfirmed'),'Cache-Control':'no-store'}});
}
