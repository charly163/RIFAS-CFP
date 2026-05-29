const state = {
  config: null,
  numbers: [],
  selected: new Set(),
  buyerToken: localStorage.getItem("buyerToken") || "",
  adminCode: localStorage.getItem("adminCode") || "",
  myReservations: [],
  adminReservations: []
};

const els = {
  price: document.querySelector("#price"),
  availableCount: document.querySelector("#availableCount"),
  grid: document.querySelector("#numberGrid"),
  buyerTab: document.querySelector("#buyerTab"),
  adminTab: document.querySelector("#adminTab"),
  buyerPanel: document.querySelector("#buyerPanel"),
  adminPanel: document.querySelector("#adminPanel"),
  buyerForm: document.querySelector("#buyerForm"),
  fullName: document.querySelector("#fullName"),
  dni: document.querySelector("#dni"),
  phone: document.querySelector("#phone"),
  buyerStatus: document.querySelector("#buyerStatus"),
  selectedNumbers: document.querySelector("#selectedNumbers"),
  selectedTotal: document.querySelector("#selectedTotal"),
  reserveButton: document.querySelector("#reserveButton"),
  myReservations: document.querySelector("#myReservations"),
  adminForm: document.querySelector("#adminForm"),
  adminCode: document.querySelector("#adminCode"),
  adminStatus: document.querySelector("#adminStatus"),
  adminTools: document.querySelector("#adminTools"),
  adminReportButton: document.querySelector("#adminReportButton"),
  adminReservations: document.querySelector("#adminReservations")
};

function money(value) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value);
}

function statusText(status) {
  return {
    available: "Disponible",
    reserved: "Reservado",
    sold: "Pagado",
    cancelled: "Cancelado"
  }[status] || status;
}

function reservationStatusText(status) {
  return {
    reserved: "Reservado",
    sold: "Pagado",
    cancelled: "Cancelado"
  }[status] || status;
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers["Content-Type"] = "application/json";
  const response = await fetch(path, { ...options, headers });
  const type = response.headers.get("content-type") || "";
  const data = type.includes("application/json") ? await response.json() : await response.blob();
  if (!response.ok) throw new Error(data.error || "Ocurrió un error");
  return data;
}

function buyerHeaders() {
  return { Authorization: `Bearer ${state.buyerToken}` };
}

function adminHeaders() {
  return { "X-Admin-Code": state.adminCode };
}

function setNotice(element, message, kind = "muted") {
  element.className = `notice ${kind}`;
  element.textContent = message;
}

function updateStats() {
  const available = state.numbers.filter(item => item.status === "available").length;
  els.availableCount.textContent = String(available);
}

function renderNumbers() {
  els.grid.innerHTML = "";
  updateStats();
  state.numbers.forEach(item => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `number-card ${item.status}${state.selected.has(item.number) ? " selected" : ""}`;
    button.disabled = item.status !== "available";
    button.innerHTML = `<strong>${item.number}</strong><small>${statusText(item.status)}</small>`;
    button.addEventListener("click", () => {
      if (state.selected.has(item.number)) state.selected.delete(item.number);
      else state.selected.add(item.number);
      renderNumbers();
      renderSelection();
    });
    els.grid.appendChild(button);
  });
}

function renderSelection() {
  const selected = [...state.selected].sort((a, b) => a - b);
  els.selectedNumbers.textContent = selected.length === 0 ? "Sin números seleccionados." : selected.join(", ");
  els.selectedTotal.textContent = money(selected.length * state.config.rifa.price);
  els.reserveButton.disabled = selected.length === 0 || !state.buyerToken;
}

function downloadBlob(path, headers, filename) {
  fetch(path, { headers })
    .then(async response => {
      if (!response.ok) {
        const type = response.headers.get("content-type") || "";
        if (type.includes("application/json")) {
          const data = await response.json();
          throw new Error(data.error || "No se pudo descargar el archivo.");
        }
        throw new Error("No se pudo descargar el archivo.");
      }
      return response.blob();
    })
    .then(blob => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    })
    .catch(error => alert(error.message));
}

