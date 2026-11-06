// ==========================================
// 1. CONFIGURACIÓN E INICIALIZACIÓN DE APIS
// ==========================================
const SUPABASE_URL = "https://hhrpjyofxmyzrdahqutm.supabase.co";
// Esta clave "publishable" es pública por diseño: lo que protege los datos son las
// políticas RLS y el login de administrador (ver supabase/migracion.sql).
const SUPABASE_KEY = "sb_publishable_cV1Qsy3U-htu9UvHKB-F9Q_YG_JhNpC";

const TIMEOUT_MS = 12000;
const UMBRAL_STOCK_BAJO = 3;
const CLAVE_CACHE_CATALOGO = "souvenirs_catalogo_v1";

// persistSession:false → la sesión de administrador se cierra al recargar la página,
// así un tablet de caja no se queda con el modo inventario abierto.
// Cámbialo a true si prefieres que la sesión se recuerde.
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false }
});

let carrito = [];
let baseDeDatosProductos = [];
let terminoBusqueda = "";
let modoAdmin = false;
let categoriaActiva = "todos";
let datosEnCache = false;      // true cuando no hay conexión y se muestra el último inventario guardado
let procesandoVenta = false;

// ==========================================
// 1b. CATEGORÍAS
// ==========================================
// La categoría se guarda en la columna "categoria" de la tabla productos.
// Si un producto no la tiene (o es "general"), se intenta adivinar por palabras
// completas del nombre (no por pedazos de texto).
const normalizar = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const CATEGORIA_GENERAL = { id: 'general', etiqueta: 'General', color: 'var(--cat-general)', claves: [] };
const CATEGORIAS = [
    { id: 'lectura',    etiqueta: 'Lectura',           color: 'var(--cat-lectura)',    claves: ['biblia', 'libro', 'pan diario', 'proposito', 'habitos', 'hombres', 'leyes', 'incendiario'] },
    { id: 'accesorios', etiqueta: 'Accesorios',        color: 'var(--cat-accesorios)', claves: ['llavero', 'pulsera', 'pin', 'porta carnet', 'rinonera'] },
    { id: 'papeleria',  etiqueta: 'Papelería',         color: 'var(--cat-papeleria)',  claves: ['agenda', 'lapiz', 'lapices', 'sticker'] },
    { id: 'hogar',      etiqueta: 'Vestuario y hogar', color: 'var(--cat-hogar)',      claves: ['gorra', 'sueter', 'taza', 'termo'] },
];
CATEGORIAS.forEach(c => { c.regex = new RegExp(`\\b(${c.claves.join('|')})(s|es)?\\b`); });
const TODAS_LAS_CATEGORIAS = [...CATEGORIAS, CATEGORIA_GENERAL];
const CATEGORIAS_POR_ID = new Map(TODAS_LAS_CATEGORIAS.map(c => [c.id, c]));

function adivinarCategoriaPorNombre(nombre) {
    const n = normalizar(nombre);
    return CATEGORIAS.find(c => c.regex.test(n)) || CATEGORIA_GENERAL;
}

function categorizarProducto(prod) {
    const guardada = CATEGORIAS_POR_ID.get(prod.categoria);
    if (guardada && guardada.id !== 'general') return guardada;
    return adivinarCategoriaPorNombre(prod.nombre);
}

// ==========================================
// 1c. REFERENCIAS AL DOM
// ==========================================
const gridProductos = document.getElementById('grid-productos');
const categoriaChips = document.getElementById('categoria-chips');
const carritoItems = document.getElementById('carrito-items');
const cartTotal = document.getElementById('cart-total');
const btnPagar = document.getElementById('btn-pagar');
const btnVaciar = document.getElementById('btn-vaciar');
const buscador = document.getElementById('buscador');
const contadorProductos = document.getElementById('contador-productos');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const toastContainer = document.getElementById('toast-container');
const bannerOffline = document.getElementById('banner-offline');
const btnAdminToggle = document.getElementById('btn-admin-toggle');
const btnNuevoProducto = document.getElementById('btn-nuevo-producto');
const btnReportes = document.getElementById('btn-reportes');
const btnVentas = document.getElementById('btn-ventas');
const modalReportes = document.getElementById('modal-reportes');
const resumenReporte = document.getElementById('resumen-reporte');
const listaMasVendidos = document.getElementById('lista-mas-vendidos');
const listaStockBajo = document.getElementById('lista-stock-bajo');
const btnExportarInventario = document.getElementById('btn-exportar-inventario');

// Login de administrador
const modalPassword = document.getElementById('modal-password');
const inputEmail = document.getElementById('input-email');
const inputPassword = document.getElementById('input-password');
const errorPassword = document.getElementById('error-password');
const btnConfirmarPassword = document.getElementById('btn-confirmar-password');

// Producto
const modalProducto = document.getElementById('modal-producto');
const tituloModalProducto = document.getElementById('titulo-modal-producto');
const errorProducto = document.getElementById('error-producto');
const inputNombre = document.getElementById('input-nombre');
const inputPrecio = document.getElementById('input-precio');
const inputStock = document.getElementById('input-stock');
const inputCategoria = document.getElementById('input-categoria');
const inputIdOriginal = document.getElementById('input-id-original');
const btnGuardarProducto = document.getElementById('btn-guardar-producto');
const btnEliminarProducto = document.getElementById('btn-eliminar-producto');
const inputCodigoBarras = document.getElementById('input-codigo-barras');
const btnGenerarCodigo = document.getElementById('btn-generar-codigo');
const btnEscanearCodigoProducto = document.getElementById('btn-escanear-codigo-producto');
const etiquetaPreview = document.getElementById('etiqueta-preview');
const btnImprimirEtiqueta = document.getElementById('btn-imprimir-etiqueta');

// Escáner
const btnEscanearVenta = document.getElementById('btn-escanear-venta');
const modalScanner = document.getElementById('modal-scanner');
const tituloModalScanner = document.getElementById('titulo-modal-scanner');
const subtituloModalScanner = document.getElementById('subtitulo-modal-scanner');
const scannerStatus = document.getElementById('scanner-status');

// Cobro
const modalCobro = document.getElementById('modal-cobro');
const cobroFormulario = document.getElementById('cobro-formulario');
const cobroResultado = document.getElementById('cobro-resultado');
const cobroTotalEl = document.getElementById('cobro-total');
const cobroRapidos = document.getElementById('cobro-rapidos');
const cobroCambio = document.getElementById('cobro-cambio');
const cobroCambioEtiqueta = document.getElementById('cobro-cambio-etiqueta');
const cobroCambioValor = document.getElementById('cobro-cambio-valor');
const inputRecibido = document.getElementById('input-recibido');
const errorCobro = document.getElementById('error-cobro');
const btnConfirmarCobro = document.getElementById('btn-confirmar-cobro');
const resTotal = document.getElementById('res-total');
const resRecibido = document.getElementById('res-recibido');
const resCambio = document.getElementById('res-cambio');
const resAviso = document.getElementById('res-aviso');

// Ventas recientes
const modalVentas = document.getElementById('modal-ventas');
const listaVentas = document.getElementById('lista-ventas');

// Etiquetas
const btnEtiquetas = document.getElementById('btn-etiquetas');
const modalEtiquetas = document.getElementById('modal-etiquetas');
const etqAviso = document.getElementById('etq-aviso');
const etqBuscador = document.getElementById('etq-buscador');
const etqLista = document.getElementById('etq-lista');
const etqInfoTotal = document.getElementById('etq-info-total');
const etqResumen = document.getElementById('etq-resumen');
const etqHojas = document.getElementById('etq-hojas');
const btnImprimirEtiquetas = document.getElementById('btn-imprimir-etiquetas');

