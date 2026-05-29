const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const ADMIN_CODE = "rifa2026";
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

const RIFA = {
  availableNumbers: [931, 933, 934, 936, 939, 940, 941, 942, 943, 944, 945, 946, 947, 948, 949, 980, 981, 982, 983, 984, 986],
  price: 5000,
  drawDate: "18 de junio",
  drawInfo: "Loteria de la Provincia - jugada nocturna"
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".pdf": "application/pdf"
};

function initialDb() {
  const numbers = {};
  RIFA.availableNumbers.forEach(n => {
    numbers[String(n)] = { number: n, status: "available", reservationId: null };
  });
  return { buyers: [], reservations: [], numbers };
}

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify(initialDb(), null, 2));
}

function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function writeDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function send(res, status, body, contentType = "application/json; charset=utf-8") {
  const payload = contentType.includes("application/json") ? JSON.stringify(body) : body;
  res.writeHead(status, { "Content-Type": contentType });
  res.end(payload);
}

function sendPdf(res, filename, buffer) {
  res.writeHead(200, {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${filename}"`
  });
  res.end(buffer);
}

function notFound(res) {
  send(res, 404, { error: "No encontrado" });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Datos demasiado grandes"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("JSON invalido"));
      }
    });
  });
}

function token() {
  return crypto.randomBytes(24).toString("hex");
}

function clean(value) {
  return String(value || "").trim();
}

function publicNumbers(db) {
  return Object.values(db.numbers).map(item => ({ number: item.number, status: item.status }));
}

function buyerFromToken(db, req) {
  const auth = req.headers.authorization || "";
  const value = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return db.buyers.find(buyer => buyer.token === value) || null;
}

function isAdmin(req) {
  return req.headers["x-admin-code"] === ADMIN_CODE;
}

function statusLabel(status) {
  return {
    available: "Disponible",
    reserved: "Reservado",
    sold: "Pagado",
    cancelled: "Cancelado"
  }[status] || status;
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString("es-AR") : "";
}

function enrichReservation(db, reservation) {
  const buyer = db.buyers.find(item => item.id === reservation.buyerId);
  return {
    ...reservation,
    buyer: buyer ? { id: buyer.id, fullName: buyer.fullName, dni: buyer.dni, phone: buyer.phone } : null
  };
}

