// ===== State =====
let transactions = JSON.parse(localStorage.getItem('transactions')) || [];
let spendingLimit = parseFloat(localStorage.getItem('spendingLimit')) || 0;
let theme = localStorage.getItem('theme') || 'light';
let pieChart = null;

// ===== Category Colors =====
const CATEGORY_COLORS = {
  Food:      '#f59e0b',
  Transport: '#3b82f6',
  Fun:       '#ec4899',
  Housing:   '#8b5cf6',
  Health:    '#10b981',
  Shopping:  '#f97316',
  Other:     '#94a3b8',
};

// ===== DOM Refs =====
const balanceEl      = document.getElementById('balance');
const totalIncomeEl  = document.getElementById('total-income');
const totalExpenseEl = document.getElementById('total-expense');
const txList         = document.getElementById('transaction-list');
const form           = document.getElementById('transaction-form');
const sortSelect     = document.getElementById('sort-select');
const themeToggle    = document.getElementById('theme-toggle');
const limitInput     = document.getElementById('spending-limit');
const setLimitBtn    = document.getElementById('set-limit-btn');
const limitWarning   = document.getElementById('limit-warning');
const formError      = document.getElementById('form-error');

// ===== Init =====
applyTheme(theme);
if (spendingLimit) limitInput.value = spendingLimit;
render();

// ===== Event Listeners =====
form.addEventListener('submit', (e) => {
  e.preventDefault();

  const desc     = document.getElementById('desc').value.trim();
  const rawAmt   = document.getElementById('amount').value.trim();
  const category = document.getElementById('category').value;
  const type     = document.getElementById('tx-type').value;

  // Validation
  const errors = [];
  if (!desc)           errors.push('Item name is required.');
  if (!rawAmt)         errors.push('Amount is required.');
  if (!category)       errors.push('Please select a category.');
  const amount = parseFloat(rawAmt);
  if (rawAmt && (isNaN(amount) || amount <= 0)) errors.push('Amount must be a positive number.');

  if (errors.length) {
    showError(errors[0]);
    return;
  }

  hideError();

  transactions.push({
    id:       Date.now(),
    desc,
    amount:   type === 'expense' ? -amount : amount,
    category,
    date:     new Date().toLocaleDateString(),
  });

  save();
  render();
  form.reset();
});

sortSelect.addEventListener('change', renderList);

themeToggle.addEventListener('click', () => {
  theme = theme === 'light' ? 'dark' : 'light';
  applyTheme(theme);
  localStorage.setItem('theme', theme);
  // Rebuild chart so colors update
  renderChart();
});

setLimitBtn.addEventListener('click', () => {
  const val = parseFloat(limitInput.value);
  spendingLimit = isNaN(val) || val < 0 ? 0 : val;
  localStorage.setItem('spendingLimit', spendingLimit);
  checkLimit(getTotalExpense());
});

// ===== Core Functions =====
function save() {
  localStorage.setItem('transactions', JSON.stringify(transactions));
}

function getTotalExpense() {
  return transactions
    .filter(t => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
}

function render() {
  const income  = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expense = getTotalExpense();
  const balance = income - expense;

  balanceEl.textContent      = fmt(balance);
  totalIncomeEl.textContent  = fmt(income);
  totalExpenseEl.textContent = fmt(expense);
  balanceEl.style.color      = balance < 0 ? 'var(--expense-color)' : 'var(--income-color)';

  checkLimit(expense);
  renderList();
  renderChart();
}

function renderList() {
  const sorted = getSorted([...transactions]);

  if (sorted.length === 0) {
    txList.innerHTML = '<li class="empty-state">No transactions yet. Add one above.</li>';
    return;
  }

  txList.innerHTML = sorted.map(t => {
    const isExpense   = t.amount < 0;
    const overLimit   = spendingLimit > 0 && isExpense && Math.abs(t.amount) > spendingLimit;
    const amountClass = isExpense ? 'negative' : 'positive';
    const sign        = isExpense ? '-' : '+';
    const dot         = CATEGORY_COLORS[t.category] || '#94a3b8';

    return `
      <li class="transaction-item${overLimit ? ' over-limit' : ''}">
        <div class="tx-left">
          <span class="tx-desc" title="${escHtml(t.desc)}">${escHtml(t.desc)}</span>
          <span class="tx-meta">
            <span class="cat-dot" style="background:${dot}"></span>
            ${escHtml(t.category)} · ${t.date}${overLimit ? ' ⚠️' : ''}
          </span>
        </div>
        <div class="tx-right">
          <span class="tx-amount ${amountClass}">${sign}${fmt(Math.abs(t.amount))}</span>
          <button class="tx-delete" data-id="${t.id}" aria-label="Delete transaction">✕</button>
        </div>
      </li>`;
  }).join('');

  txList.querySelectorAll('.tx-delete').forEach(btn => {
    btn.addEventListener('click', () => deleteTransaction(Number(btn.dataset.id)));
  });
}

function renderChart() {
  // Aggregate expenses by category only
  const totals = {};
  transactions.forEach(t => {
    if (t.amount < 0) {
      totals[t.category] = (totals[t.category] || 0) + Math.abs(t.amount);
    }
  });

  const labels = Object.keys(totals);
  const values = Object.values(totals);
  const colors = labels.map(l => CATEGORY_COLORS[l] || '#94a3b8');

  if (pieChart) {
    // Update existing chart
    pieChart.data.labels          = labels;
    pieChart.data.datasets[0].data        = values;
    pieChart.data.datasets[0].backgroundColor = colors;
    pieChart.update();
    return;
  }

  // Create chart
  const canvas = document.getElementById('chart');
  pieChart = new Chart(canvas, {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data:            values,
        backgroundColor: colors,
        borderWidth:     2,
        borderColor:     getComputedStyle(document.documentElement)
                           .getPropertyValue('--surface').trim() || '#fff',
      }],
    },
    options: {
      responsive:          true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color:    getComputedStyle(document.documentElement).getPropertyValue('--text').trim(),
            padding:  12,
            font:     { size: 12 },
          },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.label}: $${ctx.parsed.toFixed(2)}`,
          },
        },
      },
    },
  });
}

function deleteTransaction(id) {
  transactions = transactions.filter(t => t.id !== id);
  save();
  render();
}

function checkLimit(expense) {
  limitWarning.classList.toggle('hidden', !(spendingLimit > 0 && expense > spendingLimit));
}

function getSorted(list) {
  const mode = sortSelect.value;
  if (mode === 'amount-asc')  return list.sort((a, b) => a.amount - b.amount);
  if (mode === 'amount-desc') return list.sort((a, b) => b.amount - a.amount);
  if (mode === 'category')    return list.sort((a, b) => a.category.localeCompare(b.category));
  return list.sort((a, b) => b.id - a.id);
}

function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  themeToggle.textContent = t === 'dark' ? '☀️' : '🌙';
}

function fmt(n) {
  return '$' + Math.abs(n).toFixed(2);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showError(msg) {
  formError.textContent = msg;
  formError.classList.remove('hidden');
}

function hideError() {
  formError.classList.add('hidden');
}
