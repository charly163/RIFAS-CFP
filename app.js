const CONFIG = {
  rifa: {
    availableNumbers: [931, 933, 934, 936, 939, 940, 941, 942, 943, 944, 945, 946, 947, 948, 949, 980, 981, 982, 983, 984, 986],
    price: 5000,
    drawDate: "18 de junio",
    drawInfo: "Loteria de la Provincia - jugada nocturna"
  }
};

const SUPABASE_URL = "https://edlubmjtzxowwvbmbjok.supabase.co";
const SUPABASE_KEY = "sb_publishable_LifpUgGDra4o-oirfkNeWA_ObbeGDKc";

// Inicialización segura del cliente de Supabase
let supabaseClient = null;

function initSupabase() {
  try {
    console.log("Intentando inicializar Supabase...");
    console.log("window.supabase disponible:", !!window.supabase);
    console.log("window.supabase.createClient disponible:", !!(window.supabase && typeof window.supabase.createClient === 'function'));

    if (window.supabase && typeof window.supabase.createClient === 'function') {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      console.log("Supabase inicializado correctamente:", !!supabaseClient);
    } else {
      console.error("El objeto 'supabase' de CDN no está disponible todavía en el ámbito global.");
    }
  } catch (err) {
    console.error("Fallo crítico al instanciar el cliente de Supabase:", err);
  }
}

const state = {
  config: CONFIG,
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
  adminNumbersForm: document.querySelector("#adminNumbersForm"),
  adminNumbersInput: document.querySelector("#adminNumbersInput"),
  adminReportButton: document.querySelector("#adminReportButton"),
  adminReservations: document.querySelector("#adminReservations")
};

console.log("Elementos DOM:", els);
console.log("buyerTab:", els.buyerTab);
console.log("adminTab:", els.adminTab);
console.log("grid:", els.grid);

function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function truncate(value, length) {
  const text = String(value || "");
  return text.length <= length ? text : `${text.slice(0, Math.max(0, length - 1))}.`;
}

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

function mapReservation(res) {
  const buyer = res.buyers ? {
    id: res.buyers.id,
    fullName: res.buyers.full_name,
    dni: res.buyers.dni,
    phone: res.buyers.phone
  } : null;

  return {
    id: res.id,
    buyerId: res.buyer_id,
    buyer: buyer,
    numbers: res.numbers,
    status: res.status,
    total: Number(res.total),
    createdAt: res.created_at,
    confirmedAt: res.confirmed_at,
    cancelledAt: res.cancelled_at
  };
}

function makeReceiptPdf(reservation, buyer) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'pt', 'a4');
  
  const lines = [
    { text: "Comprobante de rifa", size: 20, fontStyle: "bold" },
    { text: "", size: 12 },
    { text: `Comprador: ${buyer.fullName}`, size: 12 },
    { text: `DNI: ${buyer.dni}`, size: 12 },
    { text: `Teléfono: ${buyer.phone}`, size: 12 },
    { text: `Números: ${reservation.numbers.join(", ")}`, size: 12 },
    { text: `Cantidad: ${reservation.numbers.length}`, size: 12 },
    { text: `Importe total: $${reservation.total.toLocaleString("es-AR")}`, size: 12 },
    { text: "Estado: Pagado / confirmado", size: 12, fontStyle: "bold" },
    { text: `Fecha de reserva: ${new Date(reservation.createdAt).toLocaleString("es-AR")}`, size: 12 },
    { text: `Fecha de confirmación: ${new Date(reservation.confirmedAt).toLocaleString("es-AR")}`, size: 12 },
    { text: `Fecha de sorteo: ${CONFIG.rifa.drawDate}`, size: 12 },
    { text: `Sorteo: ${CONFIG.rifa.drawInfo}`, size: 12 }
  ];
  
  let y = 50;
  lines.forEach(line => {
    doc.setFont("Helvetica", line.fontStyle || "normal");
    doc.setFontSize(line.size);
    doc.text(line.text, 50, y);
    y += line.text === "" ? 12 : 24;
  });
  
  doc.save(`comprobante-rifa-${reservation.numbers.join("-")}.pdf`);
}