// ==========================================
// UTILIDADES
// ==========================================
function conLimiteDeTiempo(promesa, ms = TIMEOUT_MS) {
    let temporizador;
    const limite = new Promise((_, reject) => {
        temporizador = setTimeout(() => reject(new Error("La conexión tardó demasiado. Verifica tu internet.")), ms);
    });
    return Promise.race([promesa, limite]).finally(() => clearTimeout(temporizador));
}

function mostrarToast(mensaje, tipo = "info") {
    const toast = document.createElement('div');
    toast.className = `toast ${tipo}`;
    const icono = tipo === "success" ? "✅" : tipo === "error" ? "⚠️" : "ℹ️";
    const spanIcono = document.createElement('span');
    spanIcono.textContent = icono;
    const spanTexto = document.createElement('span');
    spanTexto.textContent = mensaje;   // textContent: nunca interpreta HTML
    toast.append(spanIcono, spanTexto);
    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transition = "opacity 0.3s";
        setTimeout(() => toast.remove(), 300);
    }, 3800);
}

function setEstadoConexion(estado, texto) {
    statusDot.className = `status-dot ${estado}`;
    statusText.textContent = texto;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str ?? "");
    return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Dinero: se calcula en centavos para evitar errores de decimales (0.1 + 0.2).
const centavos = (n) => Math.round(Number(n) * 100);
const formatoMoneda = (n) => `L. ${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function generarUuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = [...crypto.getRandomValues(new Uint8Array(16))];
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = b.map(x => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function buscarProducto(id) {
    return baseDeDatosProductos.find(p => String(p.id) === String(id));
}

function abrirModal(modal) { modal.classList.add('visible'); }
function cerrarModal(modal) { modal.classList.remove('visible'); }

document.querySelectorAll('[data-cerrar]').forEach(btn => {
    btn.addEventListener('click', () => cerrarModal(document.getElementById(btn.dataset.cerrar)));
});
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cerrarModal(overlay); });
});

// ==========================================
// 2. CARGAR PRODUCTOS DESDE SUPABASE
// ==========================================
function guardarCatalogoEnCache() {
    try {
        localStorage.setItem(CLAVE_CACHE_CATALOGO, JSON.stringify({ fecha: Date.now(), productos: baseDeDatosProductos }));
    } catch (_) { /* almacenamiento no disponible: se ignora */ }
}

function leerCatalogoDeCache() {
    try {
        const c = JSON.parse(localStorage.getItem(CLAVE_CACHE_CATALOGO) || "null");
        return c && Array.isArray(c.productos) ? c : null;
    } catch (_) { return null; }
}

function setSinConexion(valor) {
    datosEnCache = valor;
    bannerOffline.classList.toggle('visible', valor);
    actualizarBotonPagar();
}

// silencioso:true → refresca los datos sin mostrar la pantalla de "Conectando..."
// (se usa para el tiempo real y después de cada venta, para que no parpadee).
async function cargarProductos({ silencioso = false } = {}) {
    if (!silencioso) {
        setEstadoConexion('warn', 'Conectando...');
        mostrarEstadoCargando();
    }

    try {
        const { data, error } = await conLimiteDeTiempo(
            sb.from('productos').select('*').order('nombre', { ascending: true })
        );
        if (error) throw error;

        baseDeDatosProductos = data || [];
        guardarCatalogoEnCache();
        setSinConexion(false);
        setEstadoConexion('ok', 'Servidor en línea');
        if (categoriaActiva !== 'todos' && !baseDeDatosProductos.some(p => categorizarProducto(p).id === categoriaActiva)) {
            categoriaActiva = 'todos';
        }
        renderizarChipsCategoria();
        renderizarCatalogo();
        sincronizarCarrito();
        refrescarEtiquetasSiAbierto();

    } catch (error) {
        console.error("Error al cargar productos de Supabase:", error);
        setEstadoConexion('err', 'Sin conexión');

        if (baseDeDatosProductos.length === 0) {
            const cache = leerCatalogoDeCache();
            if (cache) baseDeDatosProductos = cache.productos;
        }

        if (baseDeDatosProductos.length > 0) {
            setSinConexion(true);
            renderizarChipsCategoria();
            renderizarCatalogo();
        } else {
            mostrarEstadoError(error);
        }
    }
}

function mostrarEstadoCargando() {
    gridProductos.innerHTML = `
        <div class="state-card">
            <span class="spinner"></span>
            <p class="title">Conectando con el inventario...</p>
            <p class="sub">Esto solo toma un momento.</p>
        </div>
    `;
}

function mostrarEstadoError(error) {
    const detalle = error && error.message ? error.message : "Error desconocido";
    gridProductos.innerHTML = `
        <div class="state-card is-error">
            <span class="icon">⚠️</span>
            <p class="title">No se pudo cargar el inventario</p>
            <p class="sub">${escapeHtml(detalle)}</p>
            <button class="btn-retry" id="btn-reintentar">Reintentar</button>
        </div>
    `;
    document.getElementById('btn-reintentar')?.addEventListener('click', () => cargarProductos());
}

function renderizarChipsCategoria() {
    const presentes = new Set(baseDeDatosProductos.map(p => categorizarProducto(p).id));
    const chips = [
        { id: 'todos', etiqueta: 'Todos', color: null },
        ...TODAS_LAS_CATEGORIAS.filter(c => presentes.has(c.id))
    ];

    categoriaChips.innerHTML = chips.map(c => `
        <button
            class="chip-categoria ${categoriaActiva === c.id ? 'activo' : ''}"
            style="${c.color ? `--chip-color:${c.color};` : ''}"
            data-categoria="${escapeHtml(c.id)}"
            aria-pressed="${categoriaActiva === c.id}"
        >
            ${c.color ? '<span class="punto"></span>' : ''}
            ${escapeHtml(c.etiqueta)}
        </button>
    `).join('');
}

categoriaChips.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-categoria]');
    if (!chip) return;
    categoriaActiva = chip.dataset.categoria;
    renderizarChipsCategoria();
    renderizarCatalogo();
});

// ==========================================
// 3. RENDERIZAR CATÁLOGO Y CARRITO
// ==========================================
function productosFiltrados() {
    const filtro = normalizar(terminoBusqueda.trim());

    let productos = baseDeDatosProductos;
    if (categoriaActiva !== 'todos') {
        productos = productos.filter(p => categorizarProducto(p).id === categoriaActiva);
    }
    if (filtro) {
        productos = productos.filter(p =>
            normalizar(p.nombre).includes(filtro) ||
            (p.codigo_barras && normalizar(p.codigo_barras).includes(filtro))
        );
    }
    return productos;
}

function renderizarCatalogo() {
    const productos = productosFiltrados();

    contadorProductos.textContent = `${baseDeDatosProductos.length} artículo${baseDeDatosProductos.length === 1 ? '' : 's'}`;

    if (baseDeDatosProductos.length === 0) {
        gridProductos.innerHTML = `
            <div class="state-card">
                <span class="icon">📦</span>
                <p class="title">No hay productos en la base de datos.</p>
                <p class="sub">Usa "Modo inventario" para agregar el primer artículo.</p>
            </div>
        `;
        return;
    }

    if (productos.length === 0) {
        gridProductos.innerHTML = `
            <div class="state-card">
                <span class="icon">🔍</span>
                <p class="title">Sin resultados para "${escapeHtml(terminoBusqueda)}"</p>
                <p class="sub">Intenta con otro término de búsqueda.</p>
            </div>
        `;
        return;
    }

    gridProductos.innerHTML = productos.map(prod => {
        const agotado = prod.stock <= 0;
        const stockBajo = prod.stock > 0 && prod.stock <= UMBRAL_STOCK_BAJO;
        const idAttr = escapeHtml(prod.id);
        const cat = categorizarProducto(prod);
        return `
        <div class="prod-card ${agotado ? 'agotado' : ''}" style="--cat-color:${cat.color};">
            <button class="btn-edit-prod" data-accion="editar" data-id="${idAttr}" title="Editar artículo">✏️</button>
            <div>
                <span class="prod-sello"><span class="punto"></span>${escapeHtml(cat.etiqueta)}</span>
                <h3 class="prod-name">${escapeHtml(prod.nombre)}</h3>
                <p class="prod-stock ${stockBajo ? 'low' : ''}">${agotado ? 'Agotado' : `Disponible: ${prod.stock} uds`}</p>
                ${prod.codigo_barras ? `<p class="prod-barcode">🏷️ ${escapeHtml(prod.codigo_barras)}</p>` : ''}
            </div>
            <div class="prod-foot">
                <span class="prod-price">${formatoMoneda(prod.precio)}</span>
                <button
                    data-accion="agregar" data-id="${idAttr}"
                    class="btn-add"
                    ${agotado ? 'disabled' : ''}
                >
                    ${agotado ? 'Agotado' : '+ Agregar'}
                </button>
            </div>
        </div>
        `;
    }).join('');
}

gridProductos.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-accion]');
    if (!btn) return;
    if (btn.dataset.accion === 'agregar') agregarAlCarrito(btn.dataset.id);
    if (btn.dataset.accion === 'editar') abrirEdicionProducto(btn.dataset.id);
});

// Devuelve true si se agregó una unidad al carrito.
function agregarAlCarrito(id) {
    const producto = buscarProducto(id);
    if (!producto) return false;

    if (producto.stock <= 0) {
        mostrarToast("Este producto no tiene stock disponible.", "error");
        return false;
    }

    const itemEnCarrito = carrito.find(item => String(item.id) === String(producto.id));
    if (itemEnCarrito) {
        if (itemEnCarrito.cantidad >= producto.stock) {
            mostrarToast("No hay más unidades disponibles en inventario.", "error");
            return false;
        }
        itemEnCarrito.cantidad++;
    } else {
        carrito.push({ ...producto, cantidad: 1 });
    }

    actualizarInterfazCarrito();
    return true;
}

function cambiarCantidad(id, cambio) {
    const item = carrito.find(i => String(i.id) === String(id));
    if (!item) return;

    const productoOriginal = buscarProducto(id);

    item.cantidad += cambio;

    if (productoOriginal && item.cantidad > productoOriginal.stock) {
        mostrarToast("Límite de stock alcanzado.", "error");
        item.cantidad = productoOriginal.stock;
    }

    if (item.cantidad <= 0) {
        carrito = carrito.filter(i => String(i.id) !== String(id));
    }

    actualizarInterfazCarrito();
}

carritoItems.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-cambio]');
    if (!btn) return;
    cambiarCantidad(btn.dataset.id, parseInt(btn.dataset.cambio, 10));
});

function vaciarCarrito() {
    if (carrito.length === 0) return;
    if (!confirm("¿Vaciar todo el carrito?")) return;
    carrito = [];
    actualizarInterfazCarrito();
}

function totalCarrito() {
    return carrito.reduce((suma, item) => suma + centavos(item.precio) * item.cantidad, 0) / 100;
}

function actualizarBotonPagar() {
    btnPagar.disabled = carrito.length === 0 || datosEnCache || procesandoVenta;
}

// Cuando llegan datos nuevos (tiempo real), el carrito se ajusta a los precios y
// existencias actuales para no vender con un precio viejo.
function sincronizarCarrito() {
    if (carrito.length === 0) return;
    let huboCambios = false;

    carrito = carrito.reduce((nuevo, item) => {
        const actual = buscarProducto(item.id);
        if (!actual || actual.stock <= 0) { huboCambios = true; return nuevo; }
        const cantidad = Math.min(item.cantidad, actual.stock);
        if (cantidad !== item.cantidad || centavos(actual.precio) !== centavos(item.precio) || actual.nombre !== item.nombre) {
            huboCambios = true;
        }
        nuevo.push({ ...actual, cantidad });
        return nuevo;
    }, []);

    if (huboCambios) mostrarToast("El carrito se ajustó a precios o existencias actualizados.", "info");
    actualizarInterfazCarrito();
}

function actualizarInterfazCarrito() {
    actualizarBotonPagar();

    if (carrito.length === 0) {
        carritoItems.innerHTML = `
            <div class="cart-empty">
                <span class="icon">🛍️</span>
                <p style="font-weight:600;">El carrito está vacío.</p>
                <p>Toca "Agregar" en cualquier artículo.</p>
            </div>
        `;
        cartTotal.textContent = formatoMoneda(0);
        return;
    }

    carritoItems.innerHTML = carrito.map(item => `
        <div class="cart-item">
            <div class="cart-item-info">
                <h4>${escapeHtml(item.nombre)}</h4>
                <span>${formatoMoneda(item.precio)} c/u</span>
            </div>
            <div class="qty-controls">
                <button data-id="${escapeHtml(item.id)}" data-cambio="-1" class="qty-btn" aria-label="Quitar uno">−</button>
                <span class="qty-val">${item.cantidad}</span>
                <button data-id="${escapeHtml(item.id)}" data-cambio="1" class="qty-btn" aria-label="Agregar uno">+</button>
            </div>
        </div>
    `).join('');

    cartTotal.textContent = formatoMoneda(totalCarrito());
}

// ==========================================
// 4. BUSCADOR (y lector de códigos USB / Bluetooth)
// ==========================================
buscador.addEventListener('input', (e) => {
    terminoBusqueda = e.target.value;
    renderizarCatalogo();
});

// Los lectores de código de barras USB/Bluetooth "escriben" el código y pulsan Enter.
// Si el texto coincide exacto con el código de un artículo, se agrega al carrito.
buscador.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const texto = buscador.value.trim();
    if (!texto) return;
    e.preventDefault();

    const codigo = normalizar(texto);
    const exacto = baseDeDatosProductos.find(p => p.codigo_barras && normalizar(p.codigo_barras) === codigo);

    if (exacto) {
        if (agregarAlCarrito(exacto.id)) mostrarToast(`${exacto.nombre} agregado.`, "success");
        buscador.value = "";
        terminoBusqueda = "";
        renderizarCatalogo();
        return;
    }

    if (productosFiltrados().length === 0) {
        mostrarToast(`No hay artículos para "${texto}".`, "error");
    }
});

btnVaciar.addEventListener('click', vaciarCarrito);

// ==========================================
// 5. MODO INVENTARIO (login de administrador + CRUD de productos)
// ==========================================
// Ahora se entra con una cuenta real de Supabase Auth. La contraseña ya no vive
// en el código, y la base de datos rechaza escrituras de quien no haya iniciado sesión.
function aplicarModoAdmin(activo) {
    modoAdmin = activo;
    document.body.classList.toggle('modo-admin', activo);
    btnAdminToggle.textContent = activo ? "🔓 Salir de inventario" : "🔒 Modo inventario";
    const visibilidad = activo ? "inline-flex" : "none";
    btnNuevoProducto.style.display = visibilidad;
    btnReportes.style.display = visibilidad;
    btnVentas.style.display = visibilidad;
    btnEtiquetas.style.display = visibilidad;
    if (!activo) cerrarModal(modalEtiquetas);
}

sb.auth.onAuthStateChange((_evento, sesion) => {
    aplicarModoAdmin(!!sesion);
});

btnAdminToggle.addEventListener('click', async () => {
    if (modoAdmin) {
        await sb.auth.signOut();
        mostrarToast("Saliste del modo inventario.", "info");
        return;
    }
    errorPassword.classList.remove('visible');
    inputPassword.value = "";
    abrirModal(modalPassword);
    setTimeout(() => (inputEmail.value ? inputPassword : inputEmail).focus(), 50);
});

function mostrarErrorLogin(texto) {
    errorPassword.textContent = texto;
    errorPassword.classList.add('visible');
}

async function intentarEntrarModoAdmin() {
    const email = inputEmail.value.trim();
    const password = inputPassword.value;

    if (!email || !password) {
        mostrarErrorLogin("Escribe tu correo y tu contraseña.");
        return;
    }

    btnConfirmarPassword.disabled = true;
    btnConfirmarPassword.textContent = "Entrando...";
    errorPassword.classList.remove('visible');

    try {
        const { error } = await conLimiteDeTiempo(sb.auth.signInWithPassword({ email, password }));
        if (error) throw error;
        inputPassword.value = "";
        cerrarModal(modalPassword);
        mostrarToast("Modo inventario activado.", "success");
    } catch (error) {
        const credencialesMalas = /invalid login|invalid_credentials/i.test(`${error.message} ${error.code || ''}`);
        mostrarErrorLogin(credencialesMalas ? "Correo o contraseña incorrectos." : `No se pudo iniciar sesión: ${error.message}`);
    } finally {
        btnConfirmarPassword.disabled = false;
        btnConfirmarPassword.textContent = "Entrar";
    }
}

btnConfirmarPassword.addEventListener('click', intentarEntrarModoAdmin);
[inputEmail, inputPassword].forEach(input => {
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') intentarEntrarModoAdmin(); });
});

// ---- Categoría en el formulario de producto ----
let categoriaElegidaAMano = false;

function poblarSelectCategorias() {
    inputCategoria.innerHTML = TODAS_LAS_CATEGORIAS
        .map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.etiqueta)}</option>`)
        .join('');
}

