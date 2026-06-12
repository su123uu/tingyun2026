const storage=require('../utils/storage');
const createBusinessId=require('../utils/id').createBusinessId;
const validators=require('../utils/validators');
const assert=validators.assert;
const assertMobile=validators.assertMobile;
const auth=require('./auth');
const catalog=require('./catalog');
const KEY='activity_signups';
const get=()=>storage.get(KEY,[]);
const save=items=>storage.set(KEY,items);
async function listActivitySource(){const cloudActivities=await catalog.listActivityItems();return cloudActivities;}
async function find(id){const source=await listActivitySource();const item=source.find(x=>x.activity_id===id);assert(item,'ACTIVITY_NOT_FOUND','未找到活动');return item;}
function remainingFor(activity){return Math.max(0,activity.capacity-(activity.reserved_count||0)-get().filter(x=>x.activity_id===activity.activity_id&&x.signup_status!=='cancelled').reduce((sum,x)=>sum+x.people_count,0));}
async function remaining(id){return remainingFor(await find(id));}
async function listActivities(){const source=await listActivitySource();return source.map(a=>Object.assign({},a,{remaining_capacity:remainingFor(a)}));}
async function listActivityBanners(){return catalog.listActivityBanners();}
async function getActivityDetail(input){const activity_id=input.activity_id;const activity=await find(activity_id);return Object.assign({},activity,{remaining_capacity:remainingFor(activity)});}
async function createSignup(input){
  assert(input.people_count>0&&input.people_count<=2,'ACTIVITY_SIGNUP_LIMIT','单次报名最多 2 人，更多人数请联系客服');
  assertMobile(input.mobile);
  const activity=await find(input.activity_id);
  const user=await auth.getCurrentUser();
  assert(activity.signup_scope!=='members_only'||user.customer_type==='member','MEMBERS_ONLY','该活动仅限会员报名');
  assert(await remaining(activity.activity_id)>=input.people_count,'ACTIVITY_FULL','活动剩余名额不足');
  const free=activity.fee_type==='free';
  const order_no=createBusinessId('TYACTIVITY');
  const signup={order_no,signup_id:order_no,activity_id:activity.activity_id,title:activity.title,image_url:activity.image_url,date:activity.date,time:activity.time,location:activity.location,people_count:input.people_count,contact_name:input.contact_name,mobile:input.mobile,customer_type:user.customer_type,amount:free?0:input.people_count*(user.customer_type==='member'?activity.member_price:activity.guest_price),signup_status:'pending_confirmation',settlement_status:free?'settled':user.customer_type==='member'?'pending_offline_points':'pending_wechat_pay',created_at:new Date().toISOString()};
  const items=get();items.push(signup);save(items);return signup;
}
async function simulateWechatPay(input){const order_no=input.order_no||input.signup_id;const items=get();const signup=items.find(x=>(x.order_no||x.signup_id)===order_no);assert(signup,'SIGNUP_NOT_FOUND','未找到活动报名');signup.settlement_status='wechat_paid';save(items);return signup;}
async function cancelSignup(input){const order_no=input.order_no||input.signup_id;const items=get();const signup=items.find(x=>(x.order_no||x.signup_id)===order_no);assert(signup,'SIGNUP_NOT_FOUND','未找到活动报名');const activity=await find(signup.activity_id);assert(activity.fee_type==='free','PAID_ACTIVITY_CANCEL_NEED_CONTACT','收费活动请联系客服取消');assert(signup.signup_status!=='cancelled','SIGNUP_ALREADY_CANCELLED','该报名已取消');signup.signup_status='cancelled';signup.cancelled_at=new Date().toISOString();save(items);return signup;}
async function deleteSignup(input){const order_no=input.order_no||input.signup_id;const items=get();const signup=items.find(x=>(x.order_no||x.signup_id)===order_no);assert(signup,'SIGNUP_NOT_FOUND','未找到活动报名');signup.user_deleted_at=new Date().toISOString();save(items);return{order_no,user_deleted_at:signup.user_deleted_at};}
async function listSignups(){const source=await listActivitySource();return get().filter(signup=>!signup.user_deleted_at).map(signup=>{const activity=source.find(item=>item.activity_id===signup.activity_id);return activity?Object.assign({title:activity.title,image_url:activity.image_url,date:activity.date,time:activity.time,location:activity.location,fee_type:activity.fee_type,can_cancel:activity.fee_type==='free'&&signup.signup_status!=='cancelled'},signup):signup;});}
module.exports={listActivities,listActivityBanners,getActivityDetail,createSignup,simulateWechatPay,cancelSignup,deleteSignup,listSignups};
