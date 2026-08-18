/* =====================================================
   Finanças Livre — Application Logic
   ===================================================== */

// ============================================================
// STATE MANAGEMENT
// ============================================================
const STORAGE_KEY = 'financas_livre_v1';

let state = {
  income: [],
  expenses: [],
  debts: [],
  tasks: [],
  settings: {
    strategy: 'avalanche'
  }
};

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      state = JSON.parse(saved);
      if (!state.settings) state.settings = { strategy: 'avalanche' };
      if (!state.tasks) state.tasks = [];
    }
  } catch (e) {
    console.error('Erro ao carregar dados:', e);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    scheduleSyncToSheets(); // Auto-sync to Google Sheets if connected
  } catch (e) {
    console.error('Erro ao salvar dados:', e);
    showToast('Erro ao salvar dados no navegador.', 'error');
  }
}

// ============================================================
// HELPERS
// ============================================================
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function fmt(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function fmtPct(value) {
  return value.toFixed(1) + '%';
}

function totalIncome() {
  return state.income.reduce((s, i) => s + Number(i.value), 0);
}

function totalExpenses() {
  return state.expenses.reduce((s, e) => s + Number(e.value), 0);
}

function totalDebtInstallments() {
  return state.debts.reduce((s, d) => s + Number(d.installment), 0);
}

function totalDebts() {
  return state.debts.reduce((s, d) => s + Number(d.balance), 0);
}

function totalCommitted() {
  return totalExpenses() + totalDebtInstallments();
}

function ICR() {
  const income = totalIncome();
  if (income === 0) return 0;
  return (totalCommitted() / income) * 100;
}

function monthlyBalance() {
  return totalIncome() - totalCommitted();
}

function getICRLevel(icr) {
  if (icr > 100) return { color: '#EF4444', label: 'Emergencial', semaphore: 'red' };
  if (icr > 60) return { color: '#EF8C44', label: 'Crítico', semaphore: 'red' };
  if (icr > 30) return { color: '#F59E0B', label: 'Atenção', semaphore: 'amber' };
  return { color: '#10B981', label: 'Saudável', semaphore: 'green' };
}

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function formatMonthYear(date) {
  return new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric' }).format(date);
}

// ============================================================
// NAVIGATION
// ============================================================
const PAGE_META = {
  dashboard: { title: 'Dashboard', subtitle: 'Visão geral da sua situação financeira' },
  income: { title: 'Renda Familiar', subtitle: 'Fontes de renda cadastradas' },
  expenses: { title: 'Despesas Fixas', subtitle: 'Gastos mensais mapeados' },
  debts: { title: 'Gestão de Dívidas', subtitle: 'Dívidas e comprometimentos' },
  strategy: { title: 'Estratégia de Quitação', subtitle: 'Plano para eliminar suas dívidas' },
  action: { title: 'Plano de Ação', subtitle: 'Tarefas e compromissos do mês' },
  projection: { title: 'Projeção de Recuperação', subtitle: 'Visualize quando você estará livre' },
  guide: { title: 'Centro de Orientação', subtitle: 'Guias práticos para sair do endividamento' },
};

let currentPage = 'dashboard';

function navigate(page) {
  // Hide all pages
  document.querySelectorAll('.page-content').forEach(el => el.classList.add('hidden'));
  // Show target page
  const target = document.getElementById('page-' + page);
  if (target) {
    target.classList.remove('hidden');
    // Re-trigger animation
    target.style.animation = 'none';
    target.offsetHeight; // reflow
    target.style.animation = '';
  }

  // Update nav
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });

  // Update topbar
  const meta = PAGE_META[page] || {};
  document.getElementById('topbar-title').textContent = meta.title || page;
  document.getElementById('topbar-subtitle').textContent = meta.subtitle || '';

  currentPage = page;

  // Render page-specific content
  renderPage(page);

  // Close mobile sidebar
  document.getElementById('sidebar').classList.remove('mobile-open');
}

function renderPage(page) {
  switch (page) {
    case 'dashboard': renderDashboard(); break;
    case 'income': renderIncome(); break;
    case 'expenses': renderExpenses(); break;
    case 'debts': renderDebts(); break;
    case 'strategy': renderStrategy(); break;
    case 'action': renderAction(); break;
    case 'projection': renderProjection(); break;
  }
}

function toggleMobile() {
  document.getElementById('sidebar').classList.toggle('mobile-open');
}

// ============================================================
// MODAL MANAGEMENT
// ============================================================
function openModal(id) {
  const overlay = document.getElementById(id);
  if (overlay) {
    overlay.classList.add('open');
    // Focus first input
    setTimeout(() => {
      const input = overlay.querySelector('input:not([type=hidden]), select');
      if (input) input.focus();
    }, 100);
  }
}

function closeModal(id) {
  const overlay = document.getElementById(id);
  if (overlay) {
    overlay.classList.remove('open');
    resetModalForm(id);
  }
}

function resetModalForm(id) {
  const overlay = document.getElementById(id);
  if (!overlay) return;
  overlay.querySelectorAll('input:not([type=hidden]), select, textarea').forEach(el => {
    if (el.tagName === 'SELECT') el.selectedIndex = 0;
    else el.value = '';
  });
  overlay.querySelectorAll('[type=hidden]').forEach(el => el.value = '');
  // Reset titles
  const titleEl = overlay.querySelector('[id$="-title"]');
  if (titleEl) {
    const map = {
      'modal-income-title': 'Nova Fonte de Renda',
      'modal-expense-title': 'Nova Despesa',
      'modal-debt-title': 'Nova Dívida',
    };
    titleEl.textContent = map[titleEl.id] || 'Novo Item';
  }
}

// Close modal on overlay click
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    closeModal(e.target.id);
  }
});

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  const icon = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' }[type] || '✅';
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ============================================================
// DASHBOARD
// ============================================================
let chartDonut = null;
let chartDebtsBar = null;

function renderDashboard() {
  const income = totalIncome();
  const committed = totalCommitted();
  const balance = monthlyBalance();
  const debtTotal = totalDebts();
  const icr = ICR();

  // Show/hide onboarding
  const hasData = state.income.length > 0 || state.expenses.length > 0 || state.debts.length > 0;
  const banner = document.getElementById('onboarding-banner');
  if (banner) banner.style.display = hasData ? 'none' : '';

  // Stats
  document.getElementById('stat-income').textContent = fmt(income);
  document.getElementById('stat-income-sub').textContent = `${state.income.length} fonte(s) cadastrada(s)`;

  document.getElementById('stat-committed').textContent = fmt(committed);
  const expEl = document.getElementById('stat-committed-sub');
  expEl.textContent = `${fmt(totalExpenses())} despesas + ${fmt(totalDebtInstallments())} dívidas`;

  const balEl = document.getElementById('stat-balance');
  balEl.textContent = fmt(balance);
  balEl.className = 'stat-value big ' + (balance >= 0 ? 'text-green' : 'text-red');

  document.getElementById('stat-total-debt').textContent = fmt(debtTotal);
  document.getElementById('stat-debt-sub').textContent = `${state.debts.length} dívida(s) cadastrada(s)`;

  // ICR Bar
  const icrLevel = getICRLevel(icr);
  const icrBadge = document.getElementById('icr-badge');
  const icrBar = document.getElementById('icr-bar');
  icrBadge.textContent = fmtPct(icr);
  icrBadge.style.background = icrLevel.color + '22';
  icrBadge.style.color = icrLevel.color;
  icrBadge.style.border = `1px solid ${icrLevel.color}44`;

  const barPct = Math.min(icr, 150); // cap at 150% for visual
  icrBar.style.width = barPct + '%';
  icrBar.style.background = `linear-gradient(90deg, ${icrLevel.color}88, ${icrLevel.color})`;

  // Semaphore
  document.getElementById('sem-red').classList.remove('active');
  document.getElementById('sem-amber').classList.remove('active');
  document.getElementById('sem-green').classList.remove('active');
  document.getElementById(`sem-${icrLevel.semaphore}`).classList.add('active');
  document.getElementById('sem-label').textContent = icrLevel.label;

  // Diagnosis
  renderDiagnosis(icr, income, committed, balance);

  // Sidebar badge
  const sidebarIcr = document.getElementById('sidebar-icr-val');
  const sidebarLabel = document.getElementById('sidebar-icr-label');
  sidebarIcr.textContent = fmtPct(icr);
  sidebarIcr.style.color = icrLevel.color;
  sidebarLabel.textContent = icrLevel.label;

  // Charts
  renderDonutChart();
  renderDebtsBarChart();
  renderCashflowTimeline();
}