inputCategoria.addEventListener('change', () => { categoriaElegidaAMano = true; });
inputNombre.addEventListener('input', () => {
    // Mientras nadie elija la categoría a mano, se sugiere según el nombre.
    if (!categoriaElegidaAMano) inputCategoria.value = adivinarCategoriaPorNombre(inputNombre.value).id;
});

btnNuevoProducto.addEventListener('click', () => abrirNuevoProducto());

function abrirNuevoProducto() {
    tituloModalProducto.textContent = "Nuevo artículo";
    errorProducto.classList.remove('visible');
    inputIdOriginal.value = "";
    inputNombre.value = "";
    inputPrecio.value = "";
    inputStock.value = "";
    inputCodigoBarras.value = "";
    inputCategoria.value = "general";
    categoriaElegidaAMano = false;
    actualizarVistaPreviaEtiqueta();
    btnEliminarProducto.style.display = "none";
    inputNombre.disabled = false;
    abrirModal(modalProducto);
    setTimeout(() => inputNombre.focus(), 50);
}

function abrirEdicionProducto(id) {
    const producto = buscarProducto(id);
    if (!producto) return;

    tituloModalProducto.textContent = "Editar artículo";
    errorProducto.classList.remove('visible');
    inputIdOriginal.value = producto.id;
    inputNombre.value = producto.nombre;
    inputPrecio.value = producto.precio;
    inputStock.value = producto.stock;
    inputCodigoBarras.value = producto.codigo_barras || "";
    inputCategoria.value = categorizarProducto(producto).id;
    categoriaElegidaAMano = true;
    actualizarVistaPreviaEtiqueta();
    btnEliminarProducto.style.display = "inline-block";
    inputNombre.disabled = false;
    abrirModal(modalProducto);
}

