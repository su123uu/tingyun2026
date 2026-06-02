const storage=require('../utils/storage');
const activities=require('../mock/activities').activities;
const createId=require('../utils/id').createId;
const validators=require('../utils/validators');
const assert=validators.assert;
const assertMobile=validators.assertMobile;
const auth=require('./auth');
const KEY='activity_signups';
const get=()=>storage.get(KEY,[]);
const save=items=>storage.set(KEY,items);
function find(id){const item=activities.find(x=>x.activity_id===id);assert(item,'ACTIVITY_NOT_FOUND','未找到活动');return item;}
function remaining(id){const activity=find(id);return Math.max(0,activity.capacity-(activity.reserved_count||0)-get().filter(x=>x.activity_id===id&&x.signup_status!=='cancelled').reduce((sum,x)=>sum+x.people_count,0));}
async function listActivities(){return activities.map(a=>Object.assign({},a,{remaining_capacity:remaining(a.activity_id)}));}
async function getActivityDetail(input){const activity_id=input.activity_id;const activity=find(activity_id);return Object.assign({},activity,{remaining_capacity:remaining(activity_id)});}
async function createSignup(input){
  assert(input.people_count>0&&input.people_count<=2,'ACTIVITY_SIGNUP_LIMIT','单次报名最多 2 人，更多人数请联系客服');
  assertMobile(input.mobile);
  const activity=find(input.activity_id);
  const user=await auth.getCurrentUser();
  assert(activity.signup_scope!=='members_only'||user.customer_type==='member','MEMBERS_ONLY','该活动仅限会员报名');
  assert(remaining(activity.activity_id)>=input.people_count,'ACTIVITY_FULL','活动剩余名额不足');
  const free=activity.fee_type==='free';
  const signup={signup_id:createId('SIGNUP'),activity_id:activity.activity_id,title:activity.title,image_url:activity.image_url,date:activity.date,time:activity.time,location:activity.location,people_count:input.people_count,contact_name:input.contact_name,mobile:input.mobile,customer_type:user.customer_type,amount:free?0:input.people_count*(user.customer_type==='member'?activity.member_price:activity.guest_price),signup_status:'pending_confirmation',settlement_status:free?'settled':user.customer_type==='member'?'pending_offline_points':'pending_wechat_pay',created_at:new Date().toISOString()};
  const items=get();items.push(signup);save(items);return signup;
}
async function simulateWechatPay(input){const signup_id=input.signup_id;const items=get();const signup=items.find(x=>x.signup_id===signup_id);assert(signup,'SIGNUP_NOT_FOUND','未找到活动报名');signup.settlement_status='wechat_paid';save(items);return signup;}
async function listSignups(){return get().map(signup=>{const activity=activities.find(item=>item.activity_id===signup.activity_id);return activity?Object.assign({title:activity.title,image_url:activity.image_url,date:activity.date,time:activity.time,location:activity.location},signup):signup;});}
module.exports={listActivities,getActivityDetail,createSignup,simulateWechatPay,listSignups};