function renderDiagnosis(icr, income, committed, balance) {
  const diagEl = document.getElementById('diagnosis-text');
  if (income === 0) {
    diagEl.innerHTML = 'Cadastre sua renda, despesas e dívidas para gerar o diagnóstico automático.';
    return;
  }

  let msgs = [];

  if (icr > 100) {
    msgs.push(`<span class="text-red">🚨 Situação Emergencial:</span> Seu comprometimento de ${fmtPct(icr)} da renda está acima de 100%. Você está gastando mais do que ganha. Ação imediata é necessária.`);
  } else if (icr > 60) {
    msgs.push(`<span class="text-amber">⚠️ Situação Crítica:</span> ${fmtPct(icr)} da renda comprometida. É necessário cortar despesas e negociar dívidas urgentemente.`);
  } else if (icr > 30) {
    msgs.push(`<span class="text-amber">📊 Atenção:</span> ${fmtPct(icr)} da renda comprometida. A situação é controlável mas requer disciplina.`);
  } else {
    msgs.push(`<span class="text-green">✅ Saudável:</span> Apenas ${fmtPct(icr)} da renda comprometida. Continue assim e acelere a quitação das dívidas.`);
  }

  if (balance < 0) {
    msgs.push(`<span class="text-red">💸 Déficit mensal de ${fmt(Math.abs(balance))}.</span> Você precisa de renda extra ou corte urgente de despesas.`);
  } else if (balance > 0 && balance < 200) {
    msgs.push(`<span class="text-amber">⚡ Sobra apenas ${fmt(balance)}/mês.</span> Qualquer imprevisto pode te desestabilizar.`);
  } else if (balance > 0) {
    msgs.push(`<span class="text-green">💚 Sobra ${fmt(balance)}/mês</span> — direcione para quitar a dívida prioritária.`);
  }

  const nonEss = state.expenses.filter(e => e.essential === 'false' || e.essential === false);
  const nonEssTotal = nonEss.reduce((s, e) => s + Number(e.value), 0);
  if (nonEssTotal > 0) {
    msgs.push(`💡 Há <strong>${fmt(nonEssTotal)}</strong> em despesas não essenciais que podem ser cortadas.`);
  }

  diagEl.innerHTML = msgs.join('<br/><br/>');
}

function renderDonutChart() {
  const ctx = document.getElementById('chart-donut').getContext('2d');

  const categories = {};
  state.expenses.forEach(e => {
    categories[e.category] = (categories[e.category] || 0) + Number(e.value);
  });

  // Add debt installments as a category
  const debtTotal = totalDebtInstallments();
  if (debtTotal > 0) categories['Parcelas Dívidas'] = debtTotal;

  const labels = Object.keys(categories);
  const data = Object.values(categories);

  const colors = [
    '#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6',
    '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
  ];

  if (chartDonut) chartDonut.destroy();
  chartDonut = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels.length ? labels : ['Sem dados'],
      datasets: [{
        data: data.length ? data : [1],
        backgroundColor: data.length ? colors.slice(0, labels.length).map(c => c + 'CC') : ['#334155'],
        borderColor: data.length ? colors.slice(0, labels.length) : ['#475569'],
        borderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#94A3B8', font: { size: 11, family: 'Inter' }, padding: 12, boxWidth: 12 }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ${fmt(ctx.parsed)}`
          }
        }
      },
      cutout: '65%',
    }
  });
}

function renderDebtsBarChart() {
  const ctx = document.getElementById('chart-debts-bar').getContext('2d');

  const types = {};
  state.debts.forEach(d => {
    types[d.type] = (types[d.type] || 0) + Number(d.balance);
  });

  const labels = Object.keys(types);
  const data = Object.values(types);

  const colors = ['#EF4444', '#F59E0B', '#8B5CF6', '#3B82F6', '#EC4899', '#06B6D4'];

  if (chartDebtsBar) chartDebtsBar.destroy();
  chartDebtsBar = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels.length ? labels : ['Sem dados'],
      datasets: [{
        label: 'Saldo Devedor',
        data: data.length ? data : [0],
        backgroundColor: colors.slice(0, labels.length).map(c => c + '88'),
        borderColor: colors.slice(0, labels.length),
        borderWidth: 2,
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${fmt(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        x: { ticks: { color: '#94A3B8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: {
          ticks: {
            color: '#94A3B8',
            font: { size: 11 },
            callback: (v) => 'R$' + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v)
          },
          grid: { color: 'rgba(255,255,255,0.05)' }
        }
      }
    }
  });
}

// ============================================================
// INCOME — SPLIT PAYMENT UI HELPERS
// ============================================================
function toggleSplitUI() {
  const val = document.getElementById('income-split-type').value;
  document.getElementById('split-single').classList.toggle('hidden', val !== 'single');
  document.getElementById('split-split2').classList.toggle('hidden', val !== 'split2');
  document.getElementById('split-split3').classList.toggle('hidden', val !== 'split3');
  recalcSplits();
}

function recalcSplits() {
  const total = parseFloat(document.getElementById('income-value').value) || 0;
  const pct1 = parseFloat(document.getElementById('income-pct1') && document.getElementById('income-pct1').value) || 0;
  const val1 = (total * pct1) / 100;
  const val2 = total - val1;
  const pct2 = total > 0 ? (val2 / total) * 100 : 0;

  const el1 = document.getElementById('split-val1');
  const el2 = document.getElementById('split-val2');
  const elPct2 = document.getElementById('income-pct2');
  if (el1) el1.textContent = fmt(val1);
  if (el2) el2.textContent = fmt(val2);
  if (elPct2) elPct2.value = pct2.toFixed(2);
}

function recalcSplits3() {
  const total = parseFloat(document.getElementById('income-value').value) || 0;
  const pct1 = parseFloat(document.getElementById('income-pct1b') && document.getElementById('income-pct1b').value) || 0;
  const pct2 = parseFloat(document.getElementById('income-pct2b') && document.getElementById('income-pct2b').value) || 0;
  const pct3 = Math.max(0, 100 - pct1 - pct2);

  const el1 = document.getElementById('split-val1b');
  const el2 = document.getElementById('split-val2b');
  const el3 = document.getElementById('split-val3b');
  const elPct3 = document.getElementById('income-pct3b');
  if (el1) el1.textContent = fmt((total * pct1) / 100);
  if (el2) el2.textContent = fmt((total * pct2) / 100);
  if (el3) el3.textContent = fmt((total * pct3) / 100);
  if (elPct3) elPct3.value = pct3.toFixed(2);
}

const INCOME_TYPE_LABELS = {
  salario: 'Salário', autonomo: 'Autônomo', aluguel: 'Aluguel',
  beneficio: 'Benefício', outro: 'Outro'
};

