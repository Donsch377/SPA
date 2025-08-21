// Expense Splitter – Vanilla JS
// Spec highlights implemented:
// - Multiple people
// - No persistence (resets on reload)
// - Expenses with participants + custom shares (percent)
// - Per-expense tax/tip as % OR fixed $
// - Edit/Delete expenses
// - Rounding only at the very end (display)
// - Desktop-first, no keyboard shortcuts
// - Show balances table + who-pays-who (non-minimal greedy, deterministic order)
// - Undo/Redo (simple state snapshots)
// - Export/Import JSON
// - Copy settlement summary button (balances copy omitted by request)

(function () {
  "use strict";

  // --- State ---
  const state = {
    people: [], // ["Alice", "Bob"]
    expenses: [], // {id, desc, amount, payer, participants:[name], splitMode:'equal'|'custom', shares:{name:pct}, tax:{mode:'percent'|'fixed', taxPct, tipPct, taxFixed, tipFixed}}
  };

  // Undo/redo stacks
  const undoStack = [];
  const redoStack = [];

  // --- Helpers ---
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const fmt = (n) => (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2); // final rounding only for display

  function snapshot() {
    // Push deep copy to undo; clear redo
    undoStack.push(JSON.parse(JSON.stringify(state)));
    redoStack.length = 0;
    updateUndoRedoButtons();
  }
  function restore(obj) {
    state.people = obj.people;
    state.expenses = obj.expenses;
    renderPeople();
    renderFormPeople();
    renderExpenses();
    clearResults();
  }
  function updateUndoRedoButtons() {
    $("#undoBtn").disabled = undoStack.length === 0;
    $("#redoBtn").disabled = redoStack.length === 0;
  }

  // --- People ---
  const personInput = $("#personName");
  $("#addPersonBtn").addEventListener("click", () => {
    const name = personInput.value.trim();
    if (!name) return;
    snapshot();
    if (!state.people.includes(name)) state.people.push(name);
    personInput.value = "";
    renderPeople();
    renderFormPeople();
    clearResults();
  });

  function removePerson(name) {
    snapshot();
    state.people = state.people.filter((p) => p !== name);
    // Remove from expenses (participants or payer)
    state.expenses = state.expenses
      .filter((e) => e.payer !== name) // drop expenses whose payer was removed
      .map((e) => ({
        ...e,
        participants: e.participants.filter((p) => p !== name),
        shares: Object.fromEntries(Object.entries(e.shares || {}).filter(([k]) => k !== name)),
      }));
    renderPeople();
    renderFormPeople();
    renderExpenses();
    clearResults();
  }

  function renderPeople() {
    const ul = $("#peopleList");
    ul.innerHTML = "";
    state.people.forEach((name) => {
      const li = document.createElement("li");
      li.className = "pill";
      li.innerHTML = `<span>${escapeHtml(name)}</span> <button class="x" title="Remove">×</button>`;
      li.querySelector(".x").addEventListener("click", () => removePerson(name));
      ul.appendChild(li);
    });
  }

  function renderFormPeople() {
    const payerSel = $("#expPayer");
    payerSel.innerHTML = state.people.map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("");

    const box = $("#participantsBox");
    box.innerHTML = state.people
      .map((p) => {
        const id = `chk_${hash(p)}`;
        return `<label><input type="checkbox" id="${id}" value="${escapeHtml(p)}" /> ${escapeHtml(p)}</label>`;
      })
      .join("");

    renderCustomShares();
  }

  function selectedParticipants() {
    return $$("#participantsBox input[type=checkbox]:checked").map((c) => c.value);
  }

  // --- Custom shares ---
  function renderCustomShares() {
    const container = $("#customShares");
    const mode = getSplitMode();
    if (mode === "custom") container.classList.remove("hidden");
    else container.classList.add("hidden");

    // Build inputs for selected participants only
    const parts = selectedParticipants();
    container.innerHTML = parts
      .map((p) => {
        const id = `share_${hash(p)}`;
        return `<label><span>${escapeHtml(p)} %</span><input type="number" step="0.01" min="0" id="${id}" data-name="${escapeHtml(p)}" placeholder="0" /></label>`;
      })
      .join("");
  }

  function getSplitMode() {
    const r = document.querySelector('input[name="splitMode"]:checked');
    return r ? r.value : "equal";
  }

  $$("input[name=splitMode]").forEach((r) => r.addEventListener("change", renderCustomShares));
  $("#participantsBox").addEventListener("change", renderCustomShares);

  // Toggle percent vs fixed row for tax/tip
  $$("input[name=surchargeMode]").forEach((r) =>
    r.addEventListener("change", () => {
      const useFixed = document.querySelector('input[name="surchargeMode"]:checked').value === "fixed";
      $("#fixedRow").hidden = !useFixed;
    })
  );

  // --- Expenses ---
  $("#addExpenseBtn").addEventListener("click", () => {
    const desc = $("#expDesc").value.trim() || "(no description)";
    const amount = parseNum($("#expAmount").value);
    const payer = $("#expPayer").value;
    const parts = selectedParticipants();
    const splitMode = getSplitMode();
    const taxMode = document.querySelector('input[name="surchargeMode"]:checked').value; // percent|fixed

    if (!isFinite(amount) || amount <= 0) return alert("Enter a valid amount > 0");
    if (!payer) return alert("Choose a payer");
    if (parts.length === 0) return alert("Select at least one participant");

    const exp = {
      id: cryptoId(),
      desc,
      amount,
      payer,
      participants: parts.slice(),
      splitMode,
      shares: {},
      tax: {
        mode: taxMode,
        taxPct: parseNum($("#expTaxPct").value) || 0,
        tipPct: parseNum($("#expTipPct").value) || 0,
        taxFixed: parseNum($("#expTaxFixed").value) || 0,
        tipFixed: parseNum($("#expTipFixed").value) || 0,
      },
    };

    if (splitMode === "custom") {
      // Collect % shares; must sum to 100
      const inputs = Array.from($("#customShares").querySelectorAll("input"));
      let total = 0;
      inputs.forEach((inp) => {
        const name = inp.dataset.name;
        const pct = parseNum(inp.value) || 0;
        exp.shares[name] = pct;
        total += pct;
      });
      if (Math.abs(total - 100) > 0.001) return alert("Custom shares must sum to 100%.");
    }

    snapshot();
    state.expenses.push(exp);
    renderExpenses();
    clearExpenseForm();
    clearResults();
  });

  $("#clearFormBtn").addEventListener("click", clearExpenseForm);

  function clearExpenseForm() {
    $("#expDesc").value = "";
    $("#expAmount").value = "";
    $("#expTaxPct").value = "";
    $("#expTipPct").value = "";
    $("#expTaxFixed").value = "";
    $("#expTipFixed").value = "";
    $$("#participantsBox input[type=checkbox]").forEach((c) => (c.checked = false));
    document.querySelector('input[name="splitMode"][value="equal"]').checked = true;
    document.querySelector('input[name="surchargeMode"][value="percent"]').checked = true;
    $("#fixedRow").hidden = true;
    renderCustomShares();
  }

  function renderExpenses() {
    const tbody = $("#expenseTable tbody");
    tbody.innerHTML = "";
    for (const exp of state.expenses) {
      const tr = document.createElement("tr");
      const total = calcExpenseTotal(exp);
      tr.innerHTML = `
        <td>${escapeHtml(exp.desc)}</td>
        <td>${escapeHtml(exp.payer)}</td>
        <td>${escapeHtml(exp.participants.join(", "))} ${exp.splitMode === "custom" ? "(custom)" : "(equal)"}</td>
        <td>$${fmt(total)}</td>
        <td class="row">
          <button data-act="edit" data-id="${exp.id}" class="secondary">Edit</button>
          <button data-act="del" data-id="${exp.id}" class="danger">Delete</button>
        </td>`;
      tbody.appendChild(tr);
    }

    // Wire buttons
    tbody.querySelectorAll("button").forEach((btn) =>
      btn.addEventListener("click", (e) => {
        const id = e.currentTarget.getAttribute("data-id");
        const act = e.currentTarget.getAttribute("data-act");
        if (act === "del") delExpense(id);
        else if (act === "edit") editExpense(id);
      })
    );
  }

  function delExpense(id) {
    snapshot();
    state.expenses = state.expenses.filter((e) => e.id !== id);
    renderExpenses();
    clearResults();
  }

  function editExpense(id) {
    const exp = state.expenses.find((e) => e.id === id);
    if (!exp) return;
    // Load into form
    $("#expDesc").value = exp.desc;
    $("#expAmount").value = exp.amount;
    $("#expPayer").value = exp.payer;
    // participants
    $$("#participantsBox input[type=checkbox]").forEach((c) => (c.checked = exp.participants.includes(c.value)));
    document.querySelector(`input[name="splitMode"][value="${exp.splitMode}"]`).checked = true;
    renderCustomShares();
    if (exp.splitMode === "custom") {
      for (const [name, pct] of Object.entries(exp.shares)) {
        const input = document.querySelector(`#customShares input[data-name="${cssEscape(name)}"]`);
        if (input) input.value = pct;
      }
    }
    // tax/tip
    document.querySelector(`input[name="surchargeMode"][value="${exp.tax.mode}"]`).checked = true;
    $("#fixedRow").hidden = exp.tax.mode !== "fixed";
    $("#expTaxPct").value = exp.tax.taxPct || "";
    $("#expTipPct").value = exp.tax.tipPct || "";
    $("#expTaxFixed").value = exp.tax.taxFixed || "";
    $("#expTipFixed").value = exp.tax.tipFixed || "";

    // Replace existing on next add
    $("#addExpenseBtn").textContent = "Save Expense";
    const handler = () => {
      // Validate & save
      const desc = $("#expDesc").value.trim() || "(no description)";
      const amount = parseNum($("#expAmount").value);
      const payer = $("#expPayer").value;
      const parts = selectedParticipants();
      const splitMode = getSplitMode();
      const taxMode = document.querySelector('input[name="surchargeMode"]:checked').value;
      if (!isFinite(amount) || amount <= 0) return alert("Enter a valid amount > 0");
      if (!payer) return alert("Choose a payer");
      if (parts.length === 0) return alert("Select at least one participant");

      const updated = {
        ...exp,
        desc,
        amount,
        payer,
        participants: parts.slice(),
        splitMode,
        shares: {},
        tax: {
          mode: taxMode,
          taxPct: parseNum($("#expTaxPct").value) || 0,
          tipPct: parseNum($("#expTipPct").value) || 0,
          taxFixed: parseNum($("#expTaxFixed").value) || 0,
          tipFixed: parseNum($("#expTipFixed").value) || 0,
        },
      };
      if (splitMode === "custom") {
        const inputs = Array.from($("#customShares").querySelectorAll("input"));
        let total = 0;
        inputs.forEach((inp) => {
          const name = inp.dataset.name;
          const pct = parseNum(inp.value) || 0;
          updated.shares[name] = pct;
          total += pct;
        });
        if (Math.abs(total - 100) > 0.001) return alert("Custom shares must sum to 100%.");
      }

      snapshot();
      const idx = state.expenses.findIndex((e) => e.id === id);
      state.expenses[idx] = updated;
      renderExpenses();
      clearExpenseForm();
      $("#addExpenseBtn").textContent = "Add Expense";
      $("#addExpenseBtn").removeEventListener("click", handler);
      clearResults();
    };

    $("#addExpenseBtn").addEventListener("click", handler);
  }

  // --- Calculations ---
  function calcExpenseTotal(exp) {
    // base + tax + tip; either % or fixed
    let total = exp.amount;
    if (exp.tax.mode === "percent") {
      const tax = (exp.tax.taxPct || 0) / 100 * exp.amount;
      const tip = (exp.tax.tipPct || 0) / 100 * exp.amount;
      total += tax + tip;
    } else {
      total += (exp.tax.taxFixed || 0) + (exp.tax.tipFixed || 0);
    }
    return total;
  }

  function calcShares(exp) {
    const total = calcExpenseTotal(exp);
    const parts = exp.participants;
    if (exp.splitMode === "equal") {
      const share = total / parts.length;
      return Object.fromEntries(parts.map((p) => [p, share]));
    } else {
      // custom % shares over total
      const result = {};
      let assigned = 0;
      let i = 0;
      for (const name of parts) {
        i++;
        const pct = (exp.shares[name] || 0) / 100;
        let amt = total * pct;
        // Defer rounding; return raw numbers
        result[name] = amt;
        assigned += amt;
      }
      // If tiny floating drift, adjust last participant to match total
      const keys = Object.keys(result);
      if (keys.length > 0) {
        const diff = total - assigned;
        result[keys[keys.length - 1]] += diff;
      }
      return result;
    }
  }

  function computeBalances() {
    const paid = Object.fromEntries(state.people.map((p) => [p, 0]));
    const owes = Object.fromEntries(state.people.map((p) => [p, 0]));

    for (const e of state.expenses) {
      const total = calcExpenseTotal(e);
      paid[e.payer] += total; // full total is paid by payer
      const shares = calcShares(e);
      for (const [name, amt] of Object.entries(shares)) {
        owes[name] += amt;
      }
    }

    const net = {};
    for (const p of state.people) net[p] = paid[p] - owes[p];
    return { paid, owes, net };
  }

  function computeSettlement(net) {
    // Build lists (creditors: net>0, debtors: net<0). Deterministic order by input order.
    const creditors = state.people.filter((p) => net[p] > 0).map((p) => ({ name: p, amt: net[p] }));
    const debtors = state.people.filter((p) => net[p] < 0).map((p) => ({ name: p, amt: -net[p] }));

    const settlements = [];
    let ci = 0, di = 0;
    while (ci < creditors.length && di < debtors.length) {
      const c = creditors[ci];
      const d = debtors[di];
      const pay = Math.min(c.amt, d.amt);
      if (pay > 0.0000001) {
        settlements.push({ from: d.name, to: c.name, amount: pay });
        c.amt -= pay;
        d.amt -= pay;
      }
      if (c.amt <= 0.0000001) ci++;
      if (d.amt <= 0.0000001) di++;
    }
    return settlements; // not guaranteed minimal count; simple greedy in order
  }

  // --- Results ---
  $("#computeBtn").addEventListener("click", () => {
    renderResults();
  });

  function clearResults() {
    $("#balancesTable tbody").innerHTML = "";
    $("#settlementList").innerHTML = "";
  }

  function renderResults() {
    const { paid, owes, net } = computeBalances();
    // Balances table
    const tbody = $("#balancesTable tbody");
    tbody.innerHTML = "";
    for (const name of state.people) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(name)}</td>
        <td>$${fmt(paid[name])}</td>
        <td>$${fmt(owes[name])}</td>
        <td>$${fmt(net[name])}</td>`;
      tbody.appendChild(tr);
    }

    // Settlement list
    const settlements = computeSettlement(net);
    const ol = $("#settlementList");
    ol.innerHTML = "";
    for (const s of settlements) {
      const li = document.createElement("li");
      li.textContent = `${s.from} pays ${s.to} $${fmt(s.amount)}`;
      ol.appendChild(li);
    }
  }

  // Copy settlement summary
  $("#copySettlementBtn").addEventListener("click", () => {
    const items = Array.from($("#settlementList").children).map((li) => li.textContent);
    if (items.length === 0) return;
    navigator.clipboard.writeText(items.join("\n")).then(() => {
      toast("Settlement copied to clipboard.");
    });
  });

  // Undo/Redo
  $("#undoBtn").addEventListener("click", () => {
    if (undoStack.length === 0) return;
    const prev = undoStack.pop();
    redoStack.push(JSON.parse(JSON.stringify(state)));
    updateUndoRedoButtons();
    restore(prev);
  });
  $("#redoBtn").addEventListener("click", () => {
    if (redoStack.length === 0) return;
    const next = redoStack.pop();
    undoStack.push(JSON.parse(JSON.stringify(state)));
    updateUndoRedoButtons();
    restore(next);
  });

  // Export/Import JSON
  $("#exportBtn").addEventListener("click", () => {
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `expense-splitter-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  $("#importFile").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result);
        if (!obj || !Array.isArray(obj.people) || !Array.isArray(obj.expenses)) throw new Error("Invalid file");
        snapshot();
        restore({ people: obj.people, expenses: obj.expenses });
        toast("Imported.");
      } catch (err) {
        alert("Import failed: " + err.message);
      }
    };
    reader.readAsText(file);
  });

  // --- Utils ---
  function parseNum(v) {
    const n = Number(v);
    return isFinite(n) ? n : 0;
  }
  function cryptoId() { return Math.random().toString(36).slice(2, 10); }
  function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; } return Math.abs(h); }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c])); }
  function cssEscape(s) { return s.replace(/[^a-zA-Z0-9_-]/g, (c) => '_' + c.charCodeAt(0).toString(16) + '_'); }

  // Tiny toast
  function toast(msg) {
    const t = document.createElement("div");
    t.textContent = msg;
    Object.assign(t.style, {
      position: "fixed", bottom: "16px", right: "16px", padding: "10px 12px",
      background: "#101521", border: "1px solid #263147", borderRadius: "8px", color: "#e6eaf2", zIndex: 9999
    });
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1600);
  }

  // Init
  function init() {
    updateUndoRedoButtons();
    renderPeople();
    renderFormPeople();
    renderExpenses();
  }
  init();
})();
