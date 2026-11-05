/* Plan data for the Stats tab — v2, redesigned Nov 5 2026.
   Three or four quests a day instead of fifteen: a daily core (read, skin, check-in),
   stacked quests for things Mauricio already does (gym, work, class, going out),
   one themed day quest per weekday, and a monthly measured benchmark per stat.
   Quest ids: pl_<stat> or pl_<stat>.<tag>; XP files to the stat before the dot. */
const PLAN_XP=6, PLAN_XP_BIG=10;
const XP_CORE=5, XP_STACK=8, XP_DAY=30, XP_HALF=15, XP_BENCH=30, XP_IMPROVE=60;
const WD=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const JOB_ENDS="2026-12-31";          // Tue/Thu at the arrendadora until then
const q=(id,stat,label,detail,xp)=>({id:"pl_"+id,stat:stat,label:label,detail:detail||"",xp:xp||XP_DAY,plan:1});

/* The month-by-month arc of each stat: what the month is for. Shown under the day quest. */
const ARC={
  strength:["Keep the split; one heavy squat top set a week","Squat +5 kg","Squat +5 kg","Deload week, then retest all three lifts","Bench focus","Squat 1.5× bodyweight check","Pull-ups to 30","Maintain through exams","Retest","Weak point month","Volume month","Year test: all lifts"],
  endurance:["Easy 5 km every Saturday","Add one harder week in four","5 km under last month","Longer run: 8 km","Tempo weeks","Retest 5 km","Add a match or a second run","Hold","10 km once","5 km time trial","Hold","Year test"],
  speed:["Learn the session: sprints, jumps, shuffles","Same session, faster","First retest","Add a reactive drill","Hold","Retest","Sport application","Hold","Retest","Hold","Hold","Year test"],
  build:["Baseline: weight, waist, height","+0.5 kg at the same leanness","Hold","Quarterly height reading","+0.5 kg","Hold","Quarterly height reading","+0.5 kg","Hold","Quarterly height reading","+0.5 kg","Year review"],
  looks:["Skin AM/PM on 80% of days; first photos","Haircut cadence every 4 weeks","Quarterly re-rate from photos","Style: one upgrade","Hold","Quarterly re-rate","Hold","Hold","Quarterly re-rate","Hold","Hold","Year re-rate"],
  intellect:["Class days count; log every grade","Hold the 85–95","Quarterly 20-question quiz","Hold","Hold","Quarterly quiz","Hold","Hold","Quarterly quiz","Hold","Hold","Year quiz"],
  knowledge:["10 pages a day, any book","Finish one book","Finish one book","One book from a Knowledge Lane","Finish one book","Finish one book","Finish one book","Finish one book","Finish one book","Finish one book","Finish one book","12 books in the year"],
  judgment:["One decision journaled a week","Add: what would change my mind","First would-repeat rate","Hold","Hold","Half-year reread","Hold","Hold","Hold","Hold","Hold","Year reread"],
  focus:["One 25-min block on Mondays","Same block; cut start delay","≥75% → add a second block","Hold","Hold","Half-year review","Hold","Hold","Hold","Hold","Hold","Year review"],
  creativity:["Project 1: a one-page illustrated piece","Project 2: a 60-second video for the business","Project 3: redesign one All For One tab","Project 4","Project 5","Project 6","Project 7","Project 8","Project 9","Project 10","Project 11","Project 12"],
  discipline:["Weekly completion ≥ 60%","≥ 65%","≥ 70%","Hold","Hold","≥ 80%","Hold","Hold","Hold","Hold","Hold","Year review"],
  emotion:["2-line evening check-in daily","Count chosen responses","≥ 80% → add a 10-min sit on Sundays","Hold","Hold","Half-year review","Hold","Hold","Hold","Hold","Hold","Year review"],
  social:["One real conversation a week; 4 new people","8 new people","Hold","Hold","Hold","Half-year count","Hold","Hold","Hold","Hold","Hold","Year count"],
  influence:["Promises ledger at work","≥ 90% kept on time","Quarterly feedback from one person","Hold","Hold","Quarterly feedback","Hold","Hold","Quarterly feedback","Hold","Hold","Year feedback"],
  practical:["Work days count; cook real meals","Hold","Hold","First Saturday project","Hold","Hold","Second project","Hold","Hold","Third project","Hold","Year review"],
  financial:["Earn from the business this month; save a fixed slice","Earn again","Raise the price on new quotes","Hold","Hold","Half-year review","Hold","Hold","Hold","Hold","Hold","Year review"]};