function buyerReservations(db, buyerId) {
  return db.reservations
    .filter(item => item.buyerId === buyerId)
    .map(item => enrichReservation(db, item))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function validateNumbers(db, requested) {
  if (!Array.isArray(requested) || requested.length === 0) return { error: "Elegi al menos un numero." };
  const unique = [...new Set(requested.map(Number))].sort((a, b) => a - b);
  const invalid = unique.find(n => !Number.isInteger(n) || !RIFA.availableNumbers.includes(n));
  if (invalid) return { error: `El numero ${invalid} no pertenece a esta rifa.` };
  const unavailable = unique.find(n => db.numbers[String(n)].status !== "available");
  if (unavailable) return { error: `El numero ${unavailable} ya no esta disponible.` };
  return { numbers: unique };
}

function escapePdfText(text) {
  return String(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function textLine(text, x, y, size = 11, font = "F1") {
  return `BT /${font} ${size} Tf ${x} ${y} Td (${escapePdfText(text)}) Tj ET`;
}

function buildPdf(pages, options = {}) {
  const width = options.width || 595;
  const height = options.height || 842;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`
  ];
  const font1Object = 3 + pages.length * 2;
  const font2Object = font1Object + 1;

  pages.forEach((content, index) => {
    const pageObject = 3 + index * 2;
    const contentObject = pageObject + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 ${font1Object} 0 R /F2 ${font2Object} 0 R >> >> /Contents ${contentObject} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`);
  });

  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>");

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

function makePdf(reservation, buyer) {
  const lines = [
    "Comprobante de rifa",
    "",
    `Comprador: ${buyer.fullName}`,
    `DNI: ${buyer.dni}`,
    `Telefono: ${buyer.phone}`,
    `Numeros: ${reservation.numbers.join(", ")}`,
    `Cantidad: ${reservation.numbers.length}`,
    `Importe total: $${reservation.total.toLocaleString("es-AR")}`,
    "Estado: Pagado / confirmado",
    `Fecha de reserva: ${formatDate(reservation.createdAt)}`,
    `Fecha de confirmacion: ${formatDate(reservation.confirmedAt)}`,
    `Fecha de sorteo: ${RIFA.drawDate}`,
    `Sorteo: ${RIFA.drawInfo}`
  ];
  const content = lines.map((line, index) => textLine(line, 50, 790 - index * 24, index === 0 ? 20 : 12)).join("\n");
  return buildPdf([content]);
}

function truncate(value, length) {
  const text = String(value || "");
  return text.length <= length ? text : `${text.slice(0, Math.max(0, length - 1))}.`;
}

function reservationForNumber(db, numberItem) {
  if (!numberItem.reservationId) return null;
  return db.reservations.find(item => item.id === numberItem.reservationId) || null;
}

function makeNumbersReportPdf(db) {
  const rows = Object.values(db.numbers).sort((a, b) => a.number - b.number).map(numberItem => {
    const reservation = reservationForNumber(db, numberItem);
    const buyer = reservation ? db.buyers.find(item => item.id === reservation.buyerId) : null;
    return {
      number: numberItem.number,
      status: statusLabel(numberItem.status),
      buyer: buyer ? buyer.fullName : "",
      dni: buyer ? buyer.dni : "",
      phone: buyer ? buyer.phone : "",
      reservationNumbers: reservation ? reservation.numbers.join(",") : "",
      total: reservation ? `$${reservation.total.toLocaleString("es-AR")}` : "",
      createdAt: reservation ? formatDate(reservation.createdAt) : "",
      confirmedAt: reservation ? formatDate(reservation.confirmedAt) : ""
    };
  });

  const header = () => [
    textLine("Listado de numeros de la rifa", 36, 560, 18),
    textLine(`Sorteo: ${RIFA.drawDate} - ${RIFA.drawInfo}`, 36, 538, 10),
    textLine(`Generado: ${formatDate(new Date().toISOString())}`, 36, 522, 10),
    textLine("Nro Estado    Comprador              DNI        Telefono       Reserva     Total      F.Reserva        F.Pago", 36, 496, 8, "F2")
  ];

  const pages = [];
  let pageLines = header();
  let y = 478;
  rows.forEach(row => {
    if (y < 40) {
      pages.push(pageLines.join("\n"));
      pageLines = header();
      y = 478;
    }
    const line = [
      String(row.number).padEnd(3),
      truncate(row.status, 9).padEnd(9),
      truncate(row.buyer, 22).padEnd(22),
      truncate(row.dni, 10).padEnd(10),
      truncate(row.phone, 14).padEnd(14),
      truncate(row.reservationNumbers, 11).padEnd(11),
      truncate(row.total, 10).padEnd(10),
      truncate(row.createdAt, 16).padEnd(16),
      truncate(row.confirmedAt, 16).padEnd(16)
    ].join(" ");
    pageLines.push(textLine(line, 36, y, 8, "F2"));
    y -= 14;
  });
  pages.push(pageLines.join("\n"));
  return buildPdf(pages, { width: 842, height: 595 });
}

async function handleApi(req, res, url) {
  const db = readDb();

  if (req.method === "GET" && url.pathname === "/api/config") return send(res, 200, { rifa: RIFA });
  if (req.method === "GET" && url.pathname === "/api/numbers") return send(res, 200, { numbers: publicNumbers(db) });

  if (req.method === "POST" && url.pathname === "/api/auth/register") {
    const body = await readBody(req);
    const fullName = clean(body.fullName);
    const dni = clean(body.dni).replace(/\D/g, "");
    const phone = clean(body.phone);
    if (!fullName || !dni || !phone) return send(res, 400, { error: "Completa nombre y apellido, DNI y telefono." });
    let buyer = db.buyers.find(item => item.dni === dni);
    if (buyer) {
      buyer.fullName = fullName;
      buyer.phone = phone;
      buyer.token = buyer.token || token();
    } else {
      buyer = { id: crypto.randomUUID(), fullName, dni, phone, token: token(), createdAt: new Date().toISOString() };
      db.buyers.push(buyer);
    }
    writeDb(db);
    return send(res, 200, { buyer: { fullName: buyer.fullName, dni: buyer.dni, phone: buyer.phone }, token: buyer.token });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readBody(req);
    const dni = clean(body.dni).replace(/\D/g, "");
    const phone = clean(body.phone);
    const buyer = db.buyers.find(item => item.dni === dni && item.phone === phone);
    if (!buyer) return send(res, 401, { error: "No encontramos esos datos. Registrate para reservar." });
    buyer.token = buyer.token || token();
    writeDb(db);
    return send(res, 200, { buyer: { fullName: buyer.fullName, dni: buyer.dni, phone: buyer.phone }, token: buyer.token });
  }

  if (req.method === "GET" && url.pathname === "/api/me") {
    const buyer = buyerFromToken(db, req);
    if (!buyer) return send(res, 401, { error: "Sesion requerida" });
    return send(res, 200, {
      buyer: { fullName: buyer.fullName, dni: buyer.dni, phone: buyer.phone },
      reservations: buyerReservations(db, buyer.id)
    });
  }

  if (req.method === "POST" && url.pathname === "/api/reservations") {
    const buyer = buyerFromToken(db, req);
    if (!buyer) return send(res, 401, { error: "Inicia sesion para reservar." });
    const body = await readBody(req);
    const validation = validateNumbers(db, body.numbers);
    if (validation.error) return send(res, 400, { error: validation.error });
    const reservation = {
      id: crypto.randomUUID(),
      buyerId: buyer.id,
      numbers: validation.numbers,
      status: "reserved",
      total: validation.numbers.length * RIFA.price,
      createdAt: new Date().toISOString(),
      confirmedAt: null
    };
    reservation.numbers.forEach(n => {
      db.numbers[String(n)] = { number: n, status: "reserved", reservationId: reservation.id };
    });
    db.reservations.push(reservation);
    writeDb(db);
    return send(res, 201, { reservation: enrichReservation(db, reservation), numbers: publicNumbers(db) });
  }

  if (req.method === "GET" && url.pathname === "/api/admin/reservations") {
    if (!isAdmin(req)) return send(res, 401, { error: "Codigo de administrador incorrecto." });
    const reservations = db.reservations.map(item => enrichReservation(db, item)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return send(res, 200, { reservations, numbers: publicNumbers(db) });
  }

  if (req.method === "GET" && url.pathname === "/api/admin/numbers-report.pdf") {
    if (!isAdmin(req)) return send(res, 401, { error: "Codigo de administrador incorrecto." });
    return sendPdf(res, "listado-numeros-rifa.pdf", makeNumbersReportPdf(db));
  }

  const adminAction = url.pathname.match(/^\/api\/admin\/reservations\/([^/]+)\/(confirm|reserve|cancel|delete)$/);
  if (req.method === "POST" && adminAction) {
    if (!isAdmin(req)) return send(res, 401, { error: "Codigo de administrador incorrecto." });
    const [, id, action] = adminAction;
    const index = db.reservations.findIndex(item => item.id === id);
    if (index === -1) return notFound(res);
    const reservation = db.reservations[index];

    if (action === "confirm") {
      reservation.status = "sold";
      reservation.confirmedAt = new Date().toISOString();
      delete reservation.cancelledAt;
      reservation.numbers.forEach(n => {
        db.numbers[String(n)] = { number: n, status: "sold", reservationId: reservation.id };
      });
    }

    if (action === "reserve") {
      reservation.status = "reserved";
      reservation.confirmedAt = null;
      delete reservation.cancelledAt;
      reservation.numbers.forEach(n => {
        db.numbers[String(n)] = { number: n, status: "reserved", reservationId: reservation.id };
      });
    }

    if (action === "cancel") {
      reservation.status = "cancelled";
      reservation.confirmedAt = null;
      reservation.cancelledAt = new Date().toISOString();
      reservation.numbers.forEach(n => {
        db.numbers[String(n)] = { number: n, status: "available", reservationId: null };
      });
    }

    if (action === "delete") {
      reservation.numbers.forEach(n => {
        const current = db.numbers[String(n)];
        if (current && current.reservationId === reservation.id) {
          db.numbers[String(n)] = { number: n, status: "available", reservationId: null };
        }
      });
      db.reservations.splice(index, 1);
      writeDb(db);
      return send(res, 200, { reservation: null, numbers: publicNumbers(db) });
    }

    writeDb(db);
    return send(res, 200, { reservation: enrichReservation(db, reservation), numbers: publicNumbers(db) });
  }

  const receiptMatch = url.pathname.match(/^\/api\/receipt\/([^/]+)\.pdf$/);
  if (req.method === "GET" && receiptMatch) {
    const reservation = db.reservations.find(item => item.id === receiptMatch[1]);
    if (!reservation) return notFound(res);
    if (reservation.status !== "sold") return send(res, 409, { error: "El comprobante estara disponible cuando el pago este confirmado." });
    const buyer = db.buyers.find(item => item.id === reservation.buyerId);
    const currentBuyer = buyerFromToken(db, req);
    if (!isAdmin(req) && (!currentBuyer || currentBuyer.id !== reservation.buyerId)) return send(res, 401, { error: "No autorizado" });
    return sendPdf(res, `comprobante-rifa-${reservation.numbers.join("-")}.pdf`, makePdf(reservation, buyer));
  }

  return notFound(res);
}

function serveStatic(req, res, url) {
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requested));
  if (!filePath.startsWith(PUBLIC_DIR)) return notFound(res);
  fs.readFile(filePath, (error, content) => {
    if (error) return notFound(res);
    send(res, 200, content, mimeTypes[path.extname(filePath)] || "application/octet-stream");
  });
}

ensureDb();

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith("/api/")) {
    handleApi(req, res, url).catch(error => send(res, 500, { error: error.message || "Error interno" }));
    return;
  }
  serveStatic(req, res, url);
});

server.listen(PORT, () => {
  console.log(`Rifa web lista en http://localhost:${PORT}`);
  console.log(`Codigo admin inicial: ${ADMIN_CODE}`);
});