function downloadReceipt(id, admin = false) {
  downloadBlob(`/api/receipt/${id}.pdf`, admin ? adminHeaders() : buyerHeaders(), `comprobante-rifa-${id.slice(0, 8)}.pdf`);
}

function downloadAdminReport() {
  downloadBlob("/api/admin/numbers-report.pdf", adminHeaders(), "listado-numeros-rifa.pdf");
}

function reservationCard(item, mode) {
  const article = document.createElement("article");
  article.className = "reservation";
  const buyer = item.buyer ? `${item.buyer.fullName} · DNI ${item.buyer.dni} · ${item.buyer.phone}` : "";
  const confirmed = item.confirmedAt ? `<p>Pago: ${new Date(item.confirmedAt).toLocaleString("es-AR")}</p>` : "";
  article.innerHTML = `
    <header>
      <div>
        <strong>Números ${item.numbers.join(", ")}</strong>
        <p>${buyer || "Reserva propia"}</p>
      </div>
      <span class="badge ${item.status}">${reservationStatusText(item.status)}</span>
    </header>
    <p>Total: ${money(item.total)}</p>
    <p>Reserva: ${new Date(item.createdAt).toLocaleString("es-AR")}</p>
    ${confirmed}
  `;
  const actions = document.createElement("div");
  actions.className = "actions";

  if (item.status === "sold") {
    const pdfButton = document.createElement("button");
    pdfButton.type = "button";
    pdfButton.className = "secondary";
    pdfButton.textContent = "Descargar PDF";
    pdfButton.addEventListener("click", () => downloadReceipt(item.id, mode === "admin"));
    actions.appendChild(pdfButton);
  } else if (item.status === "reserved") {
    const pending = document.createElement("span");
    pending.className = "pending-note";
    pending.textContent = "PDF disponible al confirmar el pago.";
    actions.appendChild(pending);
  }

  if (mode === "admin") {
    if (item.status === "reserved") {
      const confirm = document.createElement("button");
      confirm.type = "button";
      confirm.className = "primary";
      confirm.textContent = "Confirmar pago";
      confirm.addEventListener("click", () => adminAction(item.id, "confirm"));
      actions.appendChild(confirm);
    }

    if (item.status === "sold") {
      const reserve = document.createElement("button");
      reserve.type = "button";
      reserve.className = "secondary";
      reserve.textContent = "Volver a reservado";
      reserve.addEventListener("click", () => adminAction(item.id, "reserve"));
      actions.appendChild(reserve);
    }

    if (item.status !== "cancelled") {
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "danger";
      cancel.textContent = "Liberar números";
      cancel.addEventListener("click", () => adminAction(item.id, "cancel"));
      actions.appendChild(cancel);
    }

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger subtle-danger";
    remove.textContent = "Borrar reserva";
    remove.addEventListener("click", () => {
      if (confirm("¿Borrar esta reserva del historial y liberar sus números?")) adminAction(item.id, "delete");
    });
    actions.appendChild(remove);
  }

  article.appendChild(actions);
  return article;
}

function renderMyReservations() {
  els.myReservations.innerHTML = "";
  if (state.myReservations.length === 0) {
    els.myReservations.innerHTML = `<p class="notice muted">Todavía no tenés reservas.</p>`;
    return;
  }
  state.myReservations.forEach(item => els.myReservations.appendChild(reservationCard(item, "buyer")));
}

function renderAdminReservations() {
  els.adminReservations.innerHTML = "";
  if (state.adminReservations.length === 0) {
    els.adminReservations.innerHTML = `<p class="notice muted">No hay reservas cargadas.</p>`;
    return;
  }
  state.adminReservations.forEach(item => els.adminReservations.appendChild(reservationCard(item, "admin")));
}

