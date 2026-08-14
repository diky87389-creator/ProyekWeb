// === Manajemen Hutang (Kasbon) Pelanggan — Mode Lihat Saja ===
// Warung Sayur Diky - Vanilla JS + localStorage
// Pengguna hanya boleh melihat & menghubungi. Tidak ada aksi mengubah data.

(function () {
  "use strict";

  var STORAGE_KEY = "wsd_hutang_data";
  var debts = loadData();

  // --- Data layer ---
  function loadData() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  // --- Helpers ---
  function formatCurrency(n) {
    return "Rp" + (n || 0).toLocaleString("id-ID");
  }

  function formatDate(d) {
    if (!d) return "-";
    var date = new Date(d);
    if (isNaN(date.getTime())) return d;
    return date.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  }

  function calcTotal(debt) {
    return (debt.items || []).reduce(function (sum, item) {
      return sum + (Number(item.qty) || 0) * (Number(item.price) || 0);
    }, 0);
  }

  function getInitials(name) {
    return (name || "?").trim().split(/\s+/).map(function (w) { return w[0]; }).join("").slice(0, 2).toUpperCase();
  }

  function escapeHtml(s) {
    var d = document.createElement("div");
    d.textContent = s || "";
    return d.innerHTML;
  }

  function showToast(msg) {
    var toast = document.getElementById("toast");
    toast.textContent = msg;
    toast.classList.add("toast-show");
    setTimeout(function () { toast.classList.remove("toast-show"); }, 2200);
  }

  // --- DOM refs ---
  var debtList = document.getElementById("debt-list");
  var searchInput = document.getElementById("search-input");
  var filterStatus = document.getElementById("filter-status");
  var filterMonth = document.getElementById("filter-month");

  // --- Render summary ---
  function renderSummary() {
    var outstanding = debts.filter(function (d) { return d.status === "belum"; }).reduce(function (s, d) { return s + calcTotal(d); }, 0);
    var unpaidCount = debts.filter(function (d) { return d.status === "belum"; }).length;
    var income = debts.filter(function (d) { return d.status === "lunas"; }).reduce(function (s, d) { return s + calcTotal(d); }, 0);
    var totalAll = debts.reduce(function (s, d) { return s + calcTotal(d); }, 0);

    document.getElementById("summary-outstanding").textContent = formatCurrency(outstanding);
    document.getElementById("summary-outstanding-hint").textContent = outstanding > 0 ? unpaidCount + " pelanggan" : "Belum ada tagihan";
    document.getElementById("summary-customers").textContent = unpaidCount;
    document.getElementById("summary-income").textContent = formatCurrency(income);
    document.getElementById("summary-total").textContent = formatCurrency(totalAll);
    document.getElementById("summary-total-hint").textContent = debts.length + " transaksi";
  }

  // --- Filter & render list ---
  function getFilteredDebts() {
    var q = (searchInput.value || "").toLowerCase().trim();
    var status = filterStatus.value;
    var month = filterMonth.value;

    return debts.filter(function (d) {
      if (q && (d.customerName || "").toLowerCase().indexOf(q) === -1) return false;
      if (status !== "all" && d.status !== status) return false;
      if (month !== "all") {
        var d2 = new Date(d.date);
        if (isNaN(d2.getTime()) || String(d2.getMonth() + 1) !== month) return false;
      }
      return true;
    });
  }

  function renderList() {
    renderSummary();
    var filtered = getFilteredDebts();

    if (filtered.length === 0) {
      debtList.innerHTML =
        '<div class="empty-state">' +
        "<h3>Belum ada data hutang</h3>" +
        "<p>" + (debts.length === 0 ? "Belum ada catatan hutang untuk Anda." : "Tidak ada hasil untuk filter ini.") + "</p>" +
        "</div>";
      return;
    }

    debtList.innerHTML = filtered.map(function (d) {
      var total = calcTotal(d);
      var itemsText = (d.items || []).map(function (i) { return i.name + " ×" + i.qty; }).join(", ");
      var payInfoBtn = d.status === "belum"
        ? '<button class="action-btn action-pay" data-action="pay" data-id="' + d.id + '">💳 Cara Bayar</button>'
        : "";
      var waBtn = d.phone
        ? '<button class="action-btn action-wa" data-action="wa" data-id="' + d.id + '">💬 WhatsApp</button>'
        : "";

      return (
        '<article class="debt-card ' + (d.status === "lunas" ? "is-paid" : "") + '" data-id="' + d.id + '">' +
        '<div class="debt-top">' +
        '<div class="debt-customer">' +
        '<div class="debt-avatar">' + getInitials(d.customerName) + "</div>" +
        "<div>" +
        '<p class="debt-name">' + escapeHtml(d.customerName) + "</p>" +
        '<p class="debt-sub">' + formatDate(d.date) + (d.dueDate ? " • Jatuh tempo " + formatDate(d.dueDate) : "") + "</p>" +
        '<p class="debt-sub">' + escapeHtml(itemsText || "-") + "</p>" +
        "</div>" +
        "</div>" +
        '<div class="debt-amount">' +
        "<strong>" + formatCurrency(total) + "</strong>" +
        '<span class="status-badge status-' + d.status + '">' + (d.status === "lunas" ? "Lunas" : "Belum Lunas") + "</span>" +
        "</div>" +
        "</div>" +
        '<div class="debt-actions">' +
        payInfoBtn +
        '<button class="action-btn" data-action="receipt" data-id="' + d.id + '">🧾 Lihat Struk</button>' +
        '<button class="action-btn" data-action="detail" data-id="' + d.id + '">📋 Histori</button>' +
        waBtn +
        "</div>" +
        "</article>"
      );
    }).join("");
  }

  // --- Debt list click handler ---
  debtList.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-action]");
    if (!btn) return;
    var id = btn.getAttribute("data-id");
    var action = btn.getAttribute("data-action");
    var debt = debts.find(function (d) { return d.id === id; });
    if (!debt) return;

    if (action === "pay") openPayInfoModal(debt);
    else if (action === "receipt") openReceiptModal(debt);
    else if (action === "detail") openDetailModal(debt);
    else if (action === "wa") sendWhatsApp(debt);
  });

  // --- Payment info modal (read-only) ---
  var payModal = document.getElementById("pay-modal");
  var payCustomerInfo = document.getElementById("pay-customer-info");
  var payDetail = document.getElementById("pay-detail");
  var currentPayDebt = null;

  function openPayInfoModal(debt) {
    currentPayDebt = debt;
    var total = calcTotal(debt);
    payCustomerInfo.innerHTML =
      '<p style="margin:0 0 0.3rem;font-weight:700">' + escapeHtml(debt.customerName) + "</p>" +
      '<p style="margin:0;color:var(--muted)">Total: <strong style="color:var(--text)">' + formatCurrency(total) + "</strong></p>";
    document.querySelector('input[name="pay-method"][value="QRIS"]').checked = true;
    updatePayDetail();
    payModal.hidden = false;
  }

  function updatePayDetail() {
    var method = document.querySelector('input[name="pay-method"]:checked').value;
    if (method === "QRIS") {
      payDetail.innerHTML =
        '<div class="pay-qr-box">' +
        '<div class="pay-qr-placeholder"></div>' +
        '<p class="pay-qr-hint">Scan QRIS di atas untuk membayar ' + formatCurrency(calcTotal(currentPayDebt)) + "</p>" +
        "</div>";
    } else if (method === "Transfer Bank") {
      payDetail.innerHTML =
        '<div class="pay-bank-info">' +
        "<p><strong>Bank BCA</strong> — 1234567890<br>a.n. Warung Sayur Diky</p>" +
        "<p><strong>Bank Mandiri</strong> — 9876543210<br>a.n. Warung Sayur Diky</p>" +
        "</div>";
    } else {
      payDetail.innerHTML = '<p style="text-align:center;color:var(--muted);margin:0">Pembayaran tunai diterima langsung di kasir.</p>';
    }
  }

  document.querySelectorAll('input[name="pay-method"]').forEach(function (r) {
    r.addEventListener("change", updatePayDetail);
  });

  // --- Receipt modal ---
  var receiptModal = document.getElementById("receipt-modal");
  var receiptContent = document.getElementById("receipt-content");
  var printReceiptBtn = document.getElementById("print-receipt-btn");

  function openReceiptModal(debt) {
    var total = calcTotal(debt);
    var itemsHtml = (debt.items || []).map(function (i) {
      return (
        '<div class="receipt-item">' +
        "<span>" + escapeHtml(i.name) + " ×" + i.qty + "</span>" +
        "<span>" + formatCurrency((i.qty || 0) * (i.price || 0)) + "</span>" +
        "</div>"
      );
    }).join("");

    receiptContent.innerHTML =
      '<div class="receipt">' +
      '<div class="receipt-header">' +
      '<div class="receipt-brand">WS</div>' +
      "<h3>Warung Sayur Diky</h3>" +
      "<p>Sayuran segar, pilihan sehat untuk keluarga.</p>" +
      "</div>" +
      '<div class="receipt-meta">' +
      "<p>No: " + debt.id.slice(0, 8).toUpperCase() + "</p>" +
      "<p>Tanggal: " + formatDate(debt.date) + "</p>" +
      "<p>Pelanggan: " + escapeHtml(debt.customerName) + "</p>" +
      "<p>Pembayaran: " + (debt.paymentMethod || "-") + (debt.paymentDate ? " (" + formatDate(debt.paymentDate) + ")" : "") + "</p>" +
      "</div>" +
      '<div class="receipt-items">' + itemsHtml + "</div>" +
      '<div class="receipt-total">' +
      "<span>TOTAL</span>" +
      "<span>" + formatCurrency(total) + "</span>" +
      "</div>" +
      '<div class="receipt-status status-' + debt.status + '">' +
      (debt.status === "lunas" ? "✓ LUNAS" : "BELUM LUNAS") +
      "</div>" +
      '<div class="receipt-footer">Terima kasih telah berbelanja!</div>' +
      "</div>";
    receiptModal.hidden = false;
  }

  printReceiptBtn.addEventListener("click", function () {
    window.print();
  });

  // --- Detail / history modal ---
  var detailModal = document.getElementById("detail-modal");
  var detailContent = document.getElementById("detail-content");

  function openDetailModal(debt) {
    var customerName = (debt.customerName || "").toLowerCase();
    var customerDebts = debts.filter(function (d) { return (d.customerName || "").toLowerCase() === customerName; });
    var totalAll = customerDebts.reduce(function (s, d) { return s + calcTotal(d); }, 0);
    var paidCount = customerDebts.filter(function (d) { return d.status === "lunas"; }).length;

    var historyHtml = customerDebts.map(function (d) {
      var total = calcTotal(d);
      var itemsText = (d.items || []).map(function (i) { return i.name + " ×" + i.qty; }).join(", ");
      return (
        '<div class="history-item">' +
        '<div class="history-item-top">' +
        '<span class="history-date">' + formatDate(d.date) + "</span>" +
        '<span class="status-badge status-' + d.status + '">' + (d.status === "lunas" ? "Lunas" : "Belum") + "</span>" +
        "</div>" +
        '<p class="history-items">' + escapeHtml(itemsText) + "</p>" +
        '<p class="history-amount">' + formatCurrency(total) + "</p>" +
        "</div>"
      );
    }).join("");

    detailContent.innerHTML =
      '<div class="detail-header">' +
      '<div class="debt-avatar">' + getInitials(debt.customerName) + "</div>" +
      "<div>" +
      '<h3 style="margin:0">' + escapeHtml(debt.customerName) + "</h3>" +
      '<p style="margin:0;color:var(--muted)">' + (debt.phone ? escapeHtml(debt.phone) : "No. telp tidak tersedia") + "</p>" +
      "</div>" +
      "</div>" +
      '<div class="detail-stats">' +
      '<div class="detail-stat"><span class="detail-stat-value">' + customerDebts.length + '</span><span class="detail-stat-label">Transaksi</span></div>' +
      '<div class="detail-stat"><span class="detail-stat-value">' + paidCount + '</span><span class="detail-stat-label">Lunas</span></div>' +
      '<div class="detail-stat"><span class="detail-stat-value">' + formatCurrency(totalAll) + '</span><span class="detail-stat-label">Total Nilai</span></div>' +
      "</div>" +
      '<div class="history-list">' + historyHtml + "</div>";
    detailModal.hidden = false;
  }

  // --- WhatsApp ---
  function sendWhatsApp(debt) {
    var total = calcTotal(debt);
    var itemsText = (debt.items || []).map(function (i) {
      return "• " + i.name + " ×" + i.qty + " = " + formatCurrency((i.qty || 0) * (i.price || 0));
    }).join("\n");
    var msg =
      "Halo Admin Warung Sayur Diky,\n\n" +
      "Saya ingin menanyakan/mengonfirmasi tagihan atas nama " + debt.customerName + ":\n\n" +
      itemsText + "\n\n" +
      "Total: *" + formatCurrency(total) + "*\n\n" +
      "Jatuh tempo: " + formatDate(debt.dueDate) + "\n\n" +
      "Terima kasih 🙏";
    var phone = (debt.phone || "").replace(/[^0-9]/g, "");
    var waPhone = phone;
    if (phone.indexOf("0") === 0) waPhone = "62" + phone.slice(1);
    else if (phone.indexOf("62") !== 0 && phone.length > 5) waPhone = "62" + phone;
    var url = "https://wa.me/" + waPhone + "?text=" + encodeURIComponent(msg);
    window.open(url, "_blank");
    showToast("Membuka WhatsApp...");
  }

  // --- Modal close handlers ---
  document.querySelectorAll("[data-close]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.getElementById(btn.getAttribute("data-close")).hidden = true;
    });
  });

  document.querySelectorAll(".modal-overlay").forEach(function (overlay) {
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) overlay.hidden = true;
    });
  });

  // --- Search & filter ---
  searchInput.addEventListener("input", renderList);
  filterStatus.addEventListener("change", renderList);
  filterMonth.addEventListener("change", renderList);

  // --- Init ---
  renderList();
})();