function makeNumbersReportPdf(reservations) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('l', 'pt', 'a4'); // horizontal: 842 pt x 595 pt
  
  const numbersState = {};
  CONFIG.rifa.availableNumbers.forEach(n => {
    numbersState[String(n)] = { number: n, status: "Disponible", buyer: null, reservation: null };
  });
  
  reservations.forEach(res => {
    if (res.status !== 'cancelled') {
      res.numbers.forEach(n => {
        numbersState[String(n)] = {
          number: n,
          status: res.status === 'sold' ? 'Pagado' : 'Reservado',
          buyer: res.buyer,
          reservation: res
        };
      });
    }
  });
  
  const sortedNumbers = Object.values(numbersState).sort((a, b) => a.number - b.number);
  
  const printHeader = () => {
    doc.setFont("Courier", "bold");
    doc.setFontSize(18);
    doc.text("Listado de números de la rifa", 36, 40);
    doc.setFontSize(10);
    doc.setFont("Courier", "normal");
    doc.text(`Sorteo: ${CONFIG.rifa.drawDate} - ${CONFIG.rifa.drawInfo}`, 36, 60);
    doc.text(`Generado: ${new Date().toLocaleString("es-AR")}`, 36, 75);
    
    doc.setFont("Courier", "bold");
    doc.setFontSize(8);
    const tableHeader = "Nro Estado    Comprador              DNI        Telefono       Reserva     Total      F.Reserva        F.Pago";
    doc.text(tableHeader, 36, 100);
    doc.line(36, 105, 806, 105);
  };
  
  printHeader();
  
  let y = 120;
  sortedNumbers.forEach(row => {
    if (y > 550) {
      doc.addPage();
      printHeader();
      y = 120;
    }
    
    const numStr = String(row.number).padEnd(3);
    const statusStr = row.status.padEnd(9);
    const buyerName = truncate(row.buyer ? row.buyer.fullName : "", 22).padEnd(22);
    const buyerDni = truncate(row.buyer ? row.buyer.dni : "", 10).padEnd(10);
    const buyerPhone = truncate(row.buyer ? row.buyer.phone : "", 14).padEnd(14);
    const resNumbers = truncate(row.reservation ? row.reservation.numbers.join(",") : "", 11).padEnd(11);
    const totalVal = truncate(row.reservation ? `$${row.reservation.total.toLocaleString("es-AR")}` : "", 10).padEnd(10);
    const fReserva = truncate(row.reservation ? new Date(row.reservation.createdAt).toLocaleDateString("es-AR") : "", 16).padEnd(16);
    const fPago = truncate(row.reservation && row.reservation.confirmedAt ? new Date(row.reservation.confirmedAt).toLocaleDateString("es-AR") : "", 16).padEnd(16);
    
    const line = [numStr, statusStr, buyerName, buyerDni, buyerPhone, resNumbers, totalVal, fReserva, fPago].join(" ");
    
    doc.setFont("Courier", "normal");
    doc.setFontSize(8);
    doc.text(line, 36, y);
    y += 14;
  });
  
  doc.save("listado-numeros-rifa.pdf");
}

function downloadReceipt(id, admin = false) {
  const list = admin ? state.adminReservations : state.myReservations;
  const reservation = list.find(item => item.id === id);
  if (!reservation || !reservation.buyer) {
    alert("No se pudo cargar la información de la reserva.");
    return;
  }
  makeReceiptPdf(reservation, reservation.buyer);
}

function downloadAdminReport() {
  if (state.adminReservations.length === 0) {
    alert("No hay reservas cargadas para reportar.");
    return;
  }
  makeNumbersReportPdf(state.adminReservations);
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
      const confirmBtn = document.createElement("button");
      confirmBtn.type = "button";
      confirmBtn.className = "primary";
      confirmBtn.textContent = "Confirmar pago";
      confirmBtn.addEventListener("click", () => adminAction(item.id, "confirm"));
      actions.appendChild(confirmBtn);
    }

    if (item.status === "sold") {
      const reserveBtn = document.createElement("button");
      reserveBtn.type = "button";
      reserveBtn.className = "secondary";
      reserveBtn.textContent = "Volver a reservado";
      reserveBtn.addEventListener("click", () => adminAction(item.id, "reserve"));
      actions.appendChild(reserveBtn);
    }

    if (item.status !== "cancelled") {
      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "danger";
      cancelBtn.textContent = "Liberar números";
      cancelBtn.addEventListener("click", () => adminAction(item.id, "cancel"));
      actions.appendChild(cancelBtn);
    }

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "danger subtle-danger";
    removeBtn.textContent = "Borrar reserva";
    removeBtn.addEventListener("click", () => {
      if (confirm("¿Borrar esta reserva del historial y liberar sus números?")) adminAction(item.id, "delete");
    });
    actions.appendChild(removeBtn);
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
  if (!supabaseClient) return;
  try {
    const { data: numbersData, error: nError } = await supabaseClient
      .from('raffle_numbers')
      .select('number');

    let availableNums = CONFIG.rifa.availableNumbers;
    if (!nError && numbersData && numbersData.length > 0) {
      availableNums = numbersData.map(n => n.number);
      CONFIG.rifa.availableNumbers = availableNums;
    }

    const { data, error } = await supabaseClient
      .from('reservations')
      .select('numbers, status')
      .neq('status', 'cancelled');

    if (error) throw error;

    const occupied = {};
    if (data) {
      data.forEach(res => {
        res.numbers.forEach(num => {
          occupied[String(num)] = res.status;
        });
      });
    }

    state.numbers = CONFIG.rifa.availableNumbers.map(n => ({
      number: n,
      status: occupied[String(n)] || "available"
    }));

    renderNumbers();
    renderSelection();
  } catch (error) {
    console.error("Error al cargar números:", error);
    setNotice(els.buyerStatus, "Error de base de datos. Asegúrate de haber ejecutado el script SQL en el panel de Supabase.", "bad");
  }
}