// Con RLS, una escritura sin permiso puede "tener éxito" sin tocar ninguna fila.
// Por eso se pide la fila de vuelta (.select()) y se verifica que sí cambió algo.
function errorSinPermiso() {
    return Object.assign(new Error("No tienes permiso para esto. Vuelve a iniciar sesión en Modo inventario."), { sinPermiso: true });
}

function mensajeErrorGuardado(error) {
    if (error.code === '23505') {
        return /codigo_barras/i.test(error.message || '')
            ? "Ya existe un artículo con ese código de barras."
            : "Ya existe un artículo con ese nombre.";
    }
    if (error.sinPermiso || error.code === '42501') {
        return "No tienes permiso para guardar. Vuelve a iniciar sesión en Modo inventario.";
    }
    return `Error: ${error.message}`;
}

btnGuardarProducto.addEventListener('click', async () => {
    const nombre = inputNombre.value.trim();
    const precio = parseFloat(inputPrecio.value);
    const stock = parseInt(inputStock.value, 10);
    const codigoBarras = inputCodigoBarras.value.trim() || null;
    const categoria = inputCategoria.value || 'general';
    const idOriginal = inputIdOriginal.value;

    if (!nombre) {
        errorProducto.textContent = "El nombre es obligatorio.";
        errorProducto.classList.add('visible');
        return;
    }
    if (isNaN(precio) || precio < 0) {
        errorProducto.textContent = "El precio debe ser un número válido.";
        errorProducto.classList.add('visible');
        return;
    }
    if (isNaN(stock) || stock < 0) {
        errorProducto.textContent = "La cantidad debe ser un número válido.";
        errorProducto.classList.add('visible');
        return;
    }

    btnGuardarProducto.disabled = true;
    btnGuardarProducto.textContent = "Guardando...";

    const datos = { nombre, precio, stock, codigo_barras: codigoBarras, categoria };

    try {
        if (idOriginal) {
            const { data, error } = await conLimiteDeTiempo(
                sb.from('productos').update(datos).eq('id', idOriginal).select()
            );
            if (error) throw error;
            if (!data || data.length === 0) throw errorSinPermiso();
            mostrarToast("Artículo actualizado.", "success");
        } else {
            const { data, error } = await conLimiteDeTiempo(
                sb.from('productos').insert([datos]).select()
            );
            if (error) throw error;
            if (!data || data.length === 0) throw errorSinPermiso();
            mostrarToast("Artículo agregado.", "success");
        }

        cerrarModal(modalProducto);
        await cargarProductos({ silencioso: true });

    } catch (error) {
        console.error("Error al guardar producto:", error);
        errorProducto.textContent = mensajeErrorGuardado(error);
        errorProducto.classList.add('visible');
    } finally {
        btnGuardarProducto.disabled = false;
        btnGuardarProducto.textContent = "Guardar";
    }
});

btnEliminarProducto.addEventListener('click', async () => {
    const idOriginal = inputIdOriginal.value;
    if (!idOriginal) return;
    if (!confirm(`¿Eliminar "${inputNombre.value}" del inventario? Esta acción no se puede deshacer.`)) return;

    try {
        const { data, error } = await conLimiteDeTiempo(
            sb.from('productos').delete().eq('id', idOriginal).select()
        );
        if (error) throw error;
        if (!data || data.length === 0) throw errorSinPermiso();
        mostrarToast("Artículo eliminado.", "success");
        cerrarModal(modalProducto);
        await cargarProductos({ silencioso: true });
    } catch (error) {
        console.error("Error al eliminar producto:", error);
        mostrarToast(`No se pudo eliminar: ${error.message}`, "error");
    }
});

// ==========================================
// 6. COBRAR Y PROCESAR LA VENTA
// ==========================================
// Toda la venta se procesa en el servidor con UNA función (procesar_venta):
//  - usa el precio de la base de datos, no el que manda el navegador,
//  - revisa el stock y descuenta con bloqueo (dos cajas no pueden vender la misma unidad),
//  - registra la venta en ventas_log,
//  - todo o nada: si algo falla, no se descuenta ni se registra nada.
// Además usa un identificador de venta: si se corta el internet y se reintenta,
// la venta no se duplica.
let ventaPendiente = null;      // { firma, id }
let totalEnCobroCentavos = 0;

function firmaDelCarrito() {
    return carrito.map(i => `${i.id}:${i.cantidad}`).sort().join('|');
}

