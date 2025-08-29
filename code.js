// --- Sudoku Split MVP ---
// Receipt-first splitter with proportional taxes/fees, per-person tips, cash-only mode, and minimal transfers.

(() => {
  // ---- State ----
  const state = {
    people: [], // {id, name, tipPct, tipBasis, cashNow, isPayer}
    items: [],  // {id, desc, price, taxable, owners: Set(personId)} equal split if multiple owners
    charges: [] // {id, type:'tax'|'fee'|'discount', label, amount, options:{taxByTaxable:boolean, splitEvenly:boolean}}
  };

  // ---- DOM helpers ----
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const el = (tag, props={}) => Object.assign(document.createElement(tag), props);

  const uid = () => Math.random().toString(36).slice(2,9);

  // ---- People UI ----
  const peopleTbody = $('#peopleTbody');
  const addPersonBtn = $('#addPersonBtn');

  function renderPeople() {
    peopleTbody.innerHTML = '';
    state.people.forEach(p => {
      const tr = el('tr');
      // name
      const nameTd = el('td');
      const nameIn = el('input', {type:'text', value:p.name, placeholder:'e.g., D'});
      nameIn.addEventListener('input', () => { p.name = nameIn.value; renderItemsOwners(); });
      nameTd.appendChild(nameIn);

      // tip %
      const tipTd = el('td');
      const tipIn = el('input', {type:'number', step:'0.01', min:'0', value: p.tipPct});
      tipIn.addEventListener('input', () => p.tipPct = toNum(tipIn.value));
      tipTd.appendChild(tipIn);

      // tip basis
      const basisTd = el('td');
      const basisSel = el('select');
      ;['base','base+tax'].forEach(v => {
        const o = el('option', {value:v, textContent:v});
        if (p.tipBasis===v) o.selected = true; basisSel.appendChild(o);
      });
      basisSel.addEventListener('change', () => p.tipBasis = basisSel.value);
      basisTd.appendChild(basisSel);

      // cash now
      const cashTd = el('td');
      const cashIn = el('input', {type:'number', step:'0.01', min:'0', value: p.cashNow});
      cashIn.addEventListener('input', () => p.cashNow = toNum(cashIn.value));
      cashTd.appendChild(cashIn);

      // payer radio (allow multiple but we’ll use the first checked as main payer)
      const payerTd = el('td');
      const payerIn = el('input', {type:'checkbox'});
      payerIn.checked = !!p.isPayer;
      payerIn.addEventListener('change', () => { p.isPayer = payerIn.checked; });
      payerTd.appendChild(payerIn);

      const delTd = el('td');
      const delBtn = el('button', {className:'btn remove-btn', textContent:'Remove'});
      delBtn.addEventListener('click', () => { state.people = state.people.filter(x=>x.id!==p.id); pruneOwners(); renderPeople(); renderItemsOwners(); });
      delTd.appendChild(delBtn);

      tr.append(nameTd, tipTd, basisTd, cashTd, payerTd, delTd);
      peopleTbody.appendChild(tr);
    });
  }

  addPersonBtn.addEventListener('click', () => {
    state.people.push({id:uid(), name:'', tipPct:0, tipBasis:'base+tax', cashNow:0, isPayer: state.people.length===0});
    renderPeople();
    renderItemsOwners();
  });

  // ---- Items UI ----
  const itemsTbody = $('#itemsTbody');
  const addItemBtn = $('#addItemBtn');
  const defaultTaxable = $('#defaultTaxable');

  function renderItems() {
    itemsTbody.innerHTML = '';
    state.items.forEach(item => {
      const tr = el('tr');

      const descTd = el('td');
      const descIn = el('input', {type:'text', value:item.desc, placeholder:'Item'});
      descIn.addEventListener('input', () => item.desc = descIn.value);
      descTd.appendChild(descIn);

      const priceTd = el('td');
      const priceIn = el('input', {type:'number', step:'0.01', min:'0', value:item.price});
      priceIn.addEventListener('input', () => item.price = toNum(priceIn.value));
      priceTd.appendChild(priceIn);

      const taxTd = el('td');
      const taxIn = el('input', {type:'checkbox'});
      taxIn.checked = !!item.taxable;
      taxIn.addEventListener('change', () => item.taxable = taxIn.checked);
      taxTd.appendChild(taxIn);

      const ownersTd = el('td');
      const ownersWrap = el('div', {className:'center'});
      state.people.forEach(p => {
        const label = el('label', {className:'checkbox-inline small'});
        const cb = el('input', {type:'checkbox'});
        cb.checked = item.owners.has(p.id);
        cb.addEventListener('change', () => { cb.checked ? item.owners.add(p.id) : item.owners.delete(p.id); });
        label.append(cb, " ", el('span', {textContent:p.name||'Person'}));
        ownersWrap.appendChild(label);
      });
      ownersTd.appendChild(ownersWrap);

      const delTd = el('td');
      const delBtn = el('button', {className:'btn remove-btn', textContent:'Remove'});
      delBtn.addEventListener('click', ()=>{ state.items = state.items.filter(x=>x.id!==item.id); renderItems(); });
      delTd.appendChild(delBtn);

      tr.append(descTd, priceTd, taxTd, ownersTd, delTd);
      itemsTbody.appendChild(tr);
    });
  }

  function renderItemsOwners(){
    // re-render owners column to reflect current people list
    renderItems();
  }

  addItemBtn.addEventListener('click', () => {
    state.items.push({id:uid(), desc:'', price:0, taxable: defaultTaxable.checked, owners:new Set()});
    renderItems();
  });

  function pruneOwners(){
    const personIds = new Set(state.people.map(p=>p.id));
    state.items.forEach(it=>{
      for (const id of Array.from(it.owners)) if (!personIds.has(id)) it.owners.delete(id);
    });
  }

  // ---- Charges (Taxes / Fees / Discounts) ----
  const chargesTbody = $('#chargesTbody');
  const addChargeBtn = $('#addChargeBtn');

  function renderCharges(){
    chargesTbody.innerHTML = '';
    state.charges.forEach(ch => {
      const tr = el('tr');

      // type
      const typeTd = el('td');
      const typeSel = el('select');
      ;['tax','fee','discount'].forEach(t=>{
        const o = el('option', {value:t, textContent:t}); if (ch.type===t) o.selected=true; typeSel.appendChild(o);
      });
      typeSel.addEventListener('change', ()=>{ ch.type = typeSel.value; renderCharges(); });
      typeTd.appendChild(typeSel);

      // label
      const labelTd = el('td');
      const labelIn = el('input', {type:'text', value: ch.label, placeholder:'e.g., Sales Tax'});
      labelIn.addEventListener('input', ()=> ch.label = labelIn.value);
      labelTd.appendChild(labelIn);

      // amount
      const amtTd = el('td');
      const amtIn = el('input', {type:'number', step:'0.01', value: ch.amount});
      amtIn.addEventListener('input', ()=> ch.amount = toNum(amtIn.value));
      amtTd.appendChild(amtIn);

      // options
      const optTd = el('td');
      const optWrap = el('div', {className:'list'});

      if (ch.type==='tax'){
        const li = el('div');
        const chk = el('input', {type:'checkbox'}); chk.checked = !!ch.options.taxByTaxable;
        chk.addEventListener('change', ()=> ch.options.taxByTaxable = chk.checked);
        li.append(chk, ' Allocate by taxable items (infer rate)');
        optWrap.appendChild(li);
      } else {
        const li = el('div');
        const chk = el('input', {type:'checkbox'}); chk.checked = !!ch.options.splitEvenly;
        chk.addEventListener('change', ()=> ch.options.splitEvenly = chk.checked);
        li.append(chk, ' Split evenly (otherwise proportional to base)');
        optWrap.appendChild(li);
      }
      optTd.appendChild(optWrap);

      // delete
      const delTd = el('td');
      const delBtn = el('button', {className:'btn remove-btn', textContent:'Remove'});
      delBtn.addEventListener('click', ()=>{ state.charges = state.charges.filter(x=>x.id!==ch.id); renderCharges(); });
      delTd.appendChild(delBtn);

      tr.append(typeTd, labelTd, amtTd, optTd, delTd);
      chargesTbody.appendChild(tr);
    });
  }

  addChargeBtn.addEventListener('click', ()=>{
    state.charges.push({id:uid(), type:'tax', label:'', amount:0, options:{taxByTaxable:true, splitEvenly:false}});
    renderCharges();
  });

  // ---- Compute Engine ----
  const cashOnlyToggle = $('#cashOnlyToggle');
  const computeBtn = $('#computeBtn');
  const resetBtn = $('#resetBtn');
  const computeStatus = $('#computeStatus');

  const reconWarnings = $('#reconWarnings');
  const personBreakdown = $('#personBreakdown');
  const counterGuidance = $('#counterGuidance');
  const settlementDiv = $('#settlement');

  computeBtn.addEventListener('click', ()=>{
    try{
      const out = compute();
      renderSummary(out);
      computeStatus.textContent = '✓ Computed';
    }catch(e){
      console.error(e);
      computeStatus.textContent = 'Error: ' + e.message;
    }
  });

  resetBtn.addEventListener('click', ()=>{
    state.people = [];
    state.items = [];
    state.charges = [];
    renderPeople(); renderItems(); renderCharges();
    personBreakdown.innerHTML = counterGuidance.innerHTML = settlementDiv.innerHTML = reconWarnings.innerHTML = '';
    computeStatus.textContent='';
  });

  function toNum(v){ return Number.parseFloat(v||'0') || 0; }

  function compute(){
    if (state.people.length===0) throw new Error('Add at least one person.');
    if (state.items.length===0) throw new Error('Add at least one receipt item.');

    const P = state.people.length;
    const personIndex = new Map(state.people.map((p,i)=>[p.id,i]));

    // bases & taxable bases
    const base = Array(P).fill(0);
    const taxableBase = Array(P).fill(0); // for items marked taxable

    let subtotal = 0;
    let taxableSubtotal = 0;

    state.items.forEach(it => {
      const price = toNum(it.price);
      subtotal += price;
      const owners = Array.from(it.owners);
      const share = owners.length ? (1/owners.length) : 0; // unassigned items count toward subtotal but not to people until assigned
      owners.forEach(id=>{ base[personIndex.get(id)] += price*share; });
      if (it.taxable){
        taxableSubtotal += price;
        owners.forEach(id=>{ taxableBase[personIndex.get(id)] += price*share; });
      }
    });

    // allocate charges
    const taxLines = state.charges.filter(c=>c.type==='tax');
    const feeLines = state.charges.filter(c=>c.type!=='tax');

    // Tax allocation by inferred rates per line (default by taxable items; fallback to all base if none taxable)
    const tax = Array(P).fill(0);
    let totalTax = 0;
    taxLines.forEach(tl=>{
      const amount = toNum(tl.amount);
      totalTax += amount;
      const byTaxable = tl.options?.taxByTaxable!==false; // default true
      const denom = byTaxable ? taxableSubtotal : subtotal;
      const rate = denom>0 ? amount/denom : 0;
      const weights = byTaxable ? taxableBase : base;
      for (let i=0;i<P;i++) tax[i] += rate * weights[i];
    });

    // Fees & discounts (negative allowed). Split evenly or proportional to base.
    const fees = Array(P).fill(0);
    let totalFees = 0;
    const baseSum = base.reduce((a,b)=>a+b,0);
    feeLines.forEach(fl=>{
      const amount = toNum(fl.amount);
      totalFees += amount;
      if (fl.options?.splitEvenly){
        const each = amount / Math.max(P,1);
        for (let i=0;i<P;i++) fees[i] += each;
      } else {
        for (let i=0;i<P;i++) fees[i] += baseSum>0 ? amount * (base[i]/baseSum) : 0;
      }
    });

    // Tips per person (tipPct on chosen basis)
    const tip = Array(P).fill(0);
    for (let i=0;i<P;i++){
      const p = state.people[i];
      const pct = toNum(p.tipPct)/100;
      const basis = (p.tipBasis==='base') ? base[i] : (base[i]+tax[i]);
      tip[i] = pct * basis;
    }

    // Owed per person
    const owed = base.map((b,i)=> b + tax[i] + fees[i] + tip[i]);

    const totalTips = tip.reduce((a,b)=>a+b,0);
    const receiptTotal = subtotal + totalTax + totalFees + totalTips;

    // Payments now (cash & optional card if not cash-only)
    const cash = state.people.map(p=> toNum(p.cashNow));
    const cashSum = cash.reduce((a,b)=>a+b,0);

    let card = Array(P).fill(0);
    let payerIndex = state.people.findIndex(p=>p.isPayer);
    if (payerIndex<0) payerIndex = 0; // default first person

    let atmWithdraw = 0;

    if ( $('#cashOnlyToggle').checked ){
      // cash-only: make up the shortfall by telling payer to get cash
      const shortfall = round2(receiptTotal - cashSum);
      if (shortfall>0){ atmWithdraw = shortfall; cash[payerIndex] += shortfall; }
    } else {
      // allow card: payer covers remainder on card
      const remainder = round2(receiptTotal - cashSum);
      if (remainder>0) card[payerIndex] = remainder;
    }

    // Nets
    const net = owed.map((o,i)=> (cash[i] + card[i]) - o);

    // Minimal transfers (post-settlement)
    const transfers = solveTransfers(net, state.people.map(p=>p.name||'Person'));

    // Reconciliation warnings
    const warnings = [];
    // warn for unassigned items
    const unassigned = state.items.filter(it=>it.owners.size===0 && toNum(it.price)>0);
    if (unassigned.length){ warnings.push(`⚠ ${unassigned.length} item(s) have no owners and won\'t be allocated until assigned.`); }

    // Package results
    return {
      meta: {subtotal, totalTax, totalFees, totalTips, receiptTotal},
      perPerson: state.people.map((p,i)=>({
        name: p.name||`Person ${i+1}`,
        base: base[i], tax: tax[i], fees: fees[i], tip: tip[i],
        owed: owed[i], cashNow: cash[i], cardNow: card[i], net: net[i]
      })),
      payer: state.people[payerIndex]?.name || `Person ${payerIndex+1}`,
      atmWithdraw,
      transfers,
      warnings
    };
  }

  function solveTransfers(net, names){
    const creditors = [];
    const debtors = [];
    net.forEach((n,i)=>{ if (round2(n)>0) creditors.push({i,amt:round2(n)}); else if (round2(n)<0) debtors.push({i,amt:round2(-n)}); });
    creditors.sort((a,b)=>b.amt-a.amt);
    debtors.sort((a,b)=>b.amt-a.amt);

    const tx = [];
    let ci=0, di=0;
    while (ci<creditors.length && di<debtors.length){
      const give = Math.min(creditors[ci].amt, debtors[di].amt);
      if (give>0){
        tx.push({from: names[debtors[di].i], to: names[creditors[ci].i], amount: give});
        creditors[ci].amt = round2(creditors[ci].amt - give);
        debtors[di].amt = round2(debtors[di].amt - give);
      }
      if (creditors[ci].amt<=0.0001) ci++;
      if (debtors[di].amt<=0.0001) di++;
    }
    return tx;
  }

  function round2(x){ return Math.round((x+Number.EPSILON)*100)/100; }

  // ---- Summary rendering ----
  function renderSummary(out){
    // warnings
    reconWarnings.innerHTML = '';
    out.warnings.forEach(w=>{
      const div = el('div', {textContent:w}); reconWarnings.appendChild(div);
    });

    // per person breakdown
    const ul = el('ul', {className:'list'});
    out.perPerson.forEach(p => {
      const li = el('li');
      li.innerHTML = `
        <div><span class="badge">${escapeHtml(p.name)}</span></div>
        <div class="small">Base: $${p.base.toFixed(2)} · Tax: $${p.tax.toFixed(2)} · Fees: $${p.fees.toFixed(2)} · Tip: $${p.tip.toFixed(2)}</div>
        <div class="total-row">Owed: $${p.owed.toFixed(2)}</div>
        <div class="small">Paid now — Cash: $${p.cashNow.toFixed(2)}${p.cardNow?` · Card: $${p.cardNow.toFixed(2)}`:''}</div>
        <div class="${p.net>=0?'good':'bad'}">Net: ${p.net>=0?'+':''}$${p.net.toFixed(2)} ${p.net>=0?'(should receive later)':'(owes later)'} </div>
      `;
      ul.appendChild(li);
    });
    personBreakdown.innerHTML = '';
    personBreakdown.appendChild(ul);

    // counter guidance
    const cg = [];
    cg.push(`Subtotal: $${out.meta.subtotal.toFixed(2)} | Tax: $${out.meta.totalTax.toFixed(2)} | Fees: $${out.meta.totalFees.toFixed(2)} | Tips: $${out.meta.totalTips.toFixed(2)}`);
    cg.push(`<strong>Total due: $${out.meta.receiptTotal.toFixed(2)}</strong>`);
    if ($('#cashOnlyToggle').checked){
      if (out.atmWithdraw>0){
        cg.push(`Cash-only: have <strong>${escapeHtml(out.payer)}</strong> withdraw <strong>$${out.atmWithdraw.toFixed(2)}</strong> to cover the shortfall.`);
      } else {
        cg.push('Cash-only: on-hand cash covers the total.');
      }
    } else {
      const payer = escapeHtml(out.payer);
      const payerCard = out.perPerson.find(pp=>pp.name===payer)?.cardNow || 0;
      if (payerCard>0) cg.push(`${payer} pays <strong>$${payerCard.toFixed(2)}</strong> on card after cash.`);
    }
    counterGuidance.innerHTML = cg.map(x=>`<div>${x}</div>`).join('');

    // settlement
    if (out.transfers.length===0){
      settlementDiv.innerHTML = '<div class="good">No transfers needed — everyone is square.</div>';
    } else {
      const ul2 = el('ul', {className:'list'});
      out.transfers.forEach(t=>{
        const li = el('li');
        li.innerHTML = `<strong>${escapeHtml(t.from)}</strong> → <strong>${escapeHtml(t.to)}</strong>: $${t.amount.toFixed(2)}`;
        ul2.appendChild(li);
      });
      settlementDiv.innerHTML = '';
      settlementDiv.appendChild(ul2);
    }
  }

  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c])); }

  // ---- Seed a tiny example for quick testing ----
  function seed(){
    // People
    const a = {id:uid(), name:'D', tipPct:20, tipBasis:'base+tax', cashNow:10, isPayer:true};
    const b = {id:uid(), name:'Joe', tipPct:0, tipBasis:'base+tax', cashNow:20, isPayer:false};
    const c = {id:uid(), name:'Adam', tipPct:20, tipBasis:'base+tax', cashNow:0, isPayer:false};
    state.people.push(a,b,c);

    // Items
    const it1 = {id:uid(), desc:'Burger', price:12, taxable:true, owners:new Set([b.id])};
    const it2 = {id:uid(), desc:'Pasta', price:15, taxable:true, owners:new Set([a.id])};
    const it3 = {id:uid(), desc:'Salad', price:8, taxable:true, owners:new Set([c.id])};
    const it4 = {id:uid(), desc:'Drinks', price:9, taxable:true, owners:new Set([a.id,b.id,c.id])};
    state.items.push(it1,it2,it3,it4);

    // Taxes & Tip via per-person
    state.charges.push({id:uid(), type:'tax', label:'Sales Tax', amount:4.40, options:{taxByTaxable:true}});
    // No fees in seed

    renderPeople();
    renderItems();
    renderCharges();
  }

  // initial render
  renderPeople();
  renderItems();
  renderCharges();
  seed();
})();