async function loadNumbers() {
  const data = await api("/api/numbers");
  state.numbers = data.numbers;
  renderNumbers();
  renderSelection();
}

async function loadMe() {
  if (!state.buyerToken) return;
  try {
    const data = await api("/api/me", { headers: buyerHeaders() });
    els.fullName.value = data.buyer.fullName;
    els.dni.value = data.buyer.dni;
    els.phone.value = data.buyer.phone;
    state.myReservations = data.reservations;
    setNotice(els.buyerStatus, `Sesión iniciada como ${data.buyer.fullName}.`, "good");
    renderMyReservations();
  } catch {
    state.buyerToken = "";
    localStorage.removeItem("buyerToken");
  }
}

async function loadAdmin() {
  if (!state.adminCode) return;
  try {
    const data = await api("/api/admin/reservations", { headers: adminHeaders() });
    state.adminReservations = data.reservations;
    state.numbers = data.numbers;
    els.adminTools.classList.remove("hidden");
    setNotice(els.adminStatus, "Panel de administración activo.", "good");
    renderNumbers();
    renderAdminReservations();
  } catch (error) {
    els.adminTools.classList.add("hidden");
    setNotice(els.adminStatus, error.message, "bad");
  }
}

async function adminAction(id, action) {
  try {
    const data = await api(`/api/admin/reservations/${id}/${action}`, { method: "POST", headers: adminHeaders() });
    state.numbers = data.numbers;
    renderNumbers();
    await loadAdmin();
  } catch (error) {
    alert(error.message);
  }
}

function switchTab(tab) {
  const admin = tab === "admin";
  els.buyerPanel.classList.toggle("hidden", admin);
  els.adminPanel.classList.toggle("hidden", !admin);
  els.buyerTab.classList.toggle("active", !admin);
  els.adminTab.classList.toggle("active", admin);
  if (admin) loadAdmin();
}

els.buyerTab.addEventListener("click", () => switchTab("buyer"));
els.adminTab.addEventListener("click", () => switchTab("admin"));
els.adminReportButton.addEventListener("click", downloadAdminReport);

els.buyerForm.addEventListener("submit", async event => {
  event.preventDefault();
  try {
    const data = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ fullName: els.fullName.value, dni: els.dni.value, phone: els.phone.value })
    });
    state.buyerToken = data.token;
    localStorage.setItem("buyerToken", data.token);
    setNotice(els.buyerStatus, `Listo, ${data.buyer.fullName}. Ya podés reservar.`, "good");
    renderSelection();
    await loadMe();
  } catch (error) {
    setNotice(els.buyerStatus, error.message, "bad");
  }
});

els.reserveButton.addEventListener("click", async () => {
  try {
    const selected = [...state.selected];
    const data = await api("/api/reservations", {
      method: "POST",
      headers: buyerHeaders(),
      body: JSON.stringify({ numbers: selected })
    });
    state.selected.clear();
    state.numbers = data.numbers;
    setNotice(els.buyerStatus, "Reserva creada. El comprobante PDF estará disponible cuando se confirme el pago.", "good");
    renderNumbers();
    renderSelection();
    await loadMe();
  } catch (error) {
    setNotice(els.buyerStatus, error.message, "bad");
    await loadNumbers();
  }
});

els.adminForm.addEventListener("submit", async event => {
  event.preventDefault();
  state.adminCode = els.adminCode.value;
  localStorage.setItem("adminCode", state.adminCode);
  await loadAdmin();
});

async function init() {
  state.config = await api("/api/config");
  els.price.textContent = money(state.config.rifa.price);
  els.adminCode.value = state.adminCode;
  await loadNumbers();
  await loadMe();
  renderMyReservations();
}

init().catch(error => {
  document.body.innerHTML = `<main class="layout"><p class="notice bad">${error.message}</p></main>`;
});