function abrirCobro() {
    if (carrito.length === 0 || datosEnCache || procesandoVenta) return;

    const firma = firmaDelCarrito();
    if (!ventaPendiente || ventaPendiente.firma !== firma) {
        ventaPendiente = { firma, id: generarUuid() };
    }

    const total = totalCarrito();
    totalEnCobroCentavos = centavos(total);
    cobroTotalEl.textContent = formatoMoneda(total);
    inputRecibido.value = "";
    errorCobro.classList.remove('visible');
    cobroFormulario.style.display = "block";
    cobroResultado.style.display = "none";

    // Atajos de monto: "Exacto" y los billetes más cercanos que alcanzan para pagar.
    const billetes = [20, 50, 100, 500].filter(b => b >= total).slice(0, 3);
    const atajos = billetes.length ? billetes : [Math.ceil(total / 500) * 500];
    cobroRapidos.innerHTML =
        `<button type="button" class="btn-rapido" data-monto="${total.toFixed(2)}">Exacto</button>` +
        atajos.map(b => `<button type="button" class="btn-rapido" data-monto="${b}">${formatoMoneda(b)}</button>`).join('');

    actualizarCambio();
    abrirModal(modalCobro);
    setTimeout(() => inputRecibido.focus(), 50);
}

function montoRecibidoEnCentavos() {
    if (inputRecibido.value.trim() === "") return null;
    const valor = parseFloat(inputRecibido.value);
    return isNaN(valor) || valor < 0 ? NaN : centavos(valor);
}

function actualizarCambio() {
    const recibido = montoRecibidoEnCentavos();
    cobroCambio.classList.remove('falta');

    if (recibido === null || isNaN(recibido)) {
        cobroCambioEtiqueta.textContent = "Cambio";
        cobroCambioValor.textContent = "—";
    } else if (recibido >= totalEnCobroCentavos) {
        cobroCambioEtiqueta.textContent = "Cambio";
        cobroCambioValor.textContent = formatoMoneda((recibido - totalEnCobroCentavos) / 100);
    } else {
        cobroCambioEtiqueta.textContent = "Falta";
        cobroCambioValor.textContent = formatoMoneda((totalEnCobroCentavos - recibido) / 100);
        cobroCambio.classList.add('falta');
    }
}

inputRecibido.addEventListener('input', actualizarCambio);
inputRecibido.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmarCobro(); });
cobroRapidos.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-monto]');
    if (!btn) return;
    inputRecibido.value = btn.dataset.monto;
    actualizarCambio();
});

function mostrarResultadoCobro(fila, recibidoCentavos) {
    const total = Number(fila.total);
    const totalC = centavos(total);

    resTotal.textContent = formatoMoneda(total);
    resAviso.style.display = "none";

    if (recibidoCentavos === null) {
        resRecibido.textContent = "—";
        resCambio.textContent = "—";
    } else {
        resRecibido.textContent = formatoMoneda(recibidoCentavos / 100);
        resCambio.textContent = recibidoCentavos >= totalC
            ? formatoMoneda((recibidoCentavos - totalC) / 100)
            : `Falta ${formatoMoneda((totalC - recibidoCentavos) / 100)}`;
    }

    if (totalC !== totalEnCobroCentavos) {
        resAviso.textContent = "Un precio cambió mientras vendías: el total real es el que se muestra aquí.";
        resAviso.style.display = "block";
    }

    cobroFormulario.style.display = "none";
    cobroResultado.style.display = "block";
}

async function confirmarCobro() {
    if (procesandoVenta || carrito.length === 0) return;

    const recibido = montoRecibidoEnCentavos();
    if (Number.isNaN(recibido)) {
        errorCobro.textContent = "El monto recibido no es válido.";
        errorCobro.classList.add('visible');
        return;
    }
    if (recibido !== null && recibido < totalEnCobroCentavos) {
        errorCobro.textContent = "El monto recibido es menor que el total.";
        errorCobro.classList.add('visible');
        return;
    }

    errorCobro.classList.remove('visible');
    procesandoVenta = true;
    actualizarBotonPagar();
    btnConfirmarCobro.disabled = true;
    btnConfirmarCobro.textContent = "Procesando...";

    try {
        const items = carrito.map(i => ({ producto_id: i.id, cantidad: i.cantidad }));
        const { data, error } = await conLimiteDeTiempo(
            sb.rpc('procesar_venta', { p_items: items, p_venta_id: ventaPendiente?.id ?? null })
        );
        if (error) throw error;

        const fila = Array.isArray(data) ? data[0] : data;

        if (!fila || !fila.exito) {
            // Nada se vendió ni se descontó. Se actualiza el inventario para ver la existencia real.
            errorCobro.textContent = fila?.motivo || "No se pudo procesar la venta.";
            errorCobro.classList.add('visible');
            await cargarProductos({ silencioso: true });
            return;
        }

        carrito = [];
        ventaPendiente = null;
        actualizarInterfazCarrito();
        mostrarResultadoCobro(fila, recibido);
        await cargarProductos({ silencioso: true });

    } catch (error) {
        console.error("Error al procesar la venta:", error);
        errorCobro.textContent = `No se pudo confirmar la venta: ${error.message}. Puedes volver a intentar sin riesgo de cobrarla dos veces.`;
        errorCobro.classList.add('visible');
    } finally {
        procesandoVenta = false;
        btnConfirmarCobro.disabled = false;
        btnConfirmarCobro.textContent = "Confirmar venta";
        actualizarBotonPagar();
    }
}

btnPagar.addEventListener('click', abrirCobro);
btnConfirmarCobro.addEventListener('click', confirmarCobro);

// ==========================================
// 6b. VENTAS RECIENTES Y ANULACIÓN (solo administrador)
// ==========================================
btnVentas.addEventListener('click', () => {
    abrirModal(modalVentas);
    cargarVentasRecientes();
});

async function cargarVentasRecientes() {
    listaVentas.innerHTML = `<p class="reporte-vacio">Cargando...</p>`;

    try {
        const { data, error } = await conLimiteDeTiempo(
            sb.from('ventas_log')
                .select('venta_id, nombre, cantidad, total_venta, creado_en, anulada')
                .not('venta_id', 'is', null)
                .order('creado_en', { ascending: false })
                .limit(150)
        );
        if (error) throw error;

        const ventas = new Map();
        (data || []).forEach(fila => {
            if (!ventas.has(fila.venta_id)) {
                ventas.set(fila.venta_id, { id: fila.venta_id, fecha: fila.creado_en, total: fila.total_venta, anulada: fila.anulada, items: [] });
            }
            ventas.get(fila.venta_id).items.push(`${fila.cantidad}× ${fila.nombre}`);
        });

        const lista = [...ventas.values()].slice(0, 20);

        if (lista.length === 0) {
            listaVentas.innerHTML = `<p class="reporte-vacio">Todavía no hay ventas registradas.</p>`;
            return;
        }

        listaVentas.innerHTML = lista.map(v => {
            const fecha = new Date(v.fecha).toLocaleString('es-HN', { dateStyle: 'short', timeStyle: 'short' });
            return `
            <div class="venta-card ${v.anulada ? 'anulada' : ''}">
                <div class="cab"><span>${escapeHtml(fecha)}</span><span>${formatoMoneda(v.total)}</span></div>
                <div class="det">${escapeHtml(v.items.join(' · '))}</div>
                <div class="pie">
                    ${v.anulada
                        ? `<span class="etiqueta-anulada">Anulada</span>`
                        : `<span></span><button class="btn-anular" data-venta="${escapeHtml(v.id)}">Anular venta</button>`}
                </div>
            </div>`;
        }).join('');
    } catch (error) {
        console.error("Error al cargar ventas recientes:", error);
        listaVentas.innerHTML = `<p class="reporte-vacio">No se pudieron cargar las ventas. ¿Iniciaste sesión y ejecutaste supabase/migracion.sql?</p>`;
    }
}

