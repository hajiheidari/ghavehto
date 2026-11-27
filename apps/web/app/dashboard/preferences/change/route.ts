import {notificationPreferences} from '../../../../lib/cafe-panel';
import {readPanelForm,rejectPanelForm} from '../../../../lib/panel-form';

export async function POST(request:Request) {
  if(process.env.PRIVATE_PREFERENCES_VIEW!=='1') return rejectPanelForm(404);
  const form=await readPanelForm(request,1024);
  if(form instanceof Response) return form;
  const expected=form.get('expectedRevision'),loyalty=form.get('loyalty'),experiences=form.get('experiences'),editorial=form.get('editorial'),daily=form.get('dailyLimit');
  if(form.size!==5||!expected||!/^(0|[1-9][0-9]{0,9})$/.test(expected)||Number(expected)>2147483646||
    ![loyalty,experiences,editorial].every(value=>value==='true'||value==='false')||
    !daily||!/^(0|[1-9]|10)$/.test(daily)) return rejectPanelForm(400);
  const result=await notificationPreferences({expectedRevision:Number(expected),loyalty:loyalty==='true',
    experiences:experiences==='true',editorial:editorial==='true',dailyLimit:Number(daily)});
  if(result.state==='signed-out') return rejectPanelForm(401);
  return new Response(null,{status:303,headers:{Location:'/dashboard/preferences?result='+
    (result.state==='ready'?'saved':'unconfirmed'),'Cache-Control':'no-store'}});
}