function renderIncome() {
  const tbody = document.getElementById('income-tbody');
  const emptyEl = document.getElementById('income-empty');

  document.getElementById('income-total-card').textContent = fmt(totalIncome());
  document.getElementById('income-count-card').textContent = `${state.income.length} fonte(s) de renda`;
  document.getElementById('income-icr-card').textContent = fmtPct(ICR());

  if (state.income.length === 0) {
    tbody.innerHTML = '';
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');

  tbody.innerHTML = state.income.map(inc => `
    <tr>
      <td>
        <div style="font-weight:600">${escHtml(inc.name)}</div>
      </td>
      <td><span class="badge badge-blue">${INCOME_TYPE_LABELS[inc.type] || inc.type}</span></td>
      <td class="amount-positive">${fmt(inc.value)}</td>
      <td>
        <div class="action-btns">
          <button class="btn btn-secondary btn-xs" onclick="editIncome('${inc.id}')">✏️</button>
          <button class="btn btn-danger btn-xs" onclick="deleteIncome('${inc.id}')">🗑️</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function saveIncome() {
  const name = document.getElementById('income-name').value.trim();
  const type = document.getElementById('income-type').value;
  const value = parseFloat(document.getElementById('income-value').value);
  const editId = document.getElementById('income-edit-id').value;
  const splitType = document.getElementById('income-split-type').value;

  if (!name) { showToast('Informe a descrição da renda.', 'warning'); return; }
  if (isNaN(value) || value <= 0) { showToast('Informe um valor válido.', 'warning'); return; }

  // Build payments array
  let payments = [];
  if (splitType === 'single') {
    const day = parseInt(document.getElementById('income-day-single').value);
    payments = [{ day, pct: 100, amount: value }];
  } else if (splitType === 'split2') {
    const day1 = parseInt(document.getElementById('income-day1').value);
    const pct1 = parseFloat(document.getElementById('income-pct1').value) || 0;
    const day2 = parseInt(document.getElementById('income-day2').value);
    const pct2 = 100 - pct1;
    if (pct1 <= 0 || pct1 >= 100) { showToast('Informe o % do adiantamento (entre 1 e 99%).', 'warning'); return; }
    payments = [
      { day: day1, pct: pct1, amount: parseFloat(((value * pct1) / 100).toFixed(2)) },
      { day: day2, pct: pct2, amount: parseFloat(((value * pct2) / 100).toFixed(2)) },
    ];
  } else if (splitType === 'split3') {
    const day1 = parseInt(document.getElementById('income-day1b').value);
    const pct1 = parseFloat(document.getElementById('income-pct1b').value) || 0;
    const day2 = parseInt(document.getElementById('income-day2b').value);
    const pct2 = parseFloat(document.getElementById('income-pct2b').value) || 0;
    const day3 = parseInt(document.getElementById('income-day3b').value);
    const pct3 = parseFloat(document.getElementById('income-pct3b').value) || 0;
    if (pct1 + pct2 >= 100) { showToast('A soma dos % deve ser menor que 100%.', 'warning'); return; }
    payments = [
      { day: day1, pct: pct1, amount: parseFloat(((value * pct1) / 100).toFixed(2)) },
      { day: day2, pct: pct2, amount: parseFloat(((value * pct2) / 100).toFixed(2)) },
      { day: day3, pct: pct3, amount: parseFloat(((value * pct3) / 100).toFixed(2)) },
    ];
  }

  const incomeObj = { name, type, value, splitType, payments };

  if (editId) {
    const idx = state.income.findIndex(i => i.id === editId);
    if (idx >= 0) state.income[idx] = { ...state.income[idx], ...incomeObj };
    showToast('Renda atualizada!');
  } else {
    state.income.push({ id: uid(), ...incomeObj });
    showToast('Renda adicionada!');
  }

  saveState();
  closeModal('modal-income');
  renderIncome();
  renderSidebar();
}

function editIncome(id) {
  const inc = state.income.find(i => i.id === id);
  if (!inc) return;
  document.getElementById('income-edit-id').value = inc.id;
  document.getElementById('income-name').value = inc.name;
  document.getElementById('income-type').value = inc.type;
  document.getElementById('income-value').value = inc.value;
  document.getElementById('modal-income-title').textContent = 'Editar Renda';

  // Restore split UI
  const splitType = inc.splitType || 'single';
  document.getElementById('income-split-type').value = splitType;
  toggleSplitUI();

  if (splitType === 'single' && inc.payments && inc.payments[0]) {
    document.getElementById('income-day-single').value = String(inc.payments[0].day);
  } else if (splitType === 'split2' && inc.payments && inc.payments.length >= 2) {
    document.getElementById('income-day1').value = String(inc.payments[0].day);
    document.getElementById('income-pct1').value = inc.payments[0].pct;
    document.getElementById('income-day2').value = String(inc.payments[1].day);
    recalcSplits();
  } else if (splitType === 'split3' && inc.payments && inc.payments.length >= 3) {
    document.getElementById('income-day1b').value = String(inc.payments[0].day);
    document.getElementById('income-pct1b').value = inc.payments[0].pct;
    document.getElementById('income-day2b').value = String(inc.payments[1].day);
    document.getElementById('income-pct2b').value = inc.payments[1].pct;
    document.getElementById('income-day3b').value = String(inc.payments[2].day);
    recalcSplits3();
  }

  openModal('modal-income');
}

// ============================================================
// CASHFLOW ENGINE
// ============================================================

/**
 * Builds an ordered list of payment windows from income sources.
 * Each window: { day, label, income, incomeSource, items: [{name, amount, type, isConsignado}], totalOut, balance }
 * Items assigned based on debt.dueday vs income window days.
 */
function getCashflowWindows() {
  // Collect all payment slots from income
  const slots = [];
  state.income.forEach(inc => {
    const payments = inc.payments && inc.payments.length > 0
      ? inc.payments
      : [{ day: 1, pct: 100, amount: Number(inc.value) }];
    payments.forEach(p => {
      slots.push({
        day: Number(p.day),
        income: Number(p.amount),
        incomeName: inc.name,
        splitLabel: p.pct < 100 ? `${Number(p.pct).toFixed(2)}% — ${p.day === 31 ? 'Último dia' : 'Dia ' + p.day}` : null,
        isDeductionSlot: p.day === 31 || (inc.splitType === 'split2' && p === inc.payments[1]),
      });
    });
  });

  if (slots.length === 0) return null;

  // Sort windows by day
  slots.sort((a, b) => a.day - b.day);

  // Assign expenses and debts to windows
  // Rule: item goes into the window just BEFORE or ON its due date
  const windows = slots.map(s => ({ ...s, items: [], totalOut: 0 }));

  // Helper: find which window index absorbs a given due day
  function findWindowIdx(dueDay) {
    if (!dueDay) return windows.length - 1; // unspecified → last window
    const day = Number(dueDay);
    // Find first window whose day >= dueDay, else last
    for (let i = 0; i < windows.length; i++) {
      if (windows[i].day >= day) return i;
    }
    return windows.length - 1;
  }

  // Fixed expenses: spread evenly across first window (or by category if desired)
  // For simplicity, assign essential/fixed expenses to the first window,
  // non-essential to second, unless only one window exists
  state.expenses.forEach(exp => {
    // Expenses with explicit due day
    const idx = exp.dueday ? findWindowIdx(exp.dueday) : 0;
    const w = windows[Math.min(idx, windows.length - 1)];
    w.items.push({ name: exp.name, amount: Number(exp.value), type: 'expense', isConsignado: false });
    w.totalOut += Number(exp.value);
  });

  // Debts: consignados go into deduction slot (last payment of titular), others by dueday
  state.debts.forEach(debt => {
    const isConsig = debt.type === 'Consignado';
    let targetWindowIdx;
    if (isConsig) {
      // Find the deduction slot (window with isDeductionSlot=true), fallback to last
      targetWindowIdx = windows.findIndex(w => w.isDeductionSlot);
      if (targetWindowIdx === -1) targetWindowIdx = windows.length - 1;
    } else {
      targetWindowIdx = debt.dueday ? findWindowIdx(debt.dueday) : windows.length - 1;
    }
    const w = windows[Math.min(targetWindowIdx, windows.length - 1)];
    w.items.push({ name: debt.name, amount: Number(debt.installment), type: 'debt', isConsignado: isConsig });
    w.totalOut += Number(debt.installment);
  });

  // Calculate balances
  windows.forEach(w => { w.balance = w.income - w.totalOut; });

  return windows;
}

/**
 * Renders the cashflow timeline in the Dashboard
 */
function renderCashflowTimeline() {
  const el = document.getElementById('cashflow-timeline');
  if (!el) return;

  const windows = getCashflowWindows();
  if (!windows || windows.length === 0) {
    el.innerHTML = `<div class="empty-state" style="padding:24px">
      <div class="empty-state-icon" style="font-size:2rem">📆</div>
      <div class="empty-state-text">Cadastre sua renda com datas de recebimento para ver o fluxo de caixa</div>
    </div>`;
    return;
  }

  const windowColors = [
    { border: 'rgba(16,185,129,0.3)', bg: 'rgba(16,185,129,0.06)', label: 'var(--emerald)' },
    { border: 'rgba(245,158,11,0.3)', bg: 'rgba(245,158,11,0.06)', label: 'var(--amber)' },
    { border: 'rgba(59,130,246,0.3)', bg: 'rgba(59,130,246,0.06)', label: 'var(--blue)' },
  ];

  const html = `<div class="cashflow-timeline">
    ${windows.map((w, i) => {
    const color = windowColors[i % windowColors.length];
    const dayLabel = w.day === 31 ? 'Último dia do mês' : (w.day === 1 ? '1º dia útil do mês' : `Dia ${w.day}`);
    const balClass = w.balance >= 0 ? 'cashflow-balance-positive' : 'cashflow-balance-negative';
    const SHOW_MAX = 5;
    const visItems = w.items.slice(0, SHOW_MAX);
    const extra = w.items.length - SHOW_MAX;

    return `<div class="cashflow-window">
        <div class="cashflow-window-card" style="border-color:${color.border};background:${color.bg}">
          <div class="cashflow-window-header">
            <div>
              <div class="cashflow-window-date" style="color:${color.label}">📅 ${dayLabel}</div>
              <div style="font-size:0.68rem;color:var(--text-muted)">${escHtml(w.incomeName)}${w.splitLabel ? ' · ' + w.splitLabel : ''}</div>
            </div>
            <div style="text-align:right">
              <div class="cashflow-window-income">${fmt(w.income)}</div>
              <div class="cashflow-window-label">entra</div>
            </div>
          </div>
          <div class="cashflow-items">
            ${visItems.map(item => `
              <div class="cashflow-item ${item.isConsignado ? 'consignado' : ''}">
                <span class="cashflow-item-name">
                  ${item.isConsignado ? '📋 ' : item.type === 'debt' ? '💳 ' : '📤 '}
                  ${escHtml(item.name)}
                </span>
                <span class="cashflow-item-value">−${fmt(item.amount)}</span>
              </div>
            `).join('')}
            ${extra > 0 ? `<div class="cashflow-overflow">+${extra} item(s) não mostrado(s)</div>` : ''}
            ${w.items.length === 0 ? '<div style="font-size:0.75rem;color:var(--text-muted);text-align:center;padding:8px">Nenhuma conta nesta janela</div>' : ''}
          </div>
          <div class="cashflow-window-footer">
            <div class="cashflow-balance-label">${w.totalOut > 0 ? `−${fmt(w.totalOut)} saem` : 'Sem saídas'}</div>
            <div class="${balClass}">${w.balance >= 0 ? '+' : ''}${fmt(w.balance)}</div>
          </div>
        </div>
      </div>`;
  }).join('')}
  </div>`;

  // Check unassigned (expenses without dueday when multiple windows)
  const hasMultipleWindows = windows.length > 1;
  const unassignedCount = state.expenses.filter(e => !e.dueday && hasMultipleWindows).length;

  el.innerHTML = html +
    (unassignedCount > 0 ? `<div class="cashflow-unassigned">
      <span>⚠️</span>
      <span><strong>${unassignedCount} despesa(s)</strong> sem dia de vencimento definido foram alocadas na 1ª janela. Edite as despesas e adicione o dia de vencimento para melhor precisão.</span>
    </div>` : '');
}

/**
 * Renders the cashflow windows in the Action Plan page
 */
function renderActionCashflow() {
  const el = document.getElementById('action-cashflow');
  if (!el) return;

  const windows = getCashflowWindows();
  if (!windows || windows.length === 0) {
    el.innerHTML = '<div style="font-size:0.875rem;color:var(--text-muted);padding:12px">Cadastre rendas com datas para ver as contas agrupadas.</div>';
    return;
  }

  const windowColors = [
    { header: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.25)', label: 'var(--emerald)', icon: '💚' },
    { header: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.25)', label: 'var(--amber)', icon: '🟡' },
    { header: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.25)', label: 'var(--blue)', icon: '🔵' },
  ];

  el.innerHTML = windows.map((w, i) => {
    const c = windowColors[i % windowColors.length];
    const dayLabel = w.day === 31 ? 'Último dia do mês' : (w.day === 1 ? '1º dia útil' : `Dia ${w.day}`);
    const balClass = w.balance >= 0 ? 'amount-positive' : 'amount-negative';
    return `<div class="action-window-group">
      <div class="action-window-header" style="background:${c.header};border:1px solid ${c.border}">
        <span>${c.icon}</span>
        <span style="color:${c.label}">${dayLabel}</span>
        <span style="color:var(--text-muted);font-weight:400;font-size:0.78rem">${escHtml(w.incomeName)}</span>
        <span style="margin-left:auto;color:var(--emerald)">Entra: ${fmt(w.income)}</span>
      </div>
      <div class="action-window-items">
        ${w.items.length === 0
        ? '<div style="font-size:0.8rem;color:var(--text-muted);padding:8px 14px">Nenhuma conta nesta janela</div>'
        : w.items.map(item => `
            <div class="action-window-item">
              <span class="action-window-item-name">
                ${item.isConsignado ? '📋' : item.type === 'debt' ? '💳' : '📤'}
                ${escHtml(item.name)}
                ${item.isConsignado ? '<span class="badge badge-purple" style="font-size:0.6rem;margin-left:6px">Consignado</span>' : ''}
              </span>
              <span class="action-window-item-value" style="color:var(--red)">−${fmt(item.amount)}</span>
            </div>`).join('')
      }
        <div class="action-window-summary">
          <span style="color:var(--text-muted)">Total saídas: <strong style="color:var(--red)">${fmt(w.totalOut)}</strong></span>
          <span class="${balClass}">${w.balance >= 0 ? 'Sobra: +' : 'Falta: '}${fmt(Math.abs(w.balance))}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

function deleteIncome(id) {
  if (!confirm('Remover esta fonte de renda?')) return;
  state.income = state.income.filter(i => i.id !== id);
  saveState();
  renderIncome();
  renderSidebar();
  showToast('Renda removida.', 'warning');
}


// ============================================================
// EXPENSES
// ============================================================
let expenseFilter = 'all';

function renderExpenses() {
  const tbody = document.getElementById('expenses-tbody');
  const emptyEl = document.getElementById('expenses-empty');

  const total = totalExpenses();
  const essentials = state.expenses.filter(e => e.essential === 'true' || e.essential === true);
  const nonEssentials = state.expenses.filter(e => e.essential === 'false' || e.essential === false);
  const essTotal = essentials.reduce((s, e) => s + Number(e.value), 0);
  const nonEssTotal = nonEssentials.reduce((s, e) => s + Number(e.value), 0);

  document.getElementById('exp-total-card').textContent = fmt(total);
  document.getElementById('exp-count-card').textContent = `${state.expenses.length} despesa(s)`;
  document.getElementById('exp-essential-card').textContent = fmt(essTotal);
  document.getElementById('exp-nonessential-card').textContent = fmt(nonEssTotal);

  // Cut suggestion
  const cutEl = document.getElementById('cut-suggestion');
  const cutTextEl = document.getElementById('cut-suggestion-text');
  const icr = ICR();
  if (icr > 60 && nonEssTotal > 0) {
    cutEl.classList.remove('hidden');
    cutTextEl.innerHTML = `⚠️ Com ICR de ${fmtPct(icr)}, você deve considerar cortar as <strong>${nonEssentials.length} despesa(s) não essencial(is)</strong> no total de <strong>${fmt(nonEssTotal)}</strong>. Isso reduziria seu ICR para <strong>${fmtPct(Math.max(0, ICR() - (nonEssTotal / totalIncome() * 100)))}%</strong>.`;
  } else {
    cutEl.classList.add('hidden');
  }

  let filtered = state.expenses;
  if (expenseFilter === 'essential') filtered = essentials;
  if (expenseFilter === 'non-essential') filtered = nonEssentials;

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');

  const income = totalIncome();
  tbody.innerHTML = filtered.map(exp => {
    const pct = income > 0 ? ((Number(exp.value) / income) * 100).toFixed(1) : '—';
    const isEss = exp.essential === 'true' || exp.essential === true;
    return `
      <tr>
        <td><div style="font-weight:600">${escHtml(exp.name)}</div></td>
        <td><span class="badge badge-gray">${escHtml(exp.category)}</span></td>
        <td>
          <span class="badge ${isEss ? 'badge-green' : 'badge-amber'}">
            ${isEss ? '✅ Essencial' : '⚠️ Não essencial'}
          </span>
        </td>
        <td class="amount-negative">${fmt(exp.value)}</td>
        <td class="td-secondary">${pct}%</td>
        <td>
          <div class="action-btns">
            <button class="btn btn-secondary btn-xs" onclick="editExpense('${exp.id}')">✏️</button>
            <button class="btn btn-danger btn-xs" onclick="deleteExpense('${exp.id}')">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function filterExpenses(val) {
  expenseFilter = val;
  renderExpenses();
}

function saveExpense() {
  const name = document.getElementById('expense-name').value.trim();
  const category = document.getElementById('expense-category').value;
  const value = parseFloat(document.getElementById('expense-value').value);
  const essential = document.getElementById('expense-essential').value;
  const dueday = document.getElementById('expense-dueday').value || null;
  const editId = document.getElementById('expense-edit-id').value;

  if (!name) { showToast('Informe a descrição da despesa.', 'warning'); return; }
  if (isNaN(value) || value <= 0) { showToast('Informe um valor válido.', 'warning'); return; }

  if (editId) {
    const idx = state.expenses.findIndex(e => e.id === editId);
    if (idx >= 0) state.expenses[idx] = { ...state.expenses[idx], name, category, value, essential, dueday };
    showToast('Despesa atualizada!');
  } else {
    state.expenses.push({ id: uid(), name, category, value, essential, dueday });
    showToast('Despesa adicionada!');
  }

  saveState();
  closeModal('modal-expense');
  renderExpenses();
  renderSidebar();
}

function editExpense(id) {
  const exp = state.expenses.find(e => e.id === id);
  if (!exp) return;
  document.getElementById('expense-edit-id').value = exp.id;
  document.getElementById('expense-name').value = exp.name;
  document.getElementById('expense-category').value = exp.category;
  document.getElementById('expense-value').value = exp.value;
  document.getElementById('expense-essential').value = String(exp.essential);
  document.getElementById('expense-dueday').value = exp.dueday || '';
  document.getElementById('modal-expense-title').textContent = 'Editar Despesa';
  openModal('modal-expense');
}

function deleteExpense(id) {
  if (!confirm('Remover esta despesa?')) return;
  state.expenses = state.expenses.filter(e => e.id !== id);
  saveState();
  renderExpenses();
  renderSidebar();
  showToast('Despesa removida.', 'warning');
}

// ============================================================
// DEBTS
// ============================================================
const DEBT_TYPE_COLORS = {
  'Consignado': 'badge-purple',
  'Cartão de Crédito': 'badge-red',
  'Empréstimo Pessoal': 'badge-blue',
  'Cheque Especial': 'badge-amber',
  'Financiamento': 'badge-green',
  'Outro': 'badge-gray',
};

function renderDebts() {
  const grid = document.getElementById('debt-cards-grid');
  const emptyEl = document.getElementById('debts-empty');

  document.getElementById('debt-total-card').textContent = fmt(totalDebts());
  document.getElementById('debt-count-card').textContent = `${state.debts.length} dívida(s)`;
  document.getElementById('debt-installments-card').textContent = fmt(totalDebtInstallments());
  const income = totalIncome();
  const debtPct = income > 0 ? ((totalDebtInstallments() / income) * 100).toFixed(1) : '—';
  document.getElementById('debt-income-pct-card').textContent = debtPct + '%';

  if (state.debts.length === 0) {
    grid.innerHTML = '';
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');

  grid.innerHTML = state.debts.map(debt => {
    const pct = income > 0 ? ((Number(debt.installment) / income) * 100).toFixed(1) : '—';
    const badgeClass = DEBT_TYPE_COLORS[debt.type] || 'badge-gray';
    const barPct = Math.min((Number(debt.balance) / totalDebts()) * 100, 100);
    return `
      <div class="debt-card animate-in">
        <div class="debt-card-header">
          <div>
            <div class="debt-name">${escHtml(debt.name)}</div>
            <div class="debt-creditor">${escHtml(debt.creditor || '—')}</div>
          </div>
          <span class="badge ${badgeClass}">${escHtml(debt.type)}</span>
        </div>

        <div class="debt-balance">${fmt(debt.balance)}</div>
        <div class="debt-installment">Parcela: ${fmt(debt.installment)}/mês · ${pct}% da renda</div>

        <div class="progress-bar" style="margin-top:12px">
          <div class="progress-fill" style="width:${barPct}%;background:var(--gradient-danger)"></div>
        </div>

        <div class="debt-meta">
          ${debt.rate ? `<span class="badge badge-amber">🔥 ${Number(debt.rate).toFixed(2)}% a.m.</span>` : ''}
          ${debt.remaining ? `<span class="badge badge-gray">📅 ${debt.remaining}x restantes</span>` : ''}
          ${debt.dueday ? `<span class="badge badge-blue">📆 Vence dia ${debt.dueday}</span>` : ''}
        </div>

        <div class="debt-card-actions">
          <button class="btn btn-secondary btn-xs" onclick="editDebt('${debt.id}')">✏️ Editar</button>
          <button class="btn btn-danger btn-xs" onclick="deleteDebt('${debt.id}')">🗑️ Remover</button>
        </div>
      </div>
    `;
  }).join('');
}

function saveDebt() {
  const name = document.getElementById('debt-name').value.trim();
  const creditor = document.getElementById('debt-creditor').value.trim();
  const type = document.getElementById('debt-type').value;
  const balance = parseFloat(document.getElementById('debt-balance').value);
  const installment = parseFloat(document.getElementById('debt-installment').value);
  const remaining = parseInt(document.getElementById('debt-remaining').value) || null;
  const rate = parseFloat(document.getElementById('debt-rate').value) || 0;
  const dueday = parseInt(document.getElementById('debt-dueday').value) || null;
  const editId = document.getElementById('debt-edit-id').value;

  if (!name) { showToast('Informe o nome da dívida.', 'warning'); return; }
  if (isNaN(balance) || balance <= 0) { showToast('Informe o saldo devedor.', 'warning'); return; }
  if (isNaN(installment) || installment <= 0) { showToast('Informe o valor da parcela.', 'warning'); return; }

  const debtObj = { name, creditor, type, balance, installment, remaining, rate, dueday };

  if (editId) {
    const idx = state.debts.findIndex(d => d.id === editId);
    if (idx >= 0) state.debts[idx] = { ...state.debts[idx], ...debtObj };
    showToast('Dívida atualizada!');
  } else {
    state.debts.push({ id: uid(), ...debtObj });
    showToast('Dívida adicionada!');
  }

  saveState();
  closeModal('modal-debt');
  renderDebts();
  renderSidebar();
}

function editDebt(id) {
  const debt = state.debts.find(d => d.id === id);
  if (!debt) return;
  document.getElementById('debt-edit-id').value = debt.id;
  document.getElementById('debt-name').value = debt.name;
  document.getElementById('debt-creditor').value = debt.creditor || '';
  document.getElementById('debt-type').value = debt.type;
  document.getElementById('debt-balance').value = debt.balance;
  document.getElementById('debt-installment').value = debt.installment;
  document.getElementById('debt-remaining').value = debt.remaining || '';
  document.getElementById('debt-rate').value = debt.rate || '';
  document.getElementById('debt-dueday').value = debt.dueday || '';
  document.getElementById('modal-debt-title').textContent = 'Editar Dívida';
  openModal('modal-debt');
}

function deleteDebt(id) {
  if (!confirm('Remover esta dívida?')) return;
  state.debts = state.debts.filter(d => d.id !== id);
  saveState();
  renderDebts();
  renderSidebar();
  showToast('Dívida removida.', 'warning');
}

// ============================================================
// STRATEGY
// ============================================================
let chartStrategyImpact = null;

function setStrategy(strategy) {
  state.settings.strategy = strategy;
  saveState();

  document.getElementById('btn-avalanche').classList.toggle('active', strategy === 'avalanche');
  document.getElementById('btn-snowball').classList.toggle('active', strategy === 'snowball');
  document.getElementById('strategy-info-avalanche').classList.toggle('hidden', strategy !== 'avalanche');
  document.getElementById('strategy-info-snowball').classList.toggle('hidden', strategy !== 'snowball');

  renderStrategy();
}

function getOrderedDebts() {
  const debts = [...state.debts];
  if (state.settings.strategy === 'avalanche') {
    debts.sort((a, b) => Number(b.rate) - Number(a.rate));
  } else {
    debts.sort((a, b) => Number(a.balance) - Number(b.balance));
  }
  return debts;
}

function estimatePayoffDate(balance, installment, rate) {
  if (!installment || installment <= 0) return null;
  if (!rate || rate <= 0) {
    // Simple division
    const months = Math.ceil(balance / installment);
    return { months, date: addMonths(new Date(), months) };
  }
  // PMT formula: n = -ln(1 - r*PV/PMT) / ln(1+r)
  const r = rate / 100;
  const PV = balance;
  const PMT = installment;
  if (PMT <= PV * r) return null; // payment insufficient to cover interest
  const n = -Math.log(1 - (r * PV) / PMT) / Math.log(1 + r);
  const months = Math.ceil(n);
  return { months, date: addMonths(new Date(), months) };
}

function renderStrategy() {
  const strategy = state.settings.strategy;
  document.getElementById('btn-avalanche').classList.toggle('active', strategy === 'avalanche');
  document.getElementById('btn-snowball').classList.toggle('active', strategy === 'snowball');
  document.getElementById('strategy-info-avalanche').classList.toggle('hidden', strategy !== 'avalanche');
  document.getElementById('strategy-info-snowball').classList.toggle('hidden', strategy !== 'snowball');

  const tbody = document.getElementById('strategy-tbody');
  const emptyEl = document.getElementById('strategy-empty');
  const summaryEl = document.getElementById('strategy-summary');

  if (state.debts.length === 0) {
    tbody.innerHTML = '';
    emptyEl.classList.remove('hidden');
    summaryEl.textContent = 'Cadastre suas dívidas para ver o plano de quitação.';
    return;
  }
  emptyEl.classList.add('hidden');

  const ordered = getOrderedDebts();
  const balance = monthlyBalance();
  let extraPayment = Math.max(0, balance);

  // Calculate payoff
  let totalMonths = 0;
  let totalSaved = 0;

  tbody.innerHTML = ordered.map((debt, i) => {
    const payoff = estimatePayoffDate(Number(debt.balance), Number(debt.installment), Number(debt.rate));
    const monthsLabel = payoff ? `${payoff.months} mês(es)` : 'Indefinido';
    const dateLabel = payoff ? formatMonthYear(payoff.date) : '—';
    if (payoff && payoff.months > totalMonths) totalMonths = payoff.months;

    return `
      <tr>
        <td><div class="payoff-order-badge">${i + 1}</div></td>
        <td><div style="font-weight:600">${escHtml(debt.name)}</div></td>
        <td class="td-secondary">${escHtml(debt.creditor || '—')}</td>
        <td class="amount-negative">${fmt(debt.balance)}</td>
        <td class="td-secondary">${fmt(debt.installment)}</td>
        <td>
          ${debt.rate ? `<span class="badge badge-amber">🔥 ${Number(debt.rate).toFixed(2)}%</span>` : '<span class="td-muted">—</span>'}
        </td>
        <td class="td-secondary">${debt.remaining || '—'}</td>
        <td>
          <div style="font-weight:600;color:var(--emerald)">${dateLabel}</div>
          <div class="td-muted">${monthsLabel}</div>
        </td>
      </tr>
    `;
  }).join('');

  // Summary
  const freeDate = totalMonths > 0 ? formatMonthYear(addMonths(new Date(), totalMonths)) : '—';
  summaryEl.innerHTML = `
    <div style="margin-bottom:16px">
      <div class="text-xs text-muted mb-8">ESTRATÉGIA ATUAL</div>
      <div style="font-weight:700;font-size:1rem;color:var(--text-primary);margin-bottom:4px">
        ${strategy === 'avalanche' ? '🌊 Avalanche — Maior juros primeiro' : '❄️ Bola de Neve — Menor saldo primeiro'}
      </div>
      <div class="text-sm text-secondary">
        ${strategy === 'avalanche' ? 'Economiza mais juros no longo prazo.' : 'Gera motivação com vitórias rápidas.'}
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div style="background:var(--bg-input);border-radius:var(--radius-md);padding:12px;border:1px solid var(--border)">
        <div class="text-xs text-muted mb-4">DÍVIDAS ORDENADAS</div>
        <div style="font-weight:800;font-size:1.2rem;color:var(--text-primary)">${ordered.length}</div>
      </div>
      <div style="background:var(--bg-input);border-radius:var(--radius-md);padding:12px;border:1px solid var(--border)">
        <div class="text-xs text-muted mb-4">LIVRE APROXIMADAMENTE</div>
        <div style="font-weight:800;font-size:1rem;color:var(--emerald)">${freeDate}</div>
      </div>
      <div style="background:var(--bg-input);border-radius:var(--radius-md);padding:12px;border:1px solid var(--border)">
        <div class="text-xs text-muted mb-4">SOBRA MENSAL ATUAL</div>
        <div style="font-weight:800;font-size:1.1rem;color:${balance >= 0 ? 'var(--emerald)' : 'var(--red)'}">${fmt(balance)}</div>
      </div>
      <div style="background:var(--bg-input);border-radius:var(--radius-md);padding:12px;border:1px solid var(--border)">
        <div class="text-xs text-muted mb-4">TOTAL DE DÍVIDAS</div>
        <div style="font-weight:800;font-size:1.1rem;color:var(--red)">${fmt(totalDebts())}</div>
      </div>
    </div>
  `;

  renderStrategyImpactChart(ordered);
}

function renderStrategyImpactChart(ordered) {
  const ctx = document.getElementById('chart-strategy-impact').getContext('2d');
  const labels = ordered.map(d => d.name.length > 12 ? d.name.slice(0, 12) + '…' : d.name);
  const data = ordered.map(d => Number(d.installment));

  if (chartStrategyImpact) chartStrategyImpact.destroy();
  chartStrategyImpact = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Parcela Mensal',
        data,
        backgroundColor: ordered.map((_, i) => {
          const alpha = 1 - (i / ordered.length) * 0.5;
          return `rgba(16,185,129,${alpha})`;
        }),
        borderColor: '#10B981',
        borderWidth: 1,
        borderRadius: 4,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => ` Parcela: ${fmt(ctx.parsed.x)}` } }
      },
      scales: {
        x: { ticks: { color: '#94A3B8', callback: v => 'R$' + v }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { ticks: { color: '#94A3B8', font: { size: 11 } }, grid: { display: false } }
      }
    }
  });
}

// ============================================================
// ACTION PLAN
// ============================================================
let taskFilter = 'all';

function renderAction() {
  const listEl = document.getElementById('task-list');
  const emptyEl = document.getElementById('tasks-empty');
  const icr = ICR();
  const balance = monthlyBalance();

  // Auto-recommendations
  const recsEl = document.getElementById('auto-recommendations');
  const recs = [];

  if (icr > 100) recs.push('🚨 <strong>Urgente:</strong> Entre em contato com cada credor e negocie redução de parcelas.');
  if (icr > 60) recs.push('⚠️ Revise todas as despesas não essenciais e corte ao máximo.');

  const nonEss = state.expenses.filter(e => e.essential === 'false' || e.essential === false);
  nonEss.forEach(e => recs.push(`✂️ Considere cortar: <strong>${escHtml(e.name)}</strong> (${fmt(e.value)}/mês)`));

  state.debts.sort((a, b) => Number(b.rate) - Number(a.rate));
  if (state.debts.length > 0) {
    const highestRate = state.debts[0];
    recs.push(`🔥 Priorize quitar: <strong>${escHtml(highestRate.name)}</strong> (${Number(highestRate.rate).toFixed(2)}% a.m.)`);
  }

  if (balance < 0) recs.push(`💸 Déficit de <strong>${fmt(Math.abs(balance))}</strong>/mês — busque renda extra ou negocie dívidas.`);
  recs.push('📞 Pesquise portabilidade de crédito consignado para reduzir juros.');
  recs.push('🔗 Verifique ofertas de renegociação no <a class="tip-link" href="https://www.serasa.com.br/limpa-nome-online/" target="_blank">Serasa Limpa Nome</a>.');

  recsEl.innerHTML = recs.map(r => `<div style="padding:8px 0;border-bottom:1px solid var(--border)">${r}</div>`).join('');

  // Cashflow by window
  renderActionCashflow();

  // Task stats
  const total = state.tasks.length;
  const done = state.tasks.filter(t => t.done).length;
  document.getElementById('tasks-done-count').textContent = done;
  document.getElementById('tasks-progress-label').textContent = `${done} de ${total} tarefas`;
  const pct = total > 0 ? (done / total) * 100 : 0;
  document.getElementById('tasks-progress-bar').style.width = pct + '%';

  // Filter tasks
  let filtered = state.tasks;
  if (taskFilter === 'pending') filtered = state.tasks.filter(t => !t.done);
  if (taskFilter === 'done') filtered = state.tasks.filter(t => t.done);

  if (filtered.length === 0) {
    listEl.innerHTML = '';
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');

  const priorityColors = { high: 'var(--red)', medium: 'var(--amber)', low: 'var(--emerald)' };
  const priorityLabels = { high: '🔴 Alta', medium: '🟡 Média', low: '🟢 Baixa' };

  listEl.innerHTML = filtered.map(task => `
    <div class="task-item ${task.done ? 'done' : ''}">
      <div class="task-checkbox ${task.done ? 'checked' : ''}" onclick="toggleTask('${task.id}')">
        ${task.done ? '✓' : ''}
      </div>
      <div style="flex:1">
        <div class="task-text">${escHtml(task.text)}</div>
        <div style="display:flex;gap:8px;margin-top:4px;flex-wrap:wrap">
          ${task.priority ? `<span class="badge" style="background:${priorityColors[task.priority]}22;color:${priorityColors[task.priority]};border-color:${priorityColors[task.priority]}44;font-size:0.65rem">${priorityLabels[task.priority]}</span>` : ''}
          ${task.due ? `<span class="task-due">📅 ${new Date(task.due + 'T00:00').toLocaleDateString('pt-BR')}</span>` : ''}
        </div>
      </div>
      <button class="btn btn-danger btn-xs" onclick="deleteTask('${task.id}')">🗑️</button>
    </div>
  `).join('');
}

function filterTasks(val) {
  taskFilter = val;
  renderAction();
}

function saveTask() {
  const text = document.getElementById('task-text').value.trim();
  const due = document.getElementById('task-due').value;
  const priority = document.getElementById('task-priority').value;

  if (!text) { showToast('Informe a descrição da tarefa.', 'warning'); return; }

  state.tasks.unshift({ id: uid(), text, due, priority, done: false });
  saveState();
  closeModal('modal-task');
  renderAction();
  showToast('Tarefa adicionada!');
}

function toggleTask(id) {
  const task = state.tasks.find(t => t.id === id);
  if (task) {
    task.done = !task.done;
    saveState();
    renderAction();
    if (task.done) showToast('Tarefa concluída! 🎉');
  }
}

function deleteTask(id) {
  if (!confirm('Remover esta tarefa?')) return;
  state.tasks = state.tasks.filter(t => t.id !== id);
  saveState();
  renderAction();
  showToast('Tarefa removida.', 'warning');
}

// ============================================================
// PROJECTION
// ============================================================
let chartProjection = null;
let chartICRProjection = null;

function renderProjection() {
  const income = totalIncome();
  const debts = state.debts;
  const totalDebt = totalDebts();

  if (debts.length === 0 || income === 0) {
    document.getElementById('milestone-free').textContent = '—';
    document.getElementById('milestone-healthy').textContent = '—';
    document.getElementById('milestone-savings').textContent = '—';
    document.getElementById('milestone-months').textContent = 'Sem dados';
    renderProjectionChart([], []);
    renderICRChart([], []);
    return;
  }

  // Simulate payoff month by month
  const MONTHS = 120; // max 10 years
  const today = new Date();

  let debtsCopy = debts.map(d => ({ ...d, balance: Number(d.balance), installment: Number(d.installment), rate: Number(d.rate) || 0 }));
  let expenses = totalExpenses();

  const balanceLabels = [];
  const balanceData = [];
  const icrData = [];

  let freeMonth = null;
  let healthyMonth = null;
  let totalInterestPaid = 0;
  let totalInterestMinimal = 0;

  for (let m = 0; m <= MONTHS; m++) {
    const activeDebts = debtsCopy.filter(d => d.balance > 0);
    const currentInstallments = activeDebts.reduce((s, d) => s + d.installment, 0);
    const currentICR = income > 0 ? ((expenses + currentInstallments) / income) * 100 : 0;
    const currentDebt = activeDebts.reduce((s, d) => s + d.balance, 0);

    balanceLabels.push(m === 0 ? 'Hoje' : formatMonthYear(addMonths(today, m)));
    balanceData.push(Math.max(0, parseFloat(currentDebt.toFixed(2))));
    icrData.push(parseFloat(currentICR.toFixed(2)));

    if (freeMonth === null && currentDebt <= 0 && m > 0) freeMonth = m;
    if (healthyMonth === null && currentICR <= 30 && m > 0) healthyMonth = m;

    // Apply payments
    debtsCopy = debtsCopy.map(d => {
      if (d.balance <= 0) return d;
      const interest = d.balance * (d.rate / 100);
      totalInterestPaid += interest;
      const principal = Math.min(d.installment - interest, d.balance);
      return { ...d, balance: Math.max(0, d.balance - principal) };
    });
  }

  // Milestones
  const freeDate = freeMonth ? formatMonthYear(addMonths(today, freeMonth)) : 'Mais de 10 anos';
  const healthyDate = healthyMonth ? formatMonthYear(addMonths(today, healthyMonth)) : (ICR() <= 30 ? 'Já está saudável' : 'Mais de 10 anos');

  document.getElementById('milestone-free').textContent = freeDate;
  document.getElementById('milestone-healthy').textContent = healthyDate;
  document.getElementById('milestone-months').textContent = freeMonth ? `${freeMonth} meses` : '+120 meses';
  document.getElementById('milestone-savings').textContent = fmt(totalInterestPaid);

  renderProjectionChart(balanceLabels, balanceData);
  renderICRChart(balanceLabels, icrData);
}

function renderProjectionChart(labels, data) {
  const ctx = document.getElementById('chart-projection').getContext('2d');
  if (chartProjection) chartProjection.destroy();

  const gradient = ctx.createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0, 'rgba(239,68,68,0.3)');
  gradient.addColorStop(1, 'rgba(239,68,68,0.02)');

  chartProjection = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Total de Dívidas',
        data,
        borderColor: '#EF4444',
        backgroundColor: gradient,
        fill: true,
        tension: 0.4,
        pointRadius: (ctx) => ctx.dataIndex === 0 || ctx.parsed.y === 0 ? 5 : 2,
        pointBackgroundColor: '#EF4444',
        borderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => ` ${fmt(c.parsed.y)}` } },
      },
      scales: {
        x: { ticks: { color: '#94A3B8', maxTicksLimit: 12, font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: {
          ticks: { color: '#94A3B8', callback: v => 'R$' + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v) },
          grid: { color: 'rgba(255,255,255,0.04)' },
          beginAtZero: true,
        }
      }
    }
  });
}

function renderICRChart(labels, data) {
  const ctx = document.getElementById('chart-icr-projection').getContext('2d');
  if (chartICRProjection) chartICRProjection.destroy();

  const gradient = ctx.createLinearGradient(0, 0, 0, 260);
  gradient.addColorStop(0, 'rgba(16,185,129,0.3)');
  gradient.addColorStop(1, 'rgba(16,185,129,0.02)');

  chartICRProjection = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'ICR (%)',
          data,
          borderColor: '#10B981',
          backgroundColor: gradient,
          fill: true,
          tension: 0.4,
          pointRadius: 2,
          borderWidth: 2,
        },
        {
          label: 'Meta Saudável (30%)',
          data: new Array(labels.length).fill(30),
          borderColor: 'rgba(245,158,11,0.5)',
          borderDash: [6, 4],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#94A3B8', font: { size: 11 } } },
        tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${c.parsed.y.toFixed(1)}%` } },
      },
      scales: {
        x: { ticks: { color: '#94A3B8', maxTicksLimit: 12, font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: {
          ticks: { color: '#94A3B8', callback: v => v + '%' },
          grid: { color: 'rgba(255,255,255,0.04)' },
          beginAtZero: true,
        }
      }
    }
  });
}

// ============================================================
// SIDEBAR REFRESH
// ============================================================
function renderSidebar() {
  const icr = ICR();
  const level = getICRLevel(icr);
  document.getElementById('sidebar-icr-val').textContent = fmtPct(icr);
  document.getElementById('sidebar-icr-val').style.color = level.color;
  document.getElementById('sidebar-icr-label').textContent = level.label;
}

// ============================================================
// EXPORT / IMPORT
// ============================================================
function exportData() {
  const data = JSON.stringify(state, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `financas_livre_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Dados exportados com sucesso!');
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if (!imported.income || !imported.expenses || !imported.debts) {
        showToast('Arquivo inválido.', 'error');
        return;
      }
      if (confirm('Importar dados? Isso substituirá os dados atuais.')) {
        state = imported;
        if (!state.settings) state.settings = { strategy: 'avalanche' };
        if (!state.tasks) state.tasks = [];
        saveState();
        renderPage(currentPage);
        renderSidebar();
        showToast('Dados importados com sucesso!');
      }
    } catch (err) {
      showToast('Erro ao importar arquivo.', 'error');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// ============================================================
// SECURITY
// ============================================================
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


// ============================================================
// GOOGLE SHEETS INTEGRATION
// ============================================================
const SHEETS_CLIENT_ID = '598081674902-9m4nodj9j8g45nla7tl0bguqccd87asq.apps.googleusercontent.com';
const SHEETS_SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file';
const SHEET_ID_KEY = 'financas_livre_sheet_id';
const SHEET_TITLE = 'Finaças Livre — Dados';

let gisTokenClient = null;
let gAccessToken = null;
let gSpreadsheetId = localStorage.getItem(SHEET_ID_KEY) || null;
let gSyncTimeout = null;

// Init — called from init()
function initGoogleSheets() {
  // GIS is loaded async via script tag, check when ready
  if (typeof google !== 'undefined' && google.accounts) {
    _setupGIS();
  } else {
    // Wait for GIS script to load
    window.addEventListener('load', () => {
      if (typeof google !== 'undefined' && google.accounts) _setupGIS();
    });
    // Fallback poll
    const poll = setInterval(() => {
      if (typeof google !== 'undefined' && google.accounts) {
        clearInterval(poll);
        _setupGIS();
      }
    }, 500);
    setTimeout(() => clearInterval(poll), 10000);
  }
}

function _setupGIS() {
  try {
    gisTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: SHEETS_CLIENT_ID,
      scope: SHEETS_SCOPES,
      callback: _handleGISResponse,
    });
    updateSyncUI('disconnected');
  } catch (e) {
    console.warn('GIS setup error:', e);
  }
}

function _handleGISResponse(response) {
  if (response.error) {
    console.error('GIS auth error:', response);
    updateSyncUI('error');
    showToast('❌ Erro na autenticação Google: ' + (response.error_description || response.error), 'error');
    return;
  }
  gAccessToken = response.access_token;
  updateSyncUI('syncing');
  showToast('🔗 Google conectado! Carregando dados da planilha...', 'success');
  loadFromSheets();
}

// ---- Auth ----
function googleSignIn() {
  // Check if running from file:// — OAuth won't work
  if (window.location.protocol === 'file:') {
    showToast('⚠️ Use o arquivo iniciar.bat para conectar ao Google!', 'warning');
    return;
  }
  if (!gisTokenClient) {
    showToast('⏳ Aguardando Google... tente em instantes.', 'warning');
    return;
  }
  if (gAccessToken) {
    if (confirm('Desconectar do Google Sheets e parar sincronização?')) googleSignOut();
    return;
  }
  updateSyncUI('connecting');
  try {
    gisTokenClient.requestAccessToken();
  } catch (e) {
    updateSyncUI('error');
    showToast('Erro ao iniciar login Google.', 'error');
  }
}

function googleSignOut() {
  if (gAccessToken && typeof google !== 'undefined') {
    google.accounts.oauth2.revoke(gAccessToken, () => { });
  }
  gAccessToken = null;
  clearTimeout(gSyncTimeout);
  updateSyncUI('disconnected');
  showToast('Desconectado do Google.', 'warning');
}

// ---- Sheets API helper ----
async function _sheetsReq(method, url, body) {
  if (!gAccessToken) throw new Error('Não autenticado');
  const opts = {
    method,
    headers: { 'Authorization': `Bearer ${gAccessToken}`, 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (res.status === 401) {
    // Token expired
    gAccessToken = null;
    updateSyncUI('disconnected');
    showToast('⚠️ Sessão Google expirada. Clique em "Google Sheets" para reconectar.', 'warning');
    throw new Error('Token expirado');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }
  return res.json();
}

// ---- Spreadsheet management ----
async function _getOrCreateSpreadsheet() {
  if (gSpreadsheetId) {
    try {
      await _sheetsReq('GET', `https://sheets.googleapis.com/v4/spreadsheets/${gSpreadsheetId}?fields=spreadsheetId`);
      return gSpreadsheetId;
    } catch (e) {
      if (e.message !== 'Token expirado') {
        gSpreadsheetId = null;
        localStorage.removeItem(SHEET_ID_KEY);
      } else {
        throw e;
      }
    }
  }
  // Create new spreadsheet
  const data = await _sheetsReq('POST', 'https://sheets.googleapis.com/v4/spreadsheets', {
    properties: { title: SHEET_TITLE },
    sheets: [{ properties: { title: 'Dados', index: 0 } }]
  });
  gSpreadsheetId = data.spreadsheetId;
  localStorage.setItem(SHEET_ID_KEY, gSpreadsheetId);
  showToast('📂 Planilha "Finaças Livre" criada no Google Drive!', 'success');
  return gSpreadsheetId;
}