listaVentas.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-venta]');
    if (!btn) return;
    if (!confirm("¿Anular esta venta? Las unidades vuelven al inventario.")) return;

    btn.disabled = true;
    try {
        const { data, error } = await conLimiteDeTiempo(sb.rpc('anular_venta', { p_venta_id: btn.dataset.venta }));
        if (error) throw error;
        const fila = Array.isArray(data) ? data[0] : data;
        if (!fila || !fila.exito) throw new Error(fila?.motivo || "No se pudo anular.");
        mostrarToast("Venta anulada. El stock se devolvió.", "success");
        await cargarVentasRecientes();
        await cargarProductos({ silencioso: true });
    } catch (error) {
        mostrarToast(`No se pudo anular: ${error.message}`, "error");
        btn.disabled = false;
    }
});

// ==========================================
// 7. ESCÁNER DE CÓDIGO DE BARRAS (cámara)
// ==========================================
// Dos modos:
//  - 'venta': se usa desde el catálogo. Al leer un código, si coincide con
//    un producto, se agrega directo al carrito (venta rápida en caja).
//  - 'producto': se usa desde el modal de inventario, solo llena el campo
//    de código de barras con lo que lea la cámara.
let lectorHtml5Qrcode = null;
let modoEscaneo = null;
let escaneoBloqueado = false;

async function iniciarEscaneo(modo) {
    modoEscaneo = modo;
    escaneoBloqueado = false;
    scannerStatus.textContent = "";
    scannerStatus.className = "scanner-status";

    if (modo === 'venta') {
        tituloModalScanner.textContent = "📷 Escanear para vender";
        subtituloModalScanner.textContent = "Apunta la cámara al código del producto para agregarlo al carrito.";
    } else {
        tituloModalScanner.textContent = "📷 Escanear código";
        subtituloModalScanner.textContent = "Apunta la cámara al código impreso para usarlo en este artículo.";
    }

    abrirModal(modalScanner);

    if (typeof Html5Qrcode === 'undefined') {
        scannerStatus.textContent = "No se pudo cargar el lector de cámara. Verifica tu conexión a internet.";
        scannerStatus.className = "scanner-status notfound";
        return;
    }

    lectorHtml5Qrcode = new Html5Qrcode("lector-camara");
    try {
        await lectorHtml5Qrcode.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 250, height: 150 } },
            (textoDecodificado) => manejarCodigoDetectado(textoDecodificado),
            () => { /* se ignoran los frames sin código detectado */ }
        );
    } catch (err) {
        console.error("Error al iniciar la cámara:", err);
        scannerStatus.textContent = "No se pudo acceder a la cámara. Revisa los permisos del navegador.";
        scannerStatus.className = "scanner-status notfound";
    }
}

async function detenerEscaneo() {
    if (!lectorHtml5Qrcode) return;
    const lector = lectorHtml5Qrcode;
    lectorHtml5Qrcode = null;
    try {
        const estado = lector.getState();
        if (estado === Html5QrcodeScannerState.SCANNING || estado === Html5QrcodeScannerState.PAUSED) {
            await lector.stop();
        }
        lector.clear();
    } catch (err) {
        console.warn("Error al detener la cámara:", err);
    }
}

function manejarCodigoDetectado(codigo) {
    if (escaneoBloqueado) return;

    if (modoEscaneo === 'producto') {
        escaneoBloqueado = true;
        inputCodigoBarras.value = codigo;
        actualizarVistaPreviaEtiqueta();
        cerrarModal(modalScanner);
        detenerEscaneo();
        mostrarToast("Código capturado.", "success");
        return;
    }

    // Modo venta: buscar el producto por su código y agregarlo al carrito
    const producto = baseDeDatosProductos.find(p => p.codigo_barras === codigo);

    if (!producto) {
        scannerStatus.textContent = `Código "${codigo}" no reconocido.`;
        scannerStatus.className = "scanner-status notfound";
        return;
    }

    escaneoBloqueado = true;
    if (agregarAlCarrito(producto.id)) {
        scannerStatus.textContent = `✅ ${producto.nombre} agregado al carrito.`;
        scannerStatus.className = "scanner-status found";
    } else {
        scannerStatus.textContent = `${producto.nombre}: no hay más unidades disponibles.`;
        scannerStatus.className = "scanner-status notfound";
    }

    // Pequeña pausa para no leer el mismo código varias veces seguidas
    setTimeout(() => {
        escaneoBloqueado = false;
        scannerStatus.textContent = "";
        scannerStatus.className = "scanner-status";
    }, 1200);
}

btnEscanearVenta.addEventListener('click', () => iniciarEscaneo('venta'));
btnEscanearCodigoProducto.addEventListener('click', () => iniciarEscaneo('producto'));
document.getElementById('btn-cerrar-scanner')?.addEventListener('click', detenerEscaneo);
modalScanner.addEventListener('click', (e) => { if (e.target === modalScanner) detenerEscaneo(); });

// ==========================================
// 8. GENERAR CÓDIGO PROPIO Y ETIQUETA IMPRIMIBLE
// ==========================================
function generarCodigoUnico() {
    let codigo;
    do {
        const marcaTiempo = Date.now().toString(36).toUpperCase();
        const sufijo = Math.floor(10 + Math.random() * 90);
        codigo = `AG-${marcaTiempo}${sufijo}`;
    } while (baseDeDatosProductos.some(p => p.codigo_barras === codigo));
    return codigo;
}

function actualizarVistaPreviaEtiqueta() {
    const codigo = inputCodigoBarras.value.trim();
    if (!codigo || typeof JsBarcode === 'undefined') {
        etiquetaPreview.style.display = "none";
        return;
    }
    try {
        JsBarcode("#svg-etiqueta", codigo, {
            format: "CODE128", width: 2, height: 50, fontSize: 14, margin: 6
        });
        etiquetaPreview.style.display = "block";
    } catch (err) {
        etiquetaPreview.style.display = "none";
    }
}

btnGenerarCodigo.addEventListener('click', () => {
    inputCodigoBarras.value = generarCodigoUnico();
    actualizarVistaPreviaEtiqueta();
});

inputCodigoBarras.addEventListener('input', actualizarVistaPreviaEtiqueta);

// La etiqueta se imprime con el SVG que ya está dibujado en la vista previa,
// así no depende de volver a descargar nada de internet.
btnImprimirEtiqueta.addEventListener('click', () => {
    const codigo = inputCodigoBarras.value.trim();
    if (!codigo) return;

    actualizarVistaPreviaEtiqueta();
    const svg = document.getElementById('svg-etiqueta');
    if (!svg || etiquetaPreview.style.display === "none") {
        mostrarToast("No se pudo generar la etiqueta con ese código.", "error");
        return;
    }

    const nombre = inputNombre.value.trim() || "Artículo";
    const precio = parseFloat(inputPrecio.value) || 0;

    const ventana = window.open('', '_blank', 'width=420,height=320');
    if (!ventana) {
        mostrarToast("El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes.", "error");
        return;
    }

    ventana.document.write(`
        <html>
        <head><title>Etiqueta - ${escapeHtml(nombre)}</title></head>
        <body style="font-family: sans-serif; text-align:center; margin:0; padding:18px;">
            <div style="font-weight:700; font-size:14px; margin-bottom:4px;">${escapeHtml(nombre)}</div>
            <div style="font-weight:700; font-size:13px; margin-bottom:10px;">${formatoMoneda(precio)}</div>
            ${svg.outerHTML}
            <script>
                window.onload = () => setTimeout(() => window.print(), 300);
            <\/script>
        </body>
        </html>
    `);
    ventana.document.close();
});

// ==========================================
// 9. TIEMPO REAL — la app se actualiza sola
// ==========================================
// Escucha cualquier cambio (insert/update/delete) en la tabla "productos",
// venga de donde venga (la app, Supabase directo, otro dispositivo, etc.)
// y refresca el catálogo en silencio, sin pantalla de carga y sin que el usuario recargue.
let refrescoPendiente = null;
function refrescarConDebounce() {
    // Si llegan varios cambios casi juntos (ej. una venta con varios artículos),
    // esperamos un poquito y hacemos un solo refresco en vez de varios seguidos.
    clearTimeout(refrescoPendiente);
    refrescoPendiente = setTimeout(() => cargarProductos({ silencioso: true }), 400);
}

