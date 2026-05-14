console.log("🔥 SCRIPT NUEVO CARGADO 🔥");
/* ═══════════════════════════════════════════════════
   BREWERY ORANGE — ULTRA PREMIUM SCRIPT
   ═══════════════════════════════════════════════════ */

let pedido = {};
let total = 0;
let categoriaAbierta = null;
let grupoBebidasAbierto = null;
let grupoCocinaAbierto = null;
let unsubscribePedidoActual = null;
let deferredInstallPrompt = null;
let serviceWorkerRegistration = null;
let sonidoListo = new Audio('/assets/sonidos/listo.mp3');
let sonidoDesbloqueado = false;
let productosMenuCache = [];
let unsubscribeMenuPublicado = null;
let enviandoPedido = false;

document.addEventListener("click", () => {
  if (!sonidoDesbloqueado) {
    sonidoListo.play().then(() => {
      sonidoListo.pause();
      sonidoListo.currentTime = 0;
      sonidoDesbloqueado = true;
      console.log("🔊 Sonido desbloqueado");
    }).catch(() => {});
  }
});

const VAPID_KEY = "BK3WRPTSVTTqbu_2IdXYBWA7T6JoNCQP67GO0C45Vvh35PVepX3maDEyfTyonLSm4BisEDRCojUddunvbm-_V1o";

/* ═══ DATA ═══ */
let categoriasAContenedor = {};
let sectoresMenuCacheCliente = [];
let subcategoriasAbiertas = {};

const MENU_CACHE_KEY = "orange_menu_publicado_cache";

/* ═══ HELPERS ═══ */
function esIPhone() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent || navigator.vendor || '');
}

function esAndroid() {
  return /Android/i.test(navigator.userAgent || navigator.vendor || '');
}