// ---- Sync to Sheets (debounced) ----
function scheduleSyncToSheets() {
  if (!gAccessToken) return;
  clearTimeout(gSyncTimeout);
  updateSyncUI('syncing');
  gSyncTimeout = setTimeout(syncToSheets, 3000);
}

async function syncToSheets() {
  if (!gAccessToken) return;
  try {
    updateSyncUI('syncing');
    const id = await _getOrCreateSpreadsheet();
    const payload = JSON.stringify(state);
    // Write JSON state to Dados!A1, timestamp to A2
    await _sheetsReq('PUT',
      `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/Dados!A1:B2?valueInputOption=RAW`, {
      values: [
        ['financas_livre_state', payload],
        ['ultima_sincronizacao', new Date().toLocaleString('pt-BR')],
      ]
    });
    updateSyncUI('synced');
  } catch (e) {
    if (e.message !== 'Token expirado') {
      console.error('Sync error:', e);
      updateSyncUI('error');
      showToast('❌ Erro ao sincronizar: ' + e.message, 'error');
    }
  }
}

// ---- Load from Sheets ----
async function loadFromSheets() {
  if (!gAccessToken) return;
  try {
    updateSyncUI('syncing');
    const id = await _getOrCreateSpreadsheet();
    const res = await _sheetsReq('GET',
      `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/Dados!A1:B2`);

    if (res.values && res.values[0] && res.values[0][1]) {
      const remoteState = JSON.parse(res.values[0][1]);
      // Merge remote into local
      state = { ...state, ...remoteState };
      if (!state.settings) state.settings = { strategy: 'avalanche' };
      if (!state.tasks) state.tasks = [];
      // Save merged state locally
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      renderPage(currentPage);
      renderSidebar();
      const ts = res.values[1]?.[1] || '';
      showToast(`✅ Dados carregados do Google Sheets!${ts ? ' (' + ts + ')' : ''}`, 'success');
    } else {
      // No data in sheets yet — push local data
      await syncToSheets();
      showToast('✅ Dados locais enviados para o Google Sheets!', 'success');
    }
    updateSyncUI('synced');
  } catch (e) {
    if (e.message !== 'Token expirado') {
      console.error('Load error:', e);
      updateSyncUI('error');
      showToast('❌ Erro ao carregar planilha: ' + e.message, 'error');
    }
  }
}