let yaSeSuscribio = false;
function suscribirCambiosEnTiempoReal() {
    sb
        .channel('productos-en-vivo')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'productos' },
            () => refrescarConDebounce()
        )
        .subscribe((estado) => {
            if (estado === 'SUBSCRIBED') {
                // Si es una reconexión, se recupera lo que pasó mientras no había conexión.
                if (yaSeSuscribio) refrescarConDebounce();
                yaSeSuscribio = true;
                console.log('Tiempo real activo: la app se sincroniza sola con Supabase.');
            }
        });
}

window.addEventListener('online', () => cargarProductos({ silencioso: true }));

// ==========================================
// 10. REPORTES (exportar, más vendidos, stock bajo)
// ==========================================
// Los totales se calculan en el servidor (funciones mas_vendidos y resumen_ventas),
// así no hay límite de 1000 filas y se incluyen los ingresos.
const RANGOS_REPORTE = { semana: 7, mes: 30, 'año': 365 };
let periodoReporteActivo = 'semana';
let tokenReporte = 0;

btnReportes.addEventListener('click', () => {
    abrirModal(modalReportes);
    cargarStockBajo();
    seleccionarPeriodoReporte(periodoReporteActivo);
});

document.querySelectorAll('.tab-periodo').forEach(btn => {
    btn.addEventListener('click', () => seleccionarPeriodoReporte(btn.dataset.periodo));
});

function seleccionarPeriodoReporte(periodo) {
    periodoReporteActivo = periodo;
    document.querySelectorAll('.tab-periodo').forEach(btn => {
        btn.classList.toggle('activo', btn.dataset.periodo === periodo);
    });
    cargarMasVendidos(periodo);
}

async function cargarMasVendidos(periodo) {
    const token = ++tokenReporte;   // si se cambia de período rápido, solo vale la última respuesta
    resumenReporte.innerHTML = "";
    listaMasVendidos.innerHTML = `<p class="reporte-vacio">Cargando...</p>`;

    const dias = RANGOS_REPORTE[periodo] || 7;

    try {
        const [resumenRes, rankingRes] = await conLimiteDeTiempo(Promise.all([
            sb.rpc('resumen_ventas', { p_dias: dias }),
            sb.rpc('mas_vendidos', { p_dias: dias })
        ]));
        if (token !== tokenReporte) return;
        if (resumenRes.error) throw resumenRes.error;
        if (rankingRes.error) throw rankingRes.error;

        const resumen = (Array.isArray(resumenRes.data) ? resumenRes.data[0] : resumenRes.data) || { ventas: 0, unidades: 0, ingresos: 0 };
        resumenReporte.innerHTML = `
            <div class="resumen-item"><div class="n">${formatoMoneda(resumen.ingresos)}</div><div class="l">Ingresos</div></div>
            <div class="resumen-item"><div class="n">${Number(resumen.ventas)}</div><div class="l">Ventas</div></div>
            <div class="resumen-item"><div class="n">${Number(resumen.unidades)}</div><div class="l">Unidades</div></div>
        `;

        const ranking = rankingRes.data || [];
        if (ranking.length === 0) {
            listaMasVendidos.innerHTML = `<p class="reporte-vacio">Sin ventas registradas en este período.</p>`;
            return;
        }

        listaMasVendidos.innerHTML = ranking.map((item, i) => `
            <div class="fila-reporte">
                <span class="rank">#${i + 1}</span>
                <span class="nombre-reporte">${escapeHtml(item.nombre)}</span>
                <span class="valor-reporte">${Number(item.unidades)} uds · ${formatoMoneda(item.ingresos)}</span>
            </div>
        `).join('');
    } catch (error) {
        if (token !== tokenReporte) return;
        console.error("Error al cargar reportes:", error);
        resumenReporte.innerHTML = "";
        listaMasVendidos.innerHTML = `<p class="reporte-vacio">No se pudo cargar. Verifica que iniciaste sesión y que ejecutaste supabase/migracion.sql.</p>`;
    }
}

function cargarStockBajo() {
    const bajos = baseDeDatosProductos
        .filter(p => p.stock <= UMBRAL_STOCK_BAJO)
        .sort((a, b) => a.stock - b.stock);

    if (bajos.length === 0) {
        listaStockBajo.innerHTML = `<p class="reporte-vacio">Todo tu inventario está en buen nivel. 🎉</p>`;
        return;
    }

    listaStockBajo.innerHTML = bajos.map(p => `
        <div class="fila-reporte">
            <span class="nombre-reporte">${escapeHtml(p.nombre)}</span>
            <span class="valor-reporte ${p.stock === 0 ? 'agotado' : 'bajo'}">${p.stock === 0 ? 'Agotado' : `${p.stock} uds`}</span>
        </div>
    `).join('');
}