async function loadMe() {
  if (!state.buyerToken || !supabaseClient) return;
  try {
    const { data: buyer, error } = await supabaseClient
      .from('buyers')
      .select('*')
      .eq('token', state.buyerToken)
      .maybeSingle();

    if (error) throw error;
    if (!buyer) {
      state.buyerToken = "";
      localStorage.removeItem("buyerToken");
      setNotice(els.buyerStatus, "Ingresá tus datos para reservar.", "muted");
      return;
    }

    els.fullName.value = buyer.full_name;
    els.dni.value = buyer.dni;
    els.phone.value = buyer.phone;

    const { data: resData, error: rError } = await supabaseClient
      .from('reservations')
      .select('*, buyers(*)')
      .eq('buyer_id', buyer.id)
      .order('created_at', { ascending: false });

    if (rError) throw rError;

    state.myReservations = (resData || []).map(mapReservation);
    setNotice(els.buyerStatus, `Sesión iniciada como ${buyer.full_name}.`, "good");
    renderMyReservations();
  } catch (error) {
    console.error("Error en sesión del comprador:", error);
    state.buyerToken = "";
    localStorage.removeItem("buyerToken");
  }
}

async function loadAdmin() {
  if (!state.adminCode || !supabaseClient) return;
  try {
    const { data: resData, error } = await supabaseClient
      .from('reservations')
      .select('*, buyers(*)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    state.adminReservations = (resData || []).map(mapReservation);

    const occupied = {};
    state.adminReservations.forEach(res => {
      if (res.status !== 'cancelled') {
        res.numbers.forEach(num => {
          occupied[String(num)] = res.status;
        });
      }
    });

    state.numbers = CONFIG.rifa.availableNumbers.map(n => ({
      number: n,
      status: occupied[String(n)] || "available"
    }));

    els.adminTools.classList.remove("hidden");
    setNotice(els.adminStatus, "Panel de administración activo.", "good");
    renderNumbers();
    renderAdminReservations();
  } catch (error) {
    els.adminTools.classList.add("hidden");
    setNotice(els.adminStatus, "Acceso de administración inactivo. Verifica tus políticas RLS en Supabase o el código ingresado.", "bad");
  }
}

async function adminAction(id, action) {
  if (!supabaseClient) return;
  try {
    const rpcName = {
      confirm: 'admin_confirm_payment',
      reserve: 'admin_revert_payment',
      cancel: 'admin_cancel_reservation',
      delete: 'admin_delete_reservation'
    }[action];

    if (!rpcName) throw new Error("Acción administrativa no válida.");

    const { data, error } = await supabaseClient.rpc(rpcName, {
      p_reservation_id: id,
      p_admin_code: state.adminCode
    });

    if (error) throw error;

    await loadNumbers();
    await loadAdmin();
  } catch (error) {
    alert(error.message || "Error al realizar acción administrativa.");
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

els.buyerForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!supabaseClient) {
    alert("La base de datos de Supabase no está lista. Revisa la conectividad en la consola.");
    return;
  }
  try {
    const dniClean = els.dni.value.trim().replace(/\D/g, "");
    const fullNameClean = els.fullName.value.trim();
    const phoneClean = els.phone.value.trim();

    if (!fullNameClean || !dniClean || !phoneClean) {
      throw new Error("Completa nombre y apellido, DNI y teléfono.");
    }

    const { data: existing, error: sError } = await supabaseClient
      .from('buyers')
      .select('*')
      .eq('dni', dniClean)
      .maybeSingle();

    if (sError) throw sError;

    let token = "";
    if (existing) {
      const { data: updated, error: uError } = await supabaseClient
        .from('buyers')
        .update({ full_name: fullNameClean, phone: phoneClean })
        .eq('id', existing.id)
        .select()
        .single();

      if (uError) throw uError;
      token = updated.token;
    } else {
      const newToken = generateUUID();
      const { data: inserted, error: iError } = await supabaseClient
        .from('buyers')
        .insert([{
          full_name: fullNameClean,
          dni: dniClean,
          phone: phoneClean,
          token: newToken
        }])
        .select()
        .single();

      if (iError) throw iError;
      token = inserted.token;
    }

    state.buyerToken = token;
    localStorage.setItem("buyerToken", token);
    await loadMe();
    renderSelection();
  } catch (error) {
    setNotice(els.buyerStatus, error.message, "bad");
  }
});

