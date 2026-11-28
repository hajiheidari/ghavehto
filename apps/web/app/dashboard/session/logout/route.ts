import {cookies} from 'next/headers';
import {accessCookieName,logoutPanelSession} from '../../../../lib/cafe-panel';
import {readPanelForm,rejectPanelForm} from '../../../../lib/panel-form';

export async function POST(request:Request) {
  const form=await readPanelForm(request,128);
  if(form instanceof Response) return form;
  if(form.size!==1||form.get('confirm')!=='logout') return rejectPanelForm(400);
  const result=await logoutPanelSession();
  if(result.state!=='unavailable') {
    // Match the original host-only, secure cookie scope; never accept a client-supplied name/domain.
    (await cookies()).set(accessCookieName,'',{httpOnly:true,secure:true,sameSite:'strict',path:'/',maxAge:0});
  }
  return new Response(null,{status:303,headers:{Location:'/dashboard/session?result='+
    (result.state==='unavailable'?'unconfirmed':'signed-out'),'Cache-Control':'no-store'}});
}