function exportarInventarioCSV() {
    if (baseDeDatosProductos.length === 0) {
        mostrarToast("No hay productos para exportar.", "error");
        return;
    }

    const encabezados = ["Nombre", "Categoria", "Precio", "Stock", "Codigo de barras"];
    const filas = baseDeDatosProductos.map(p => [p.nombre, categorizarProducto(p).etiqueta, p.precio, p.stock, p.codigo_barras || ""]);

    const escaparCelda = (valor) => {
        const texto = String(valor ?? "");
        return (texto.includes(",") || texto.includes('"') || texto.includes("\n"))
            ? `"${texto.replace(/"/g, '""')}"`
            : texto;
    };

    const csv = [encabezados, ...filas].map(fila => fila.map(escaparCelda).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const fecha = new Date().toISOString().slice(0, 10);

    const a = document.createElement('a');
    a.href = url;
    a.download = `inventario-${fecha}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    mostrarToast("Inventario exportado.", "success");
}

btnExportarInventario.addEventListener('click', exportarInventarioCSV);

// ==========================================
// 10b. ETIQUETAS DE CÓDIGOS DE BARRAS (hojas A4, 3 × 6 = 18 por hoja)
// ==========================================
// Usa el inventario que la app ya tiene cargado (y se actualiza solo con el tiempo real).
// Solo aparecen artículos con código de barras; los demás se listan en un aviso.
const COLUMNAS_ETIQUETA = 3;
const FILAS_ETIQUETA = 6;
const ETIQUETAS_POR_HOJA = COLUMNAS_ETIQUETA * FILAS_ETIQUETA;

let copiasEtiquetas = new Map();   // String(id) -> cantidad de copias a imprimir
let firmaCatalogoEtiquetas = "";

function productosConCodigo() {
    return baseDeDatosProductos.filter(p => p.codigo_barras);
}

function copiasDe(prod) {
    const clave = String(prod.id);
    if (!copiasEtiquetas.has(clave)) copiasEtiquetas.set(clave, 1);   // por defecto, 1 copia de cada uno
    return copiasEtiquetas.get(clave);
}

// Cambia solo si cambió algo que se ve en las etiquetas, para no re-dibujar por cada venta.
function calcularFirmaCatalogoEtiquetas() {
    return baseDeDatosProductos
        .map(p => `${p.id}|${p.nombre}|${p.precio}|${p.codigo_barras || ''}`)
        .join('\n');
}

function renderizarAvisoEtiquetas() {
    const sinCodigo = baseDeDatosProductos.filter(p => !p.codigo_barras);
    if (sinCodigo.length === 0) {
        etqAviso.style.display = "none";
        return;
    }
    etqAviso.style.display = "block";
    etqAviso.innerHTML = `⚠️ ${sinCodigo.length} producto(s) sin código de barras (no aparecen aquí): ` +
        sinCodigo.map(p => escapeHtml(p.nombre)).join(", ") +
        `. Edítalos (✏️) y usa "🎲 Generar" para darles un código.`;
}

function renderizarListaEtiquetas() {
    const filtro = normalizar(etqBuscador.value.trim());
    let lista = productosConCodigo();
    if (filtro) {
        lista = lista.filter(p => normalizar(p.nombre).includes(filtro) || normalizar(p.codigo_barras).includes(filtro));
    }

    if (lista.length === 0) {
        etqLista.innerHTML = `<p class="reporte-vacio" style="padding:14px;">${productosConCodigo().length === 0 ? 'Ningún artículo tiene código de barras todavía.' : 'Sin resultados.'}</p>`;
        return;
    }

    etqLista.innerHTML = lista.map(p => `
        <div class="etq-fila">
            <div class="info-prod">
                <div class="nombre-p">${escapeHtml(p.nombre)}</div>
                <div class="codigo-p">${escapeHtml(p.codigo_barras)}</div>
            </div>
            <div class="etq-stepper">
                <button type="button" data-etq-id="${escapeHtml(p.id)}" data-etq-delta="-1" aria-label="Quitar una etiqueta">−</button>
                <input type="number" min="0" value="${copiasDe(p)}" data-etq-input="${escapeHtml(p.id)}" aria-label="Copias de ${escapeHtml(p.nombre)}">
                <button type="button" data-etq-id="${escapeHtml(p.id)}" data-etq-delta="1" aria-label="Agregar una etiqueta">+</button>
            </div>
        </div>
    `).join('');
}

function actualizarHojasEtiquetas() {
    const items = [];
    productosConCodigo().forEach(p => {
        for (let i = 0; i < copiasDe(p); i++) items.push(p);
    });

    const total = items.length;
    const distintos = productosConCodigo().filter(p => copiasDe(p) > 0).length;
    etqInfoTotal.textContent = `${total} etiqueta${total === 1 ? '' : 's'} en total`;

    if (total === 0) {
        etqResumen.style.display = "none";
        etqHojas.innerHTML = `<p class="reporte-vacio" style="text-align:center; margin-top:20px;">Ajusta las cantidades con + y − para armar tu hoja de impresión.</p>`;
        return;
    }

    const numHojas = Math.ceil(total / ETIQUETAS_POR_HOJA);
    const libres = numHojas * ETIQUETAS_POR_HOJA - total;

    etqResumen.style.display = "block";
    etqResumen.innerHTML = `${total} etiqueta${total === 1 ? '' : 's'} de ${distintos} producto${distintos === 1 ? '' : 's'} distinto${distintos === 1 ? '' : 's'}
        → necesitas <strong>${numHojas} hoja${numHojas === 1 ? '' : 's'}</strong> A4 (${ETIQUETAS_POR_HOJA} etiquetas por hoja).
        ${libres > 0
            ? `En la última hoja quedan <span class="libre">${libres} espacio${libres === 1 ? '' : 's'} libre${libres === 1 ? '' : 's'}</span> — puedes subir cantidades para aprovecharlos.`
            : `La última hoja queda completamente llena.`}`;

    let html = "";
    for (let h = 0; h < numHojas; h++) {
        const grupo = items.slice(h * ETIQUETAS_POR_HOJA, (h + 1) * ETIQUETAS_POR_HOJA);
        html += `<div class="rotulo-hoja">Hoja ${h + 1} de ${numHojas}</div><div class="hoja-etq">`;
        for (let c = 0; c < ETIQUETAS_POR_HOJA; c++) {
            if (c < grupo.length) {
                const p = grupo[c];
                html += `
                    <div class="etq-etiqueta">
                        <div class="nombre">${escapeHtml(p.nombre)}</div>
                        <div class="precio">${formatoMoneda(p.precio)}</div>
                        <svg data-codigo="${escapeHtml(p.codigo_barras)}"></svg>
                    </div>`;
            } else {
                html += `<div class="etq-etiqueta vacia">Espacio libre</div>`;
            }
        }
        html += `</div>`;
    }
    etqHojas.innerHTML = html;

    if (typeof JsBarcode === 'undefined') {
        mostrarToast("No se pudo cargar el generador de códigos de barras. Verifica tu conexión.", "error");
        return;
    }
    etqHojas.querySelectorAll('svg[data-codigo]').forEach(svg => {
        try {
            JsBarcode(svg, svg.dataset.codigo, { format: "CODE128", width: 1.4, height: 34, fontSize: 9, margin: 2 });
        } catch (err) {
            console.warn("No se pudo generar el código", svg.dataset.codigo, err);
        }
    });
}

function renderizarTodoEtiquetas() {
    firmaCatalogoEtiquetas = calcularFirmaCatalogoEtiquetas();
    renderizarAvisoEtiquetas();
    renderizarListaEtiquetas();
    actualizarHojasEtiquetas();
}

function refrescarEtiquetasSiAbierto() {
    if (!modalEtiquetas.classList.contains('visible')) return;
    if (calcularFirmaCatalogoEtiquetas() === firmaCatalogoEtiquetas) return;
    renderizarTodoEtiquetas();
}

function fijarCopias(id, valor) {
    const n = parseInt(valor, 10);
    copiasEtiquetas.set(String(id), isNaN(n) || n < 0 ? 0 : Math.min(n, 999));
}

btnEtiquetas.addEventListener('click', () => {
    renderizarTodoEtiquetas();
    abrirModal(modalEtiquetas);
});

etqBuscador.addEventListener('input', renderizarListaEtiquetas);

etqLista.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-etq-delta]');
    if (!btn) return;
    const prod = buscarProducto(btn.dataset.etqId);
    if (!prod) return;
    fijarCopias(prod.id, copiasDe(prod) + parseInt(btn.dataset.etqDelta, 10));
    // Solo se actualiza el número de esa fila (la lista no se vuelve a dibujar).
    btn.parentElement.querySelector('input').value = copiasEtiquetas.get(String(prod.id));
    actualizarHojasEtiquetas();
});

etqLista.addEventListener('change', (e) => {
    const input = e.target.closest('input[data-etq-input]');
    if (!input) return;
    fijarCopias(input.dataset.etqInput, input.value);
    input.value = copiasEtiquetas.get(String(input.dataset.etqInput));
    actualizarHojasEtiquetas();
});

document.getElementById('etq-todo-uno').addEventListener('click', () => {
    productosConCodigo().forEach(p => copiasEtiquetas.set(String(p.id), 1));
    renderizarListaEtiquetas();
    actualizarHojasEtiquetas();
});
document.getElementById('etq-todo-cero').addEventListener('click', () => {
    productosConCodigo().forEach(p => copiasEtiquetas.set(String(p.id), 0));
    renderizarListaEtiquetas();
    actualizarHojasEtiquetas();
});

btnImprimirEtiquetas.addEventListener('click', () => {
    const total = productosConCodigo().reduce((suma, p) => suma + copiasDe(p), 0);
    if (total === 0) {
        mostrarToast("No hay etiquetas para imprimir. Sube alguna cantidad con +.", "error");
        return;
    }
    // Esta clase hace que, al imprimir, solo salgan las hojas de etiquetas.
    document.body.classList.add('imprimiendo-etiquetas');
    window.print();
});
window.addEventListener('afterprint', () => document.body.classList.remove('imprimiendo-etiquetas'));

// ==========================================
// 11. INSTALABLE (PWA) E INICIALIZACIÓN
// ==========================================
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => console.warn("No se pudo registrar el service worker:", err));
    });
}

poblarSelectCategorias();
aplicarModoAdmin(false);
cargarProductos();
suscribirCambiosEnTiempoReal();

// En computadoras (con mouse) el cursor queda listo en el buscador, para escanear sin tocar nada.
// En celulares/tablets no, para que no salte el teclado.
if (window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
    buscador.focus();
}