els.reserveButton.addEventListener("click", async () => {
  if (!supabaseClient) {
    alert("La base de datos de Supabase no está lista.");
    return;
  }
  try {
    const selected = [...state.selected];
    if (selected.length === 0) throw new Error("Elegí al menos un número.");

    const { data: buyer, error: bError } = await supabaseClient
      .from('buyers')
      .select('id')
      .eq('token', state.buyerToken)
      .single();

    if (bError || !buyer) throw new Error("Inicia sesión para reservar.");

    const { data: activeReservations, error: rError } = await supabaseClient
      .from('reservations')
      .select('numbers')
      .neq('status', 'cancelled');

    if (rError) throw rError;

    const occupied = new Set();
    if (activeReservations) {
      activeReservations.forEach(res => {
        res.numbers.forEach(num => occupied.add(num));
      });
    }

    const collision = selected.find(num => occupied.has(num));
    if (collision) {
      throw new Error(`El número ${collision} ya fue reservado recientemente por otra persona.`);
    }

    const { error: insError } = await supabaseClient
      .from('reservations')
      .insert([{
        buyer_id: buyer.id,
        numbers: selected,
        status: 'reserved',
        total: selected.length * CONFIG.rifa.price
      }]);

    if (insError) throw insError;

    state.selected.clear();
    setNotice(els.buyerStatus, "Reserva creada. El comprobante PDF estará disponible cuando se confirme el pago.", "good");
    await loadNumbers();
    await loadMe();
  } catch (error) {
    setNotice(els.buyerStatus, error.message, "bad");
  }
});

els.adminForm.addEventListener("submit", async event => {
  event.preventDefault();
  state.adminCode = els.adminCode.value.trim();
  localStorage.setItem("adminCode", state.adminCode);
  await loadAdmin();
});

els.buyerTab.addEventListener("click", () => switchTab("buyer"));
els.adminTab.addEventListener("click", () => switchTab("admin"));
els.adminReportButton.addEventListener("click", downloadAdminReport);

function parseNumberRanges(input) {
  const parts = input.split(',');
  const result = new Set();
  for (const part of parts) {
    const range = part.trim();
    if (!range) continue;
    if (range.includes('-')) {
      const [startStr, endStr] = range.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (!isNaN(start) && !isNaN(end)) {
        const min = Math.min(start, end);
        const max = Math.max(start, end);
        for (let i = min; i <= max; i++) {
          result.add(i);
        }
      }
    } else {
      const num = parseInt(range, 10);
      if (!isNaN(num)) result.add(num);
    }
  }
  return Array.from(result).sort((a, b) => a - b);
}

if (els.adminNumbersForm) {
  els.adminNumbersForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (!supabaseClient) return;
    try {
      const input = els.adminNumbersInput.value;
      const numbersArray = parseNumberRanges(input);
      if (numbersArray.length === 0) throw new Error("No se detectaron números válidos.");
      
      const { error } = await supabaseClient.rpc('admin_add_numbers', {
        p_numbers: numbersArray,
        p_admin_code: state.adminCode
      });
      
      if (error) throw error;
      
      els.adminNumbersInput.value = "";
      alert(`Se agregaron ${numbersArray.length} números con éxito.`);
      await loadNumbers();
      await loadAdmin();
    } catch (error) {
      alert("Error al agregar números: " + (error.message || "Error desconocido."));
    }
  });
}

async function init() {
  console.log("Iniciando aplicación...");
  els.price.textContent = money(state.config.rifa.price);
  els.adminCode.value = state.adminCode;

  initSupabase();

  if (!supabaseClient) {
    setNotice(els.buyerStatus, "Error: No se pudo conectar a la base de datos de Supabase. Asegúrate de ingresar las credenciales correctas en app.js y estar conectado a internet.", "bad");
    // Inicializar los números como disponibles en el DOM de forma local de respaldo
    state.numbers = CONFIG.rifa.availableNumbers.map(n => ({ number: n, status: "available" }));
    renderNumbers();
    renderSelection();
    return;
  }

  await loadNumbers();
  await loadMe();
  renderMyReservations();
}

document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM cargado");
  init().catch(error => {
    console.error("Error al iniciar:", error);
    document.body.innerHTML = `<main class="layout"><p class="notice bad">${error.message}</p></main>`;
  });
});