const arc=(stat,c)=>"Month "+(c.mi+1)+": "+(ARC[stat][c.mi%12]||"")+".";

/* helpers on the plan context */
const firstOf=(c,wd)=>c.wd===wd&&c.dom<=7;              // first <weekday> of the calendar month
const lastWeek=c=>c.dom>c.last-7;                         // the month's last seven days
const afterJob=c=>c.iso>JOB_ENDS;
const goingOut=c=>c.wd==="Thu"||c.wd==="Fri"||c.wd==="Sat";

function planQuests(c){
  const L=[];
  // ---- daily core (3 × 4 XP) ----
  L.push(q("knowledge","knowledge","Read 10 pages","Any book. Tick when done; the Pages record below is optional. "+arc("knowledge",c),XP_CORE));
  L.push(c.wd==="Sat"
    ?q("looks","looks","Skin AM/PM + grooming (20 min)","Cleanser, moisturizer, SPF morning; cleanser, moisturizer night. Saturday: hair, brows, nails; haircut every 4 weeks on the calendar. "+arc("looks",c),10)
    :q("looks","looks","Skin AM/PM","Cleanser, moisturizer, SPF in the morning; cleanser and moisturizer at night. 2 minutes. "+arc("looks",c),XP_CORE));
  L.push(q("emotion","emotion","Evening check-in: 2 lines","The hardest moment today → what I felt → what I did. Write it in the log below (stat: Emotional Control). "+arc("emotion",c),XP_CORE));
  // ---- stacked (one tap, 6 XP) ----
  if(c.wd==="Mon"||c.wd==="Wed"||c.wd==="Fri")L.push(q("intellect","intellect","Class day","Showed up and did the work. Log grades in Records when they come back. "+arc("intellect",c),XP_STACK));
  if((c.wd==="Tue"||c.wd==="Thu")&&!afterJob(c))L.push(q("practical.work","practical","Work day at the arrendadora","Risk management is practical skill. Tick after the shift. "+arc("practical",c),XP_STACK));
  if(afterJob(c)&&c.wd==="Thu")L.push(q("practical.biz","practical","A client task done today","Built, fixed or delivered something for a client. "+arc("practical",c),XP_STACK));
  if(goingOut(c))L.push(q("social.out","social","Went out / sports with friends","Tick if you were with people tonight. "+arc("social",c),XP_STACK));
  L.push(q("practical.cook","practical","Cooked a real meal","A meal you made, not reheated. Optional every day.",XP_STACK));
  // ---- day quest(s) ----
  switch(c.wd){
    case "Mon":L.push(q("focus","focus","Focus: one 25-min block on the hardest school task","Timer on, phone in another room, one task. Write 'Today I will finish ___' before you start. Add a second block only after 4 weeks at ≥75%. "+arc("focus",c)));break;
    case "Tue":L.push(afterJob(c)
      ?q("financial","financial","Business block (45 min)","3 prospects contacted, or 1 proposal sent, or 1 invoice chased, then build. Move a fixed % of any payment to the BBVA goal the day it lands. "+arc("financial",c))
      :q("financial","financial","Money: 20 min on the business","3 prospects contacted, or 1 proposal sent, or 1 invoice chased. Move a fixed % of any payment to the BBVA goal the day it lands. "+arc("financial",c)));break;
    case "Wed":
      L.push(q("judgment","judgment","Decision journal (10 min)","One real decision this week: what you chose, why, what would change your mind, when you'll review it. "+arc("judgment",c),XP_HALF));
      L.push(q("creativity","creativity","Creativity: 20 min on the month's project","Open the project, make the next move, close it. "+arc("creativity",c),XP_HALF));break;
    case "Thu":
      L.push(q("social","social","One conversation past small talk","Someone you don't know well: one real question, one thing about you. Log a line (stat: Social). "+arc("social",c),XP_HALF));
      L.push(q("influence","influence",afterJob(c)?"Promises ledger with clients":"Promises ledger at work","Every 'I'll send it by…' written with a date; close the week's list on Friday. "+arc("influence",c),XP_HALF));break;
    case "Fri":L.push(q("speed","speed","Speed session after the gym (15 min)","2 × 4 sprints of 20 m · 3 × 5 jumps · 2 × 10 lateral shuffles. Same session every week. "+arc("speed",c)));break;
    case "Sat":
      L.push(q("endurance","endurance","Run 5–10 km or a match","Easy pace three weeks in four; the fourth week intervals or a tempo run. "+arc("endurance",c),XP_HALF));
      L.push(q("creativity","creativity","Creativity: 45 min on the month's project","The long session. Half-finished counts zero at month end, so push it toward done. "+arc("creativity",c),XP_HALF));break;
    case "Sun":L.push(q("discipline","discipline","Discipline: weekly review (20 min)","Quests done ÷ planned this week → Sessions completed record. Pick next week's day quests, log Records, fix one obstacle. "+arc("discipline",c)));break;
  }
  // ---- monthly benchmarks (30 XP for logging; +60 XP automatically when a record beats last month) ----
  if(firstOf(c,"Mon"))L.push(q("strength.bm","strength","Monthly top sets: bench, squat, deadlift","Log the three top sets in the records below. Squat is the gap: +5 kg a month until 1.5× bodyweight. "+arc("strength",c),XP_BENCH));
  if(firstOf(c,"Fri"))L.push(q("speed.bm","speed","Monthly test: 20 m sprint and standing broad jump","Filmed from the side, best of three. "+arc("speed",c),XP_BENCH));
  if(firstOf(c,"Sat"))L.push(q("endurance.bm","endurance","Monthly 5 km time","Same route, logged in minutes below. "+arc("endurance",c),XP_BENCH));
  if(firstOf(c,"Sun")){
    L.push(q("build.bm","build","Monthly measurement: weight and waist"+(c.mi%3===0?" + height":""),"Morning, before breakfast. Height quarterly: shoes off, flat wall, hard floor. "+arc("build",c),XP_BENCH));
    L.push(q("looks.bm","looks","Monthly photos: face, profile, full body","Same spot, same light, no filter. Re-rated every quarter. "+arc("looks",c),XP_BENCH));
  }
  if(c.wd==="Sun"&&lastWeek(c)){
    L.push(q("judgment.bm","judgment","Monthly judgment review: would-repeat rate","Reread the month's decisions; count how many you'd make again. Log the % below. "+arc("judgment",c),XP_BENCH));
    L.push(q("focus.bm","focus","Monthly focus numbers: blocks completed and start delay","Blocks completed ÷ planned, and your average start delay in minutes. "+arc("focus",c),XP_BENCH));
    L.push(q("creativity.bm","creativity","Monthly creative piece finished?","Log 1 if the month's project is done and saved, 0 if not. "+arc("creativity",c),XP_BENCH));
    L.push(q("emotion.bm","emotion","Monthly count: chosen responses","From the check-ins: how many times you chose the response instead of reacting. "+arc("emotion",c),XP_BENCH));
    L.push(q("knowledge.bm","knowledge","Monthly books finished","Books finished this month, with a 5-line summary each in the log. "+arc("knowledge",c),XP_BENCH));
    if(c.mi%3===2)L.push(q("intellect.bm","intellect","Quarterly 20-question quiz","Reasoning, arithmetic, recall — from the old baseline packet. Score out of 20. "+arc("intellect",c),XP_BENCH));
  }
  if(c.wd==="Sat"&&lastWeek(c)){
    L.push(q("social.bm","social","Monthly count: new people you could message by name","Target 4, then 8. "+arc("social",c),XP_BENCH));
    L.push(q("influence.bm","influence","Monthly promises kept on time","Kept on time ÷ made, as a %. "+arc("influence",c),XP_BENCH));
    L.push(q("financial.bm","financial","Monthly money earned and saved","Business income this month and the BBVA goal balance, from the Finance tab. "+arc("financial",c),XP_BENCH));
    if(c.mi%3===2)L.push(q("practical.bm","practical","Quarterly: one new skill proven","A thing that now works that didn't. Log 1 if yes. "+arc("practical",c),XP_BENCH));
  }
  return L;
}