// ---- Sync UI ----
function updateSyncUI(status) {
  const btn = document.getElementById('btn-google-sync');
  if (!btn) return;
  const configs = {
    disconnected: { text: '🔗 Google Sheets', extra: '', title: 'Conectar ao Google Sheets para salvar na nuvem' },
    connecting: { text: '⏳ Conectando...', extra: ' syncing', title: 'Conectando ao Google...' },
    syncing: { text: '🔄 Sincronizando...', extra: ' syncing', title: 'Sincronizando dados...' },
    synced: { text: '✅ Google Sheets', extra: ' synced', title: 'Dados sincronizados! Clique para desconectar.' },
    error: { text: '⚠️ Erro de sync', extra: ' sync-error', title: 'Erro na sincronização. Clique para tentar novamente.' },
  };
  const cfg = configs[status] || configs.disconnected;
  btn.textContent = cfg.text;
  btn.className = `btn google-sync-btn btn-sm${cfg.extra}`;
  btn.title = cfg.title;
}

// ============================================================
// KEYBOARD SHORTCUTS
// ============================================================
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => closeModal(m.id));
  }
});

// ============================================================
// INIT
// ============================================================
function init() {
  loadState();
  renderSidebar();
  navigate('dashboard');

  // Show file:// protocol warning (Google OAuth won't work)
  if (window.location.protocol === 'file:') {
    const banner = document.getElementById('file-protocol-banner');
    if (banner) banner.classList.remove('hidden');
  }

  // Initialize Google Sheets integration
  initGoogleSheets();

  // Welcome toast for empty state
  if (state.income.length === 0 && state.expenses.length === 0 && state.debts.length === 0) {
    setTimeout(() => {
      showToast('👋 Bem-vindo! Comece adicionando sua renda.', 'info');
    }, 800);
  }
}

init();
