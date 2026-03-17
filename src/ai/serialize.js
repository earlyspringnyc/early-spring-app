import { ct, isOverdue } from '../utils/calc.js';

export function serializeProject(project,comp){
  const docs=project.docs||[];const txns=project.txns||[];const tasks=project.timeline||[];
  const overdue=docs.filter(d=>d.status==="overdue"||(d.status==="pending"&&isOverdue(d)));
  const pending=docs.filter(d=>d.status==="pending"&&!isOverdue(d));
  const tasksDone=tasks.filter(t=>t.status==="done").length;
  const totalIncome=txns.filter(t=>t.type==="income").reduce((a,t)=>a+t.amount,0);
  const totalExpenses=txns.filter(t=>t.type==="expense").reduce((a,t)=>a+t.amount,0);
  return`PROJECT: ${project.name}
Client: ${project.client||"None"}
Start: ${project.date||"Not set"} | Event: ${project.eventDate||"Not set"}

FINANCIALS:
Grand Total: $${comp.grandTotal.toFixed(2)}
Net Profit: $${comp.netProfit.toFixed(2)}
Production Cost: $${comp.productionSubtotal.actualCost.toFixed(2)} (client: $${comp.productionSubtotal.clientPrice.toFixed(2)})
Agency Cost: $${comp.agencyCostsSubtotal.actualCost.toFixed(2)} (client: $${comp.agencyCostsSubtotal.clientPrice.toFixed(2)})
Agency Fee (${(project.feeP*100).toFixed(0)}%): $${comp.agencyFee.clientPrice.toFixed(2)}
Income Collected: $${totalIncome.toFixed(2)} of $${comp.grandTotal.toFixed(2)} (${comp.grandTotal>0?Math.round(totalIncome/comp.grandTotal*100):0}%)
Expenses Logged: $${totalExpenses.toFixed(2)}
Cashflow: $${(totalIncome-totalExpenses).toFixed(2)}

BUDGET CATEGORIES:
${project.cats.map(c=>{const t=ct(c.items).totals;return`${c.name}: actual $${t.actualCost.toFixed(2)}, client $${t.clientPrice.toFixed(2)}, items: ${c.items.map(i=>`${i.name}($${i.actualCost}/${(i.margin*100).toFixed(0)}%)`).join(", ")}`}).join("\n")}

AGENCY TEAM:
${project.ag.map(a=>`${a.name}: ${a.days}d @ $${a.dayRate}/day = $${a.actualCost}, margin ${(a.margin*100).toFixed(0)}%`).join("\n")}

TIMELINE (${tasks.length} tasks, ${tasksDone} done):
${tasks.map(t=>`[${t.status}] ${t.name} (${t.category}) ${t.startDate||"no date"}${t.endDate?" to "+t.endDate:""} ${t.assignee?"assigned:"+t.assignee:""}`).join("\n")}

RUN OF SHOW (${(project.ros||[]).length} cues):
${(project.ros||[]).map(r=>`${r.time} - ${r.item} @ ${r.location||"TBD"} (${r.lead||"no lead"}) ${r.duration||""}`).join("\n")}

DOCUMENTS (${docs.length} total, ${overdue.length} overdue):
${docs.map(d=>`[${d.status}] ${d.name} (${d.type}) vendor:${d.vendor||"none"} $${d.amount} due:${d.dueDate||"none"}`).join("\n")}

P&L TRANSACTIONS:
${txns.map(t=>`[${t.type}] ${t.description} $${t.amount} ${t.date} ${t.category||""}`).join("\n")}`;
}


export const AI_SYSTEM=`You are the AI assistant built into Early Spring's production management tool. You have full access to the current project data. You are sharp, direct, and helpful. No corporate filler. Match the user's pace.

You can do three things:
1. ANSWER questions about the project (budget, timeline, documents, P&L, anything).
2. SUGGEST improvements, flag risks, identify missing items, optimize margins.
3. EXECUTE actions by including JSON action blocks in your response.

When you want to modify project data, include an action block like this:
\`\`\`action
{"type":"add_task","name":"Book venue","category":"Venue","startDate":"03/20/2026","endDate":"03/25/2026"}
\`\`\`

Available actions:
- {"type":"add_task","name":"...","category":"...","assignee":"...","startDate":"MM/DD/YYYY","endDate":"MM/DD/YYYY"}
- {"type":"add_doc","name":"...","docType":"invoice|w9|w2|contract","vendor":"...","amount":0,"dueDate":"MM/DD/YYYY"}
- {"type":"add_txn","txnType":"income|expense","description":"...","amount":0,"date":"MM/DD/YYYY","category":"..."}
- {"type":"add_ros","time":"14:00","item":"...","location":"...","lead":"...","duration":"30m"}
- {"type":"update_fee","feePercent":0.20}

You can include multiple action blocks. Always explain what you're doing before or after the action block. Keep responses concise. Use real numbers from the project data. If something looks off (margin too low, missing docs, timeline gaps), say so directly.`;