function estaEnPWA() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function escaparHTML(texto) {
  return String(texto || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escaparJS(texto) {
  return String(texto || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function normalizarCategoria(categoria) {
  return String(categoria || "").trim();
}

function normalizarClaveMenu(texto) {
  return String(texto || "")
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function renderEstructuraMenuDinamica() {
  const tabs = document.getElementById("categoryTabs");
  const contenedor = document.getElementById("menuSectionsContainer");

  if (!tabs || !contenedor) return;

  tabs.innerHTML = "";
  contenedor.innerHTML = "";
  categoriasAContenedor = {};

  const sectoresActivos = sectoresMenuCacheCliente
    .filter(s => s.activo !== false)
    .sort((a, b) => Number(a.orden || 0) - Number(b.orden || 0));

  sectoresActivos.forEach((sector) => {
    const claveSector = normalizarClaveMenu(sector.clave || sector.nombre);
    const nombreSector = sector.nombre || claveSector;
    const iconoSector = sector.icono || "restaurant";

    tabs.innerHTML += `
      <button class="category-tab" data-cat="${claveSector}" onclick="mostrar('${claveSector}')">
        <span class="material-symbols-rounded">${iconoSector}</span>
        ${escaparHTML(nombreSector)}
      </button>
    `;

    const categorias = Array.isArray(sector.categorias)
      ? sector.categorias
          .filter(c => c.activa !== false)
          .sort((a, b) => Number(a.orden || 0) - Number(b.orden || 0))
      : [];

    let categoriasHTML = "";

    if (categorias.length > 0) {
      categoriasHTML += `<div class="subcategory-tabs">`;

      categorias.forEach((cat) => {
        const claveCategoria = normalizarClaveMenu(cat.clave || cat.nombre);
        const nombreCategoria = cat.nombre || claveCategoria;
        const idSubsection = `${claveSector}_${claveCategoria}`;
        const idLista = `lista_${claveSector}_${claveCategoria}`;

        categoriasAContenedor[`${claveSector}_${claveCategoria}`] = idLista;

        categoriasHTML += `
          <button class="subcategory-tab" onclick="mostrarSubcategoria('${claveSector}', '${idSubsection}')">
            <span class="material-symbols-rounded">${iconoSector}</span>
            ${escaparHTML(nombreCategoria)}
          </button>
        `;
      });

      categoriasHTML += `</div>`;

      categorias.forEach((cat) => {
        const claveCategoria = normalizarClaveMenu(cat.clave || cat.nombre);
        const nombreCategoria = cat.nombre || claveCategoria;
        const idSubsection = `${claveSector}_${claveCategoria}`;
        const idLista = `lista_${claveSector}_${claveCategoria}`;

        categoriasHTML += `
          <div class="subsection" id="${idSubsection}">
            <div class="section-title">
              <span class="material-symbols-rounded icon-h3">${iconoSector}</span>
              ${escaparHTML(nombreCategoria)}
            </div>
            <div id="${idLista}"></div>
          </div>
        `;
      });
    } else {
      const idLista = `lista_${claveSector}`;
      categoriasAContenedor[claveSector] = idLista;

      categoriasHTML = `
        <div class="section-title">
          <span class="material-symbols-rounded icon-h3">${iconoSector}</span>
          ${escaparHTML(nombreSector)}
        </div>
        <div id="${idLista}"></div>
      `;
    }

    contenedor.innerHTML += `
      <div class="menu-section" id="${claveSector}">
        ${categoriasHTML}
      </div>
    `;
  });
}

function escucharSectoresMenuCliente() {
  return new Promise((resolve) => {
    db.collection("sectores_menu")
      .onSnapshot((snapshot) => {
        sectoresMenuCacheCliente = [];

        snapshot.forEach((doc) => {
          sectoresMenuCacheCliente.push({
            id: doc.id,
            ...doc.data()
          });
        });

        renderEstructuraMenuDinamica();

        if (productosMenuCache.length > 0) {
          renderProductosDesdeFirebase(productosMenuCache);
        }

        resolve();
      }, (error) => {
        console.log("ERROR AL CARGAR SECTORES MENÚ:", error);
        resolve();
      });
  });
}

function obtenerContenedorCategoria(producto) {
  const sectorMenu = normalizarClaveMenu(producto.sectorMenu || producto.sector || "");
  const categoria = normalizarClaveMenu(producto.categoria || "");

  const id = categoriasAContenedor[`${sectorMenu}_${categoria}`] || categoriasAContenedor[categoria];
  if (!id) return null;

  return document.getElementById(id);
}

function obtenerProductoPorId(idProducto) {
  return productosMenuCache.find(p => String(p.id || "") === String(idProducto || "")) || null;
}

function obtenerProductoPorNombre(nombreProducto) {
  return productosMenuCache.find(p => String(p.nombre || "") === String(nombreProducto || "")) || null;
}

function obtenerPrecioProductoPorId(idProducto) {
  const producto = obtenerProductoPorId(idProducto);
  return producto ? Number(producto.precioVenta || 0) : 0;
}

function obtenerNombreProductoPorId(idProducto) {
  const producto = obtenerProductoPorId(idProducto);
  return producto ? String(producto.nombre || "") : "";
}

function obtenerSaboresProducto(producto) {
  if (!producto || !Array.isArray(producto.sabores)) return [];
  return producto.sabores.filter(s => String(s || "").trim() !== "");
}

function guardarMenuEnCacheLocal(data) {
  try {
    localStorage.setItem(MENU_CACHE_KEY, JSON.stringify(data));
  } catch (error) {
    console.log("ERROR AL GUARDAR CACHE LOCAL DEL MENÚ:", error);
  }
}

function obtenerMenuDesdeCacheLocal() {
  try {
    const texto = localStorage.getItem(MENU_CACHE_KEY);
    if (!texto) return null;
    return JSON.parse(texto);
  } catch (error) {
    console.log("ERROR AL LEER CACHE LOCAL DEL MENÚ:", error);
    return null;
  }
}

function valorBooleanoFlexible(valor) {
  if (valor === true) return true;
  if (typeof valor === "string") {
    return valor.trim().toLowerCase() === "true";
  }
  return false;
}

function obtenerArrayFlexible(...valores) {
  for (const valor of valores) {
    if (Array.isArray(valor)) {
      return valor.filter(v => String(v || "").trim() !== "");
    }
  }
  return [];
}

function obtenerNumeroFlexible(...valores) {
  for (const valor of valores) {
    const numero = Number(valor);
    if (!isNaN(numero) && numero > 0) {
      return numero;
    }
  }
  return 0;
}

function obtenerTextoFlexible(...valores) {
  for (const valor of valores) {
    const texto = String(valor || "").trim();
    if (texto) return texto;
  }
  return "";
}
function generarPedidoIdSeguro() {
  if (window.crypto && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return "pedido_" + Date.now() + "_" + Math.random().toString(36).substring(2, 12);
}

function convertirPedidoAItems() {
  const items = [];

  for (const nombre in pedido) {
    const item = pedido[nombre];

    items.push({
      productoId: item.productoId || "",
      nombre: nombre,
      cantidad: Number(item.cantidad || 0),
      precio: Number(item.precio || 0),
      subtotal: Number(item.precio || 0) * Number(item.cantidad || 0),
      sector: item.sector || "",
      automatico: item.automatico === true
    });
  }

  return items;
}
function esProductoAutomaticoConfig(producto) {
  if (!producto) return false;

  const valores = [
    producto.esAutomatico,
    producto.agregarAutomaticamente,
    producto.productoAutomatico,
    producto.seAgregaAutomaticamente,
    producto.autoAgregar,
    producto.auto_agregar
  ];

  return valores.some(valor => {
    if (valor === true) return true;
    if (typeof valor === "string") {
      return valor.trim().toLowerCase() === "true";
    }
    return false;
  });
}

function obtenerDisparadoresProductoAutomatico(producto) {
  if (!producto) return [];

  const crudos = obtenerArrayFlexible(
    producto.agregarConProductos,
    producto.productosDisparadores,
    producto.disparadores,
    producto.agregarAutomaticamenteCon,
    producto.seAgregaCon,
    producto.autoAgregarCon,
    producto.auto_agregar_con
  );

  return crudos.map(v => String(v || "").trim()).filter(Boolean);
}

function obtenerModoProductoAutomatico(producto) {
  if (!producto) return "una_vez";

  const modo = obtenerTextoFlexible(
    producto.tipoAutoAgregado,
    producto.tipoAgregadoAutomatico,
    producto.tipoAutomatico,
    producto.modoAutomatico,
    producto.reglaAutomatica,
    producto.tipo_auto,
    producto.modo_auto
  ).toLowerCase();

  if (["por_unidad", "por unidad", "porunidad"].includes(modo)) return "por_unidad";
  if (["cada_cantidad", "cada cantidad", "cadacantidad", "cada_x", "cada x"].includes(modo)) return "cada_cantidad";
  return "una_vez";
}

function obtenerCadaCantidadProductoAutomatico(producto) {
  return obtenerNumeroFlexible(
    producto.cantidadAutoAgregado,
    producto.cadaCantidad,
    producto.cantidadCada,
    producto.cadaCuantos,
    producto.cada_x,
    producto.multiploAutomatico
  );
}

function obtenerCantidadPedidaDeProducto(nombreOId) {
  let totalCantidad = 0;

  for (const nombrePedido in pedido) {
    const item = pedido[nombrePedido];
    if (!item || item.automatico === true) continue;

    const coincidePorNombre = String(nombrePedido || "") === String(nombreOId || "");
    const coincidePorId = String(item.productoId || "") === String(nombreOId || "");

    if (coincidePorNombre || coincidePorId) {
      totalCantidad += Number(item.cantidad || 0);
    }
  }

  return totalCantidad;
}

function calcularCantidadAutomaticaSegunModo(productoAutomatico) {
  const disparadores = obtenerDisparadoresProductoAutomatico(productoAutomatico);
  if (disparadores.length === 0) return 0;

  let cantidadBase = 0;

  disparadores.forEach((disparador) => {
  cantidadBase += obtenerCantidadPedidaDeProducto(disparador);
});

  if (cantidadBase <= 0) return 0;

  const modo = obtenerModoProductoAutomatico(productoAutomatico);

  if (modo === "por_unidad") {
    return cantidadBase;
  }

  if (modo === "cada_cantidad") {
    const cadaCantidad = obtenerCadaCantidadProductoAutomatico(productoAutomatico);
    if (cadaCantidad <= 0) return 0;
    return Math.ceil(cantidadBase / cadaCantidad);
  }

  return 1;
}

function sincronizarProductosAutomaticos() {
  const productosAutomaticos = productosMenuCache.filter(p => esProductoAutomaticoConfig(p));

  const nombresAutomaticosValidos = new Set(
    productosAutomaticos.map(p => String(p.nombre || "").trim()).filter(Boolean)
  );

  Object.keys(pedido).forEach((nombrePedido) => {
    const item = pedido[nombrePedido];
    if (item && item.automatico === true && !nombresAutomaticosValidos.has(nombrePedido)) {
      delete pedido[nombrePedido];
    }
  });

  productosAutomaticos.forEach((productoAutomatico) => {
    const nombre = String(productoAutomatico.nombre || "").trim();
    if (!nombre) return;

    const cantidadCalculada = calcularCantidadAutomaticaSegunModo(productoAutomatico);

    if (cantidadCalculada > 0) {
      pedido[nombre] = {
        precio: Number(productoAutomatico.precioVenta || 0),
        cantidad: cantidadCalculada,
        sector: productoAutomatico.sectorProduccion || productoAutomatico.sector || "",
        automatico: true,
        productoId: productoAutomatico.id || ""
      };
    } else if (pedido[nombre] && pedido[nombre].automatico === true) {
      delete pedido[nombre];
    }
  });
}

async function obtenerSiguienteNumeroPedido() {
  const ref = db.collection("configuracion").doc("caja_actual");

  return db.runTransaction(async (transaction) => {
    const doc = await transaction.get(ref);

    let ultimoNumeroPedido = 0;

    if (doc.exists) {
      const data = doc.data();
      if (typeof data.ultimoNumeroPedido === "number") {
        ultimoNumeroPedido = data.ultimoNumeroPedido;
      }
    }

    const nuevoNumeroPedido = ultimoNumeroPedido + 1;

    transaction.set(ref, {
      ultimoNumeroPedido: nuevoNumeroPedido
    }, { merge: true });

    return nuevoNumeroPedido;
  });
}

/* ═══ TOAST SYSTEM ═══ */
function mostrarToast(texto, icono = 'check_circle') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <span class="material-symbols-rounded">${icono}</span>
    <span class="toast-text">${texto}</span>
  `;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.classList.add('visible');
    });
  });

  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 400);
  }, 2200);
}

/* ═══ PRODUCTS FROM MENU PUBLICADO ═══ */
function limpiarMenuFirebase() {
  Object.values(categoriasAContenedor).forEach((id) => {
    const contenedor = document.getElementById(id);
    if (contenedor) contenedor.innerHTML = "";
  });
}

function crearOpcionesSelectSabores(listaSabores) {
  return listaSabores.map(sabor => {
    return `<option value="${escaparHTML(sabor)}">${escaparHTML(sabor)}</option>`;
  }).join("");
}

function crearCardProductoEspecialHTML(producto) {
  const idProducto = escaparJS(producto.id || "");
  const nombre = escaparHTML(producto.nombre || "");
  const imagenUrl = producto.imagenUrl || "";
  const precio = Number(producto.precioVenta || 0);
  const precioTexto = "$" + precio.toLocaleString('es-AR');
  const listaSabores = obtenerSaboresProducto(producto);
  const opcionesSabores = crearOpcionesSelectSabores(listaSabores);
  const imagenHTML = imagenUrl
    ? `<img src="${escaparHTML(imagenUrl)}" alt="${nombre}" loading="lazy" style="width:100%;height:100%;object-fit:cover;">`
    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#999;">Sin imagen</div>`;

  if (producto.permiteMitadMitad === true) {
    return `
      <div class="product-card-full">
        <div class="product-card-inner" style="gap:0;">
          <div class="product-img-wrap" style="width:110px;min-height:100px;border-radius:12px;overflow:hidden;flex-shrink:0;">
            ${imagenHTML}
          </div>
          <div class="product-info" style="flex:1;">
            <div class="product-name">${nombre}</div>
            <div class="product-price">${precioTexto}</div>

            <label for="tipoProducto-${escaparHTML(producto.id)}">Tipo:</label>
            <select id="tipoProducto-${escaparHTML(producto.id)}" onchange="cambiarTipoProductoMitadMitad('${idProducto}')">
              <option value="entera">Entera</option>
              <option value="mitad">Mitad y mitad</option>
            </select>

            <label for="saborProducto1-${escaparHTML(producto.id)}">Sabor 1:</label>
            <select id="saborProducto1-${escaparHTML(producto.id)}">${opcionesSabores}</select>

            <div id="bloqueSaborProducto2-${escaparHTML(producto.id)}" style="display:none;">
              <label for="saborProducto2-${escaparHTML(producto.id)}">Sabor 2:</label>
              <select id="saborProducto2-${escaparHTML(producto.id)}">${opcionesSabores}</select>
            </div>

            <button class="btn-agregar" onclick="agregarProductoConMitadMitad('${idProducto}')" style="margin-top:10px;">
              <span class="material-symbols-rounded">add_circle</span> Agregar ${nombre}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="product-card-full">
      <div class="product-card-inner" style="gap:0;">
        <div class="product-img-wrap" style="width:110px;min-height:100px;border-radius:12px;overflow:hidden;flex-shrink:0;">
          ${imagenHTML}
        </div>
        <div class="product-info" style="flex:1;">
          <div class="product-name">${nombre}</div>
          <div class="product-price">${precioTexto}</div>
          <label for="saborProducto-${escaparHTML(producto.id)}">Sabor:</label>
          <select id="saborProducto-${escaparHTML(producto.id)}">${opcionesSabores}</select>
          <button class="btn-agregar" onclick="agregarProductoConSabores('${idProducto}')">
            <span class="material-symbols-rounded">add_circle</span> Agregar ${nombre}
          </button>
        </div>
      </div>
    </div>
  `;
}

function crearCardProductoHTML(producto) {
  const nombre = escaparHTML(producto.nombre || "");
  const precio = Number(producto.precioVenta || 0);
  const sector = escaparJS(producto.sectorProduccion || producto.sector || "");
  const nombreJS = escaparJS(producto.nombre || "");
  const imagenUrl = producto.imagenUrl || "";
  const categoria = normalizarCategoria(producto.categoria);
  const precioTexto = "$" + precio.toLocaleString('es-AR');
  const sabores = obtenerSaboresProducto(producto);

  if (producto.usaSelectorSabores === true && sabores.length > 0) {
    return crearCardProductoEspecialHTML(producto);
  }

  const botonAgregar = `
    <button class="btn-agregar" onclick="agregar('${nombreJS}',${precio},'${sector}','${escaparJS(producto.id || "")}')">
      <span class="material-symbols-rounded">add_circle</span> Agregar
    </button>
  `;

  if (imagenUrl) {
    return `
      <div class="product-card">
        <div class="product-card-inner">
          <div class="product-img-wrap">
            <img src="${escaparHTML(imagenUrl)}" alt="${nombre}" loading="lazy">
          </div>
          <div class="product-info">
            <div class="product-name">${nombre}</div>
            <div class="product-price">${precioTexto}</div>
            ${botonAgregar}
          </div>
        </div>
      </div>
    `;
  }

  if (categoria === "tragos") {
    return `
      <div class="product-card no-img">
        <div class="product-card-inner">
          <div class="product-info">
            <div class="product-name">${nombre}</div>
            <div class="product-price">${precioTexto}</div>
            ${botonAgregar}
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="product-card no-img">
      <div class="product-card-inner">
        <div class="product-info">
          <div class="product-name">${nombre}</div>
          <div class="product-price">${precioTexto}</div>
          ${botonAgregar}
        </div>
      </div>
    </div>
  `;
}

function renderProductosDesdeFirebase(productos) {
  limpiarMenuFirebase();

   const productosActivos = productos.filter(p => {
  return p && p.activo !== false && !esProductoAutomaticoConfig(p);
});

  productosActivos.forEach((producto) => {
    const contenedor = obtenerContenedorCategoria(producto);
    if (!contenedor) return;

    contenedor.insertAdjacentHTML("beforeend", crearCardProductoHTML(producto));
  });

  Object.values(categoriasAContenedor).forEach((id) => {
    const contenedor = document.getElementById(id);
    if (!contenedor) return;

    if (!contenedor.innerHTML.trim()) {
      contenedor.innerHTML = `
        <div class="product-card no-img">
          <div class="product-card-inner">
            <div class="product-info">
              <div class="product-name">No hay productos disponibles</div>
            </div>
          </div>
        </div>
      `;
    }
  });
}

function aplicarMenuPublicado(dataMenu) {
  if (!dataMenu || !Array.isArray(dataMenu.productos)) return;

  productosMenuCache = [...dataMenu.productos];

  productosMenuCache.sort((a, b) => {
    const categoriaA = String(a.categoria || "");
    const categoriaB = String(b.categoria || "");
    if (categoriaA !== categoriaB) {
      return categoriaA.localeCompare(categoriaB, 'es');
    }
    return String(a.nombre || "").localeCompare(String(b.nombre || ""), 'es');
  });

  sincronizarProductosAutomaticos();
  renderProductosDesdeFirebase(productosMenuCache);
  actualizarUI();
}

function cargarMenuDesdeCacheLocal() {
  const menuCache = obtenerMenuDesdeCacheLocal();
  if (!menuCache || !Array.isArray(menuCache.productos)) return false;

  aplicarMenuPublicado(menuCache);
  return true;
}

function escucharProductosMenu() {
  if (unsubscribeMenuPublicado) {
    unsubscribeMenuPublicado();
  }

  unsubscribeMenuPublicado = db.collection("menu_publicado").doc("actual")
    .onSnapshot((doc) => {
      if (!doc.exists) {
        console.log("No hay menú publicado todavía");
        return;
      }

      const data = doc.data();
      if (!data || !Array.isArray(data.productos)) return;

      guardarMenuEnCacheLocal(data);
      aplicarMenuPublicado(data);
    }, (error) => {
      console.log("ERROR AL CARGAR MENÚ PUBLICADO:", error);
    });
}

/* ═══ DYNAMIC SELECTORS ═══ */
function cambiarTipoProductoMitadMitad(idProducto = "") {
  const tipoSelect = document.getElementById(`tipoProducto-${idProducto}`);
  const bloqueSabor2 = document.getElementById(`bloqueSaborProducto2-${idProducto}`);

  if (!tipoSelect || !bloqueSabor2) return;

  bloqueSabor2.style.display = tipoSelect.value === "mitad" ? "block" : "none";
}

/* ═══ NAVIGATION ═══ */
function mostrar(categoria) {
  const secciones = document.querySelectorAll(".menu-section");
  const tabs = document.querySelectorAll(".category-tab");

  if (categoriaAbierta === categoria) {
    const actual = document.getElementById(categoria);
    if (actual) actual.classList.remove("active");

    categoriaAbierta = null;
    tabs.forEach(t => t.classList.remove("active"));
    return;
  }

  secciones.forEach(sec => sec.classList.remove("active"));
  tabs.forEach(t => t.classList.remove("active"));

  const seccion = document.getElementById(categoria);
  if (seccion) seccion.classList.add("active");

  const activeTab = document.querySelector(`[data-cat="${categoria}"]`);
  if (activeTab) activeTab.classList.add("active");

  categoriaAbierta = categoria;

  document.querySelectorAll(".subsection").forEach(s => s.classList.remove("active"));
  document.querySelectorAll(".subcategory-tab").forEach(t => t.classList.remove("active"));
}

function mostrarSubcategoria(sector, idSubsection) {
  const key = sector;
  const seccionSector = document.getElementById(sector);
  if (!seccionSector) return;

  const tabs = seccionSector.querySelectorAll(".subcategory-tab");
  const subsections = seccionSector.querySelectorAll(".subsection");

  if (subcategoriasAbiertas[key] === idSubsection) {
    const actual = document.getElementById(idSubsection);
    if (actual) actual.classList.remove("active");

    subcategoriasAbiertas[key] = null;
    tabs.forEach(t => t.classList.remove("active"));
    return;
  }

  subsections.forEach(s => s.classList.remove("active"));
  tabs.forEach(t => t.classList.remove("active"));

  const subsection = document.getElementById(idSubsection);
  if (subsection) subsection.classList.add("active");

  tabs.forEach(t => {
    if (t.getAttribute("onclick")?.includes(idSubsection)) {
      t.classList.add("active");
    }
  });

  subcategoriasAbiertas[key] = idSubsection;
}

/* ═══ ADD TO CART ═══ */
function agregar(nombre, precio, sector, productoId = "") {
  if (pedido[nombre] && pedido[nombre].automatico === true) {
    delete pedido[nombre];
  }

  if (pedido[nombre]) {
    pedido[nombre].cantidad++;
  } else {
    pedido[nombre] = { precio, cantidad: 1, sector, productoId };
  }

  sincronizarProductosAutomaticos();
  actualizarUI();
  mostrarToast(`${nombre} agregado`, 'check_circle');
  bounceCarrito();
}

function restar(nombre) {
  if (!pedido[nombre]) return;
  if (pedido[nombre].automatico === true) return;

  pedido[nombre].cantidad--;

  if (pedido[nombre].cantidad <= 0) {
    delete pedido[nombre];
  }

  sincronizarProductosAutomaticos();
  actualizarUI();
}

/* ═══ SPECIAL ADDS ═══ */
function agregarProductoConSabores(idProducto = "") {
  const producto = obtenerProductoPorId(idProducto);
  if (!producto) return alert("No se encontró el producto");

  const saborEl = document.getElementById(`saborProducto-${idProducto}`);
  if (!saborEl) return alert("No está disponible el selector de sabores");

  const sabor = saborEl.value;
  if (!sabor) return alert("Elegí un sabor");

  const nombreFinal = `${producto.nombre} - ${sabor}`;
  agregar(nombreFinal, Number(producto.precioVenta || 0), producto.sectorProduccion || producto.sector || "", producto.id || "");
}

function agregarProductoConMitadMitad(idProducto = "") {
  const producto = obtenerProductoPorId(idProducto);
  if (!producto) return alert("No se encontró el producto");

  const tipoEl = document.getElementById(`tipoProducto-${idProducto}`);
  const sabor1El = document.getElementById(`saborProducto1-${idProducto}`);
  const sabor2El = document.getElementById(`saborProducto2-${idProducto}`);

  if (!tipoEl || !sabor1El || !sabor2El) {
    return alert("No está disponible el selector del producto");
  }

  const tipo = tipoEl.value;
  const sabor1 = sabor1El.value;
  const sabor2 = sabor2El.value;

  if (!sabor1) return alert("Elegí un sabor");

  if (tipo === "mitad") {
    if (!sabor2) return alert("Elegí el segundo sabor");
    agregar(`${producto.nombre} mitad y mitad - ${sabor1} / ${sabor2}`, Number(producto.precioVenta || 0), producto.sectorProduccion || producto.sector || "", producto.id || "");
    return;
  }

  agregar(`${producto.nombre} entera - ${sabor1}`, Number(producto.precioVenta || 0), producto.sectorProduccion || producto.sector || "", producto.id || "");
}

/* ═══ UPDATE UI ═══ */
function actualizarUI() {
  total = 0;
  let itemCount = 0;

  for (let p in pedido) {
    total += pedido[p].precio * pedido[p].cantidad;
    itemCount += pedido[p].cantidad;
  }

  const badge = document.getElementById('cartBadge');
  badge.textContent = itemCount;
  badge.classList.toggle('visible', itemCount > 0);

  const totalLabel = document.getElementById('cartTotalLabel');
  totalLabel.textContent = itemCount > 0 ? '$' + total.toLocaleString('es-AR') : '';

  const mcTotal = document.getElementById('minicartTotal');
  if (mcTotal) mcTotal.textContent = '$' + total.toLocaleString('es-AR');

  renderMiniCartItems();
}

function renderMiniCartItems() {
  const container = document.getElementById('minicartItems');
  if (!container) return;

  const keys = Object.keys(pedido);

  if (keys.length === 0) {
    container.innerHTML = `
      <div class="minicart-empty">
        <span class="material-symbols-rounded">shopping_cart</span>
        Tu pedido está vacío
      </div>
    `;
    return;
  }

  container.innerHTML = '';

  keys.forEach(nombre => {
    const item = pedido[nombre];
    const div = document.createElement('div');
    div.className = 'minicart-item';

    if (item.automatico === true) {
      div.innerHTML = `
        <div class="minicart-item-info">
          <div class="minicart-item-name">
            <span class="material-symbols-rounded" style="color:#8adaff;font-size:1rem;">auto_awesome</span>
            ${nombre} <span class="minicart-auto-badge">auto</span>
          </div>
          <div class="minicart-item-price">$${item.precio} c/u</div>
        </div>
        <div class="minicart-qty-num">x${item.cantidad}</div>
        <div class="minicart-item-subtotal">$${(item.precio * item.cantidad).toLocaleString('es-AR')}</div>
      `;
    } else {
      const escapedName = nombre.replace(/'/g, "\\'");

      div.innerHTML = `
        <div class="minicart-item-info">
          <div class="minicart-item-name">${nombre}</div>
          <div class="minicart-item-price">$${item.precio.toLocaleString('es-AR')} c/u</div>
        </div>
        <div class="minicart-item-qty">
          <button class="minicart-qty-btn" onclick="restar('${escapedName}')">
            <span class="material-symbols-rounded">remove</span>
          </button>
          <span class="minicart-qty-num">${item.cantidad}</span>
          <button class="minicart-qty-btn" onclick="agregar('${escapedName}',${item.precio},'${item.sector}','${escaparJS(item.productoId || "")}')">
            <span class="material-symbols-rounded">add</span>
          </button>
        </div>
        <div class="minicart-item-subtotal">$${(item.precio * item.cantidad).toLocaleString('es-AR')}</div>
      `;
    }

    container.appendChild(div);
  });
}

/* ═══ MINI CART ═══ */
function abrirMiniCart() {
  renderMiniCartItems();
  document.getElementById('minicartOverlay').classList.add('visible');
  document.getElementById('minicart').classList.add('visible');
  document.body.style.overflow = 'hidden';
}

function cerrarMiniCart() {
  document.getElementById('minicartOverlay').classList.remove('visible');
  document.getElementById('minicart').classList.remove('visible');
  document.body.style.overflow = '';
}

function bounceCarrito() {
  const cart = document.getElementById('floatingCart');
  cart.classList.remove('bounce');
  void cart.offsetWidth;
  cart.classList.add('bounce');
}

/* ═══ PAYMENT ═══ */
function mostrarPago() {
  if (total === 0) {
    mostrarToast("No agregaste productos", "warning");
    return;
  }

  cerrarMiniCart();

  const importeEl = document.getElementById("importePedidoTexto");
  if (importeEl) {
    importeEl.textContent = "$" + total.toLocaleString("es-AR");
  }

  document.getElementById('payModal').classList.add('visible');
  document.body.style.overflow = 'hidden';
}

function cerrarPago() {
  document.getElementById('payModal').classList.remove('visible');
  document.body.style.overflow = '';
}

function tieneSector(s) {
  return Object.values(pedido).some(item => item.sector === s);
}

function construirEstadoInicial() {
  const estado = {
    caja: "pendiente"
  };

  Object.values(pedido).forEach((item) => {
    if (item.sector) {
      estado[item.sector] = "pendiente";
    }
  });

  return estado;
}

function construirNotificadoInicial() {
  const notificado = {};

  Object.values(pedido).forEach((item) => {
    if (item.sector) {
      notificado[`${item.sector}_preparacion`] = false;
      notificado[`${item.sector}_listo`] = false;
    }
  });

  return notificado;
}

async function pagarEfectivo() {
  if (enviandoPedido) return;
  enviandoPedido = true;

  if (Object.keys(pedido).length === 0) {
    enviandoPedido = false;
    return alert("No hay productos");
  }

  const nombreClienteInput = document.getElementById("nombreCliente");
  const nombreCliente = nombreClienteInput ? nombreClienteInput.value.trim() : "";
  const tipoEntrega = document.getElementById("tipoEntregaCliente")?.value || "salon";

  if (!nombreCliente) {
    enviandoPedido = false;
    mostrarToast("Ingresá mesa, retiro en barra o delivery", "person");
    return;
  }

  cerrarPago();

  try {
    const numeroPedido = await obtenerSiguienteNumeroPedido();
    const pedidoId = generarPedidoIdSeguro();

    const pedidoData = {
      numeroPedido,
      nombreCliente,
      tipoEntrega,
      pedido: pedido,
      items: convertirPedidoAItems(),
      total,
      creadoOffline: !navigator.onLine,
      pago: "efectivo",
      estado: construirEstadoInicial(),
      notificado: construirNotificadoInicial(),
      fecha: firebase.firestore.FieldValue.serverTimestamp()
    };

    await db.collection("pedidos").doc(pedidoId).set(pedidoData);

    const banner = document.getElementById("orderBanner");
    banner.classList.add("visible");
    document.getElementById("numeroPedido").textContent = `Pedido ${numeroPedido} · ${nombreCliente}`;
    document.getElementById("estadoCliente").textContent = "Esperando cobro";

    localStorage.setItem("pedidoActualId", pedidoId);
    localStorage.removeItem("notificacionesPedidoActual");

    escucharPedidoActual(pedidoId);

    agregarNotificacionLocal(`Pedido ${numeroPedido} enviado. Esperando confirmación de pago.`);
    mostrarToast(`¡Pedido ${numeroPedido} enviado!`, "rocket_launch");

    pedido = {};
    total = 0;

    if (nombreClienteInput) {
      nombreClienteInput.value = "";
    }

    actualizarUI();
    enviandoPedido = false;

  } catch (error) {
    enviandoPedido = false;
    console.log("ERROR AL ENVIAR:", error);
    mostrarToast("Error al enviar pedido", "error");
  }
}
async function pagarTarjeta() {
  if (enviandoPedido) return;
  enviandoPedido = true;

  if (Object.keys(pedido).length === 0) {
    enviandoPedido = false;
    mostrarToast("No hay productos", "warning");
    return;
  }

  const nombreClienteInput = document.getElementById("nombreCliente");
  const nombreCliente = nombreClienteInput ? nombreClienteInput.value.trim() : "";
  const tipoEntrega = document.getElementById("tipoEntregaCliente")?.value || "salon";

  if (!nombreCliente) {
    enviandoPedido = false;
    mostrarToast("Ingresá mesa, retiro en barra o delivery", "person");
    return;
  }

  cerrarPago();

  try {
    const numeroPedido = await obtenerSiguienteNumeroPedido();
    const pedidoId = generarPedidoIdSeguro();

    const pedidoData = {
      numeroPedido,
      nombreCliente,
      tipoEntrega,
      pedido: pedido,
      items: convertirPedidoAItems(),
      total,
      creadoOffline: !navigator.onLine,
      pago: "tarjeta",
      estadoPago: "esperando_posnet",
      estado: construirEstadoInicial(),
      notificado: construirNotificadoInicial(),
      fecha: firebase.firestore.FieldValue.serverTimestamp()
    };

    await db.collection("pedidos").doc(pedidoId).set(pedidoData);

    const banner = document.getElementById("orderBanner");
    banner.classList.add("visible");

    document.getElementById("numeroPedido").textContent =
      `Pedido ${numeroPedido} · ${nombreCliente}`;

    document.getElementById("estadoCliente").textContent =
  "Esperando cobro con tarjeta";

    localStorage.setItem("pedidoActualId", pedidoId);
    localStorage.removeItem("notificacionesPedidoActual");

    escucharPedidoActual(pedidoId);

    agregarNotificacionLocal(
      `Pedido ${numeroPedido} esperando cobro con tarjeta`
    );

    mostrarToast(
      "Esperando cobro con tarjeta",
      "credit_card"
    );

    pedido = {};
    total = 0;

    if (nombreClienteInput) {
      nombreClienteInput.value = "";
    }

    actualizarUI();
    enviandoPedido = false;

  } catch (error) {
    enviandoPedido = false;
    console.log("ERROR TARJETA:", error);
    mostrarToast("Error al enviar pedido", "error");
  }
}

async function pagarTransferencia() {
  if (enviandoPedido) return;
  enviandoPedido = true;

  if (Object.keys(pedido).length === 0) {
    enviandoPedido = false;
    mostrarToast("No hay productos", "warning");
    return;
  }

  const nombreClienteInput = document.getElementById("nombreCliente");
  const nombreCliente = nombreClienteInput ? nombreClienteInput.value.trim() : "";
  const tipoEntrega = document.getElementById("tipoEntregaCliente")?.value || "salon";

  if (!nombreCliente) {
    enviandoPedido = false;
    mostrarToast("Ingresá mesa, retiro en barra o delivery", "person");
    return;
  }

  const comprobanteInput = document.getElementById("comprobanteTransferencia");
  const archivo = comprobanteInput && comprobanteInput.files
    ? comprobanteInput.files[0]
    : null;

  if (!archivo) {
    enviandoPedido = false;
    mostrarToast("Subí el comprobante", "warning");
    return;
  }

  cerrarPago();

  try {
    const numeroPedido = await obtenerSiguienteNumeroPedido();
    const pedidoId = generarPedidoIdSeguro();

    const refStorage = firebase.storage()
      .ref()
      .child(`comprobantes_transferencia/pedido_${numeroPedido}_${Date.now()}_${archivo.name}`);

    await refStorage.put(archivo);

    const comprobanteUrl = await refStorage.getDownloadURL();

    const pedidoData = {
      numeroPedido,
      nombreCliente,
      tipoEntrega,
      pedido: pedido,
      items: convertirPedidoAItems(),
      total,
      creadoOffline: !navigator.onLine,
      pago: "transferencia",
      estadoPago: "comprobante_enviado",
      comprobanteUrl,
      estado: construirEstadoInicial(),
      notificado: construirNotificadoInicial(),
      fecha: firebase.firestore.FieldValue.serverTimestamp()
    };

    await db.collection("pedidos").doc(pedidoId).set(pedidoData);

    const banner = document.getElementById("orderBanner");
    banner.classList.add("visible");

    document.getElementById("numeroPedido").textContent =
      `Pedido ${numeroPedido} · ${nombreCliente}`;

    document.getElementById("estadoCliente").textContent =
      "Comprobante enviado. Esperando confirmación de caja";

    localStorage.setItem("pedidoActualId", pedidoId);
    localStorage.removeItem("notificacionesPedidoActual");

    escucharPedidoActual(pedidoId);

    agregarNotificacionLocal(
      `Pedido ${numeroPedido} enviado por transferencia. Esperando confirmación de caja.`
    );

    mostrarToast("Comprobante enviado", "check_circle");

    pedido = {};
    total = 0;

    if (nombreClienteInput) {
      nombreClienteInput.value = "";
    }

    if (comprobanteInput) {
      comprobanteInput.value = "";
    }

    actualizarUI();
    enviandoPedido = false;

  } catch (error) {
    enviandoPedido = false;
    console.log("ERROR TRANSFERENCIA:", error);
    mostrarToast("Error al enviar comprobante", "error");
  }
}

/* ═══ NOTIFICATIONS ═══ */
function getNotificacionesGuardadas() {
  try {
    return JSON.parse(localStorage.getItem("notificacionesPedidoActual") || "[]");
  } catch {
    return [];
  }
}

function guardarNotificaciones(lista) {
  localStorage.setItem("notificacionesPedidoActual", JSON.stringify(lista));
}

function renderNotificaciones() {
  const c = document.getElementById("notificacionesLista");
  const lista = getNotificacionesGuardadas();

  if (!c) return;

  c.innerHTML = "";

  lista.forEach(texto => {
    const item = document.createElement("div");
    item.className = "notificacion-item";
    item.textContent = texto;
    c.appendChild(item);
  });

  const section = document.getElementById('notifSection');
  if (section) {
    section.style.display = lista.length > 0 ? 'block' : 'none';
  }
}

function agregarNotificacionLocal(texto) {
  const lista = getNotificacionesGuardadas();

  if (!lista.includes(texto)) {
    lista.push(texto);
    guardarNotificaciones(lista);
    renderNotificaciones();
  }
}

function mostrarNotificacionNavegador(texto) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  new Notification("Orange Brewery", {
    body: texto,
    icon: "/icon.png"
  });
}

function reproducirSonidoListo() {
  try {
    sonidoListo.currentTime = 0;
    sonidoListo.play().catch((error) => {
      console.log("No se pudo reproducir el sonido:", error);
    });
  } catch (e) {
    console.log("Error sonido:", e);
  }
}

function avisar(texto) {
  agregarNotificacionLocal(texto);
  mostrarNotificacionNavegador(texto);
  mostrarToast(texto.replace(/<[^>]*>/g, ''), 'notifications');

  if (texto.toLowerCase().includes("listo")) {
    reproducirSonidoListo();
  }
}

/* ═══ UNIFIED NOTIFICATION BUTTON ═══ */
function actualizarEstadoNotificaciones(texto) {
  const el = document.getElementById("estadoNotificaciones");
  if (el) el.textContent = texto;
}

function actualizarBotonNotif(activo) {
  const btn = document.getElementById('btnNotif');
  const txt = document.getElementById('btnNotifText');

  if (activo) {
    btn.classList.add('active');
    txt.textContent = 'Notificaciones Activadas';
  }
}

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
});

async function activarNotificaciones() {
  if (deferredInstallPrompt) {
    try {
      deferredInstallPrompt.prompt();
      const result = await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;

      if (result.outcome === 'accepted') {
        mostrarToast("¡App instalada!", "download_done");
      }
    } catch (e) {
      console.log("Install prompt error:", e);
    }
  }

  if (esIPhone() && !estaEnPWA()) {
    document.getElementById('iosModal').classList.add('visible');
    return;
  }

  await registrarServiceWorkerMensajeria();
  await pedirPermisoNotificaciones();

  if (Notification.permission === "granted") {
    await pedirTokenFCM();
    actualizarBotonNotif(true);
  } else {
    actualizarEstadoNotificaciones("Permiso no concedido");
  }
}

function cerrarModalIOS() {
  document.getElementById('iosModal').classList.remove('visible');
}

async function pedirPermisoNotificaciones() {
  if (!("Notification" in window)) return;

  if (Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch (e) {
      console.log("Permission error:", e);
    }
  }
}

async function registrarServiceWorkerMensajeria() {
  if (!("serviceWorker" in navigator)) return null;

  try {
    serviceWorkerRegistration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    return serviceWorkerRegistration;
  } catch (error) {
    console.log("SW register error:", error);
    return null;
  }
}

async function pedirTokenFCM() {
  if (!firebase.messaging.isSupported()) {
    actualizarEstadoNotificaciones("No soportado en este dispositivo");
    return null;
  }

  if (!VAPID_KEY || VAPID_KEY === "REEMPLAZAR_CON_TU_VAPID_KEY") {
    actualizarEstadoNotificaciones("Falta VAPID KEY");
    return null;
  }

  try {
    const messaging = firebase.messaging();
    const token = await messaging.getToken({
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration
    });

    if (!token) {
      actualizarEstadoNotificaciones("No se pudo generar token");
      return null;
    }

    localStorage.setItem("fcmToken", token);
    await guardarTokenEnFirestore(token);
    actualizarEstadoNotificaciones("Notificaciones activadas ✓");
    return token;
  } catch (error) {
    console.log("FCM token error:", error);
    actualizarEstadoNotificaciones("Error: " + (error.message || ""));
    return null;
  }
}

async function guardarTokenEnFirestore(token) {
  try {
    await db.collection("tokens_notificaciones").doc(token).set({
      token,
      pedidoActualId: localStorage.getItem("pedidoActualId") || null,
      plataforma: esIPhone() ? "iphone" : esAndroid() ? "android" : "otro",
      userAgent: navigator.userAgent,
      actualizado: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.log("Token save error:", error);
  }
}

/* ═══ FOREGROUND MESSAGES ═══ */
function escucharMensajesForeground() {
  if (!firebase.messaging.isSupported()) return;

  try {
    firebase.messaging().onMessage(payload => {
      if (payload.notification) {
        const texto = `${payload.notification.title} - ${payload.notification.body}`;
        agregarNotificacionLocal(texto);
        mostrarToast(texto, 'notifications');
      }
    });
  } catch (e) {
    console.log("Foreground msg error:", e);
  }
}

/* ═══ LISTEN ORDER ═══ */
function escucharPedidoActual(pedidoId) {
  if (!pedidoId) return;

  if (unsubscribePedidoActual) {
    unsubscribePedidoActual();
  }

  unsubscribePedidoActual = db.collection("pedidos").doc(pedidoId)
    .onSnapshot(doc => {
      if (!doc.exists) return;

      const data = doc.data();
      if (!data.estado || !data.notificado) return;

      const banner = document.getElementById('orderBanner');
      banner.classList.add('visible');

      if (data.numeroPedido) {
        const nombreMostrado = data.nombreCliente ? " · " + data.nombreCliente : "";
        document.getElementById("numeroPedido").textContent = "Pedido " + data.numeroPedido + nombreMostrado;
      }

      if (data.estado.caja === "pendiente") {
  if (data.pago === "transferencia") {
    document.getElementById("estadoCliente").textContent = "Comprobante enviado. Esperando confirmación";
  } else {
    document.getElementById("estadoCliente").textContent = "Esperando cobro";
  }
}

      if (data.estado.caja === "pagado") {
        document.getElementById("estadoCliente").textContent = "Pago confirmado ✓";
      }
      
Object.keys(data.estado).forEach((sector) => {
  if (sector === "caja") return;

  const nombreSector =
    sector.charAt(0).toUpperCase() +
    sector.replace(/_/g, " ").slice(1);

  const keyPreparacion = `${sector}_preparacion`;
  const keyListo = `${sector}_listo`;

  if (data.estado[sector] === "en_preparacion" && !data.notificado[keyPreparacion]) {
    avisar(`🔔 Tu pedido de ${nombreSector} está en preparación`);

    db.collection("pedidos").doc(pedidoId).update({
      [`notificado.${keyPreparacion}`]: true
    });
  }

  if (data.estado[sector] === "listo" && !data.notificado[keyListo]) {
    avisar(`✅ Tu pedido de ${nombreSector} está listo`);

    db.collection("pedidos").doc(pedidoId).update({
      [`notificado.${keyListo}`]: true
    });
  }
});
    }, error => {
      console.log("Order listen error:", error);
    });
}

/* ═══ INIT ═══ */
window.addEventListener("load", async () => {
  await escucharSectoresMenuCliente();

  const cargoDesdeCache = cargarMenuDesdeCacheLocal();
  if (!cargoDesdeCache) {
    renderProductosDesdeFirebase([]);
  }

  escucharProductosMenu();
  renderNotificaciones();
  actualizarUI();
  escucharMensajesForeground();

  await registrarServiceWorkerMensajeria();

  if ("Notification" in window && Notification.permission === "granted") {
    actualizarBotonNotif(true);
    actualizarEstadoNotificaciones("Notificaciones activadas ✓");
    await pedirTokenFCM();
  }

  if (esAndroid() && !estaEnPWA()) {
    setTimeout(() => {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt().catch(() => {});
        deferredInstallPrompt.userChoice.then(result => {
          if (result.outcome === 'accepted') {
            mostrarToast("¡App instalada!", "download_done");
          }
          deferredInstallPrompt = null;
        }).catch(() => {});
      }
    }, 3000);
  }

  const pedidoGuardado = localStorage.getItem("pedidoActualId");
  if (pedidoGuardado) {
    escucharPedidoActual(pedidoGuardado);
  }
});