// ==========================================
// 1. CONFIGURACIÓN E INICIALIZACIÓN DE APIS
// ==========================================
const SUPABASE_URL = "https://hhrpjyofxmyzrdahqutm.supabase.co";
const SUPABASE_KEY = "sb_publishable_cV1Qsy3U-htu9UvHKB-F9Q_YG_JhNpC";
const MAKE_WEBHOOK_URL = "https://hook.us2.make.com/xbk57afdr4761jqan7bfkgzynx7fp77x";

// Contraseña simple para entrar al "Modo inventario" (agregar/editar/eliminar artículos).
// Esto NO es seguridad real (cualquiera con el código fuente puede verla),
// es solo para evitar que alguien la toque por accidente desde el mostrador.
const PASSWORD_INVENTARIO = "agape2026";

const TIMEOUT_MS = 12000;

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let carrito = [];
let baseDeDatosProductos = [];
let terminoBusqueda = "";
let modoAdmin = false;

const gridProductos = document.getElementById('grid-productos');
const carritoItems = document.getElementById('carrito-items');
const cartTotal = document.getElementById('cart-total');
const btnPagar = document.getElementById('btn-pagar');
const btnVaciar = document.getElementById('btn-vaciar');
const buscador = document.getElementById('buscador');
const contadorProductos = document.getElementById('contador-productos');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const toastContainer = document.getElementById('toast-container');
const btnAdminToggle = document.getElementById('btn-admin-toggle');
const btnNuevoProducto = document.getElementById('btn-nuevo-producto');

// Modales
const modalPassword = document.getElementById('modal-password');
const inputPassword = document.getElementById('input-password');
const errorPassword = document.getElementById('error-password');
const btnConfirmarPassword = document.getElementById('btn-confirmar-password');

const modalProducto = document.getElementById('modal-producto');
const tituloModalProducto = document.getElementById('titulo-modal-producto');
const errorProducto = document.getElementById('error-producto');
const inputNombre = document.getElementById('input-nombre');
const inputPrecio = document.getElementById('input-precio');
const inputStock = document.getElementById('input-stock');
const inputIdOriginal = document.getElementById('input-id-original');
const btnGuardarProducto = document.getElementById('btn-guardar-producto');
const btnEliminarProducto = document.getElementById('btn-eliminar-producto');
const inputCodigoBarras = document.getElementById('input-codigo-barras');
const btnGenerarCodigo = document.getElementById('btn-generar-codigo');
const btnEscanearCodigoProducto = document.getElementById('btn-escanear-codigo-producto');
const etiquetaPreview = document.getElementById('etiqueta-preview');
const btnImprimirEtiqueta = document.getElementById('btn-imprimir-etiqueta');

// Escáner de venta rápida
const btnEscanearVenta = document.getElementById('btn-escanear-venta');
const modalScanner = document.getElementById('modal-scanner');
const tituloModalScanner = document.getElementById('titulo-modal-scanner');
const subtituloModalScanner = document.getElementById('subtitulo-modal-scanner');
const scannerStatus = document.getElementById('scanner-status');

// ==========================================
// UTILIDADES
// ==========================================
function conLimiteDeTiempo(promesa, ms = TIMEOUT_MS) {
    return Promise.race([
        promesa,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error("La conexión tardó demasiado. Verifica tu internet.")), ms)
        )
    ]);
}

function mostrarToast(mensaje, tipo = "info") {
    const toast = document.createElement('div');
    toast.className = `toast ${tipo}`;
    const icono = tipo === "success" ? "✅" : tipo === "error" ? "⚠️" : "ℹ️";
    toast.innerHTML = `<span>${icono}</span><span>${mensaje}</span>`;
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
    return div.innerHTML;
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
async function cargarProductos() {
    setEstadoConexion('warn', 'Conectando...');
    mostrarEstadoCargando();

    try {
        const { data, error } = await conLimiteDeTiempo(
            supabase.from('productos').select('*').order('nombre', { ascending: true })
        );

        if (error) throw error;

        baseDeDatosProductos = data || [];
        setEstadoConexion('ok', 'Servidor en línea');
        renderizarCatalogo();

    } catch (error) {
        console.error("Error al cargar productos de Supabase:", error);
        setEstadoConexion('err', 'Sin conexión');
        mostrarEstadoError(error);
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
    document.getElementById('btn-reintentar')?.addEventListener('click', cargarProductos);
}

// ==========================================
// 3. RENDERIZAR CATÁLOGO Y CARRITO
// ==========================================
function renderizarCatalogo() {
    const filtro = terminoBusqueda.trim().toLowerCase();
    const productos = filtro
        ? baseDeDatosProductos.filter(p =>
            p.nombre.toLowerCase().includes(filtro) ||
            (p.codigo_barras && p.codigo_barras.toLowerCase().includes(filtro))
          )
        : baseDeDatosProductos;

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
        const stockBajo = prod.stock > 0 && prod.stock <= 3;
        const idAttr = escapeHtml(prod.id);
        return `
        <div class="prod-card ${agotado ? 'agotado' : ''}">
            <button class="btn-edit-prod" onclick="abrirEdicionProducto(${idAttr})" title="Editar artículo">✏️</button>
            <div>
                <h3 class="prod-name">${escapeHtml(prod.nombre)}</h3>
                <p class="prod-stock ${stockBajo ? 'low' : ''}">${agotado ? 'Agotado' : `Disponible: ${prod.stock} uds`}</p>
                ${prod.codigo_barras ? `<p class="prod-barcode">🏷️ ${escapeHtml(prod.codigo_barras)}</p>` : ''}
            </div>
            <div class="prod-foot">
                <span class="prod-price">L. ${parseFloat(prod.precio).toFixed(2)}</span>
                <button
                    onclick="agregarAlCarrito(${idAttr})"
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

function agregarAlCarrito(id) {
    const producto = baseDeDatosProductos.find(p => p.id === id);
    if (!producto) return;

    if (producto.stock <= 0) {
        mostrarToast("Este producto no tiene stock disponible.", "error");
        return;
    }

    const itemEnCarrito = carrito.find(item => item.id === id);
    if (itemEnCarrito) {
        if (itemEnCarrito.cantidad >= producto.stock) {
            mostrarToast("No hay más unidades disponibles en inventario.", "error");
            return;
        }
        itemEnCarrito.cantidad++;
    } else {
        carrito.push({ ...producto, cantidad: 1 });
    }

    actualizarInterfazCarrito();
}

function cambiarCantidad(id, cambio) {
    const item = carrito.find(i => i.id === id);
    if (!item) return;

    const productoOriginal = baseDeDatosProductos.find(p => p.id === id);

    item.cantidad += cambio;

    if (productoOriginal && item.cantidad > productoOriginal.stock) {
        mostrarToast("Límite de stock alcanzado.", "error");
        item.cantidad = productoOriginal.stock;
    }

    if (item.cantidad <= 0) {
        carrito = carrito.filter(i => i.id !== id);
    }

    actualizarInterfazCarrito();
}

function vaciarCarrito() {
    if (carrito.length === 0) return;
    if (!confirm("¿Vaciar todo el carrito?")) return;
    carrito = [];
    actualizarInterfazCarrito();
}

function actualizarInterfazCarrito() {
    btnPagar.disabled = carrito.length === 0;

    if (carrito.length === 0) {
        carritoItems.innerHTML = `
            <div class="cart-empty">
                <span class="icon">🛍️</span>
                <p style="font-weight:600;">El carrito está vacío.</p>
                <p>Toca "Agregar" en cualquier artículo.</p>
            </div>
        `;
        cartTotal.innerText = "L. 0.00";
        return;
    }

    carritoItems.innerHTML = carrito.map(item => `
        <div class="cart-item">
            <div class="cart-item-info">
                <h4>${escapeHtml(item.nombre)}</h4>
                <span>L. ${parseFloat(item.precio).toFixed(2)} c/u</span>
            </div>
            <div class="qty-controls">
                <button onclick="cambiarCantidad(${item.id}, -1)" class="qty-btn" aria-label="Quitar uno">−</button>
                <span class="qty-val">${item.cantidad}</span>
                <button onclick="cambiarCantidad(${item.id}, 1)" class="qty-btn" aria-label="Agregar uno">+</button>
            </div>
        </div>
    `).join('');

    const total = carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
    cartTotal.innerText = `L. ${total.toFixed(2)}`;
}

// ==========================================
// 4. BUSCADOR
// ==========================================
buscador.addEventListener('input', (e) => {
    terminoBusqueda = e.target.value;
    renderizarCatalogo();
});

btnVaciar.addEventListener('click', vaciarCarrito);

// ==========================================
// 5. MODO INVENTARIO (contraseña + CRUD productos)
// ==========================================
btnAdminToggle.addEventListener('click', () => {
    if (modoAdmin) {
        // Salir del modo inventario, sin pedir contraseña.
        modoAdmin = false;
        document.body.classList.remove('modo-admin');
        btnAdminToggle.textContent = "🔒 Modo inventario";
        btnNuevoProducto.style.display = "none";
        return;
    }
    errorPassword.classList.remove('visible');
    inputPassword.value = "";
    abrirModal(modalPassword);
    setTimeout(() => inputPassword.focus(), 50);
});

function intentarEntrarModoAdmin() {
    if (inputPassword.value === PASSWORD_INVENTARIO) {
        modoAdmin = true;
        document.body.classList.add('modo-admin');
        btnAdminToggle.textContent = "🔓 Salir de inventario";
        btnNuevoProducto.style.display = "inline-flex";
        cerrarModal(modalPassword);
        mostrarToast("Modo inventario activado.", "success");
    } else {
        errorPassword.classList.add('visible');
    }
}

btnConfirmarPassword.addEventListener('click', intentarEntrarModoAdmin);
inputPassword.addEventListener('keydown', (e) => { if (e.key === 'Enter') intentarEntrarModoAdmin(); });

btnNuevoProducto.addEventListener('click', () => abrirNuevoProducto());

function abrirNuevoProducto() {
    tituloModalProducto.textContent = "Nuevo artículo";
    errorProducto.classList.remove('visible');
    inputIdOriginal.value = "";
    inputNombre.value = "";
    inputPrecio.value = "";
    inputStock.value = "";
    inputCodigoBarras.value = "";
    actualizarVistaPreviaEtiqueta();
    btnEliminarProducto.style.display = "none";
    inputNombre.disabled = false;
    abrirModal(modalProducto);
    setTimeout(() => inputNombre.focus(), 50);
}

function abrirEdicionProducto(id) {
    const producto = baseDeDatosProductos.find(p => p.id === id);
    if (!producto) return;

    tituloModalProducto.textContent = "Editar artículo";
    errorProducto.classList.remove('visible');
    inputIdOriginal.value = producto.id;
    inputNombre.value = producto.nombre;
    inputPrecio.value = producto.precio;
    inputStock.value = producto.stock;
    inputCodigoBarras.value = producto.codigo_barras || "";
    actualizarVistaPreviaEtiqueta();
    btnEliminarProducto.style.display = "inline-block";
    inputNombre.disabled = false;
    abrirModal(modalProducto);
}

btnGuardarProducto.addEventListener('click', async () => {
    const nombre = inputNombre.value.trim();
    const precio = parseFloat(inputPrecio.value);
    const stock = parseInt(inputStock.value, 10);
    const codigoBarras = inputCodigoBarras.value.trim() || null;
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

    try {
        if (idOriginal) {
            const { error } = await conLimiteDeTiempo(
                supabase.from('productos').update({ nombre, precio, stock, codigo_barras: codigoBarras }).eq('id', idOriginal)
            );
            if (error) throw error;
            mostrarToast("Artículo actualizado.", "success");
        } else {
            const { error } = await conLimiteDeTiempo(
                supabase.from('productos').insert([{ nombre, precio, stock, codigo_barras: codigoBarras }])
            );
            if (error) throw error;
            mostrarToast("Artículo agregado.", "success");
        }

        cerrarModal(modalProducto);
        await cargarProductos();

    } catch (error) {
        console.error("Error al guardar producto:", error);
        const esDuplicado = error.message?.includes('duplicate') || error.message?.includes('unique');
        if (esDuplicado && error.message?.includes('codigo_barras')) {
            errorProducto.textContent = "Ya existe un artículo con ese código de barras.";
        } else if (esDuplicado) {
            errorProducto.textContent = "Ya existe un artículo con ese nombre.";
        } else {
            errorProducto.textContent = `Error: ${error.message}`;
        }
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
        const { error } = await conLimiteDeTiempo(
            supabase.from('productos').delete().eq('id', idOriginal)
        );
        if (error) throw error;
        mostrarToast("Artículo eliminado.", "success");
        cerrarModal(modalProducto);
        await cargarProductos();
    } catch (error) {
        console.error("Error al eliminar producto:", error);
        mostrarToast(`No se pudo eliminar: ${error.message}`, "error");
    }
});

// ==========================================
// 6. PROCESAR VENTA
// ==========================================
// El stock se descuenta AL INSTANTE en Supabase (fuente de verdad para la app).
// Después se notifica a Make.com, que agrega una fila de bitácora en el
// Excel de OneDrive con el detalle de la venta — el Excel ya no controla
// el stock, solo queda como registro/reporte de lo vendido.

async function descontarStockEnSupabase(itemsCarrito) {
    const resultados = [];

    for (const item of itemsCarrito) {
        const { data: actual, error: errorLectura } = await conLimiteDeTiempo(
            supabase.from('productos').select('stock').eq('id', item.id).single()
        );

        if (errorLectura || !actual) {
            resultados.push({ id: item.id, nombre: item.nombre, ok: false, motivo: "No se pudo verificar el stock actual." });
            continue;
        }

        if (actual.stock < item.cantidad) {
            resultados.push({ id: item.id, nombre: item.nombre, ok: false, motivo: `Solo quedan ${actual.stock} uds disponibles.` });
            continue;
        }

        const nuevoStock = actual.stock - item.cantidad;
        const { error: errorUpdate } = await conLimiteDeTiempo(
            supabase.from('productos').update({ stock: nuevoStock }).eq('id', item.id)
        );

        if (errorUpdate) {
            resultados.push({ id: item.id, nombre: item.nombre, ok: false, motivo: "No se pudo actualizar el inventario." });
            continue;
        }

        resultados.push({ id: item.id, nombre: item.nombre, ok: true });
    }

    return resultados;
}

// Registra cada línea de la venta en Supabase (tabla ventas_log).
// Esta tabla es la que dispara el Database Webhook que escribe
// automáticamente en la hoja "Control" del Google Sheet.
async function registrarVentaEnSupabase(itemsCarrito, total, ventaId) {
    const filas = itemsCarrito.map(item => ({
        venta_id: ventaId,
        producto_id: item.id,
        nombre: item.nombre,
        cantidad: item.cantidad,
        precio: item.precio,
        subtotal: item.precio * item.cantidad,
        total_venta: total
    }));

    try {
        const { error } = await conLimiteDeTiempo(
            supabase.from('ventas_log').insert(filas)
        );
        if (error) throw error;
        return true;
    } catch (error) {
        console.warn("No se pudo registrar la venta en Supabase (hoja Control no se actualizará para esta venta):", error);
        return false;
    }
}

async function notificarMake(itemsCarrito, total) {
    try {
        const response = await conLimiteDeTiempo(fetch(MAKE_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fecha: new Date().toISOString(),
                total: total,
                productos_vendidos: itemsCarrito.map(item => ({
                    nombre: item.nombre,
                    cantidad: item.cantidad,
                    precio: item.precio,
                    subtotal: item.precio * item.cantidad
                }))
            })
        }), 8000);

        return response.ok;
    } catch (error) {
        console.warn("No se pudo notificar a Make.com (bitácora de Excel):", error);
        return false;
    }
}

btnPagar.addEventListener('click', async () => {
    if (carrito.length === 0) return;

    btnPagar.disabled = true;
    btnPagar.innerHTML = `<span class="spinner" style="width:18px;height:18px;border-width:2px;margin:0;"></span> Procesando...`;

    const total = carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
    const carritoSnapshot = [...carrito];

    try {
        const resultados = await descontarStockEnSupabase(carritoSnapshot);
        const fallidos = resultados.filter(r => !r.ok);
        const exitosos = resultados.filter(r => r.ok);

        if (fallidos.length > 0) {
            const detalle = fallidos.map(f => `${f.nombre}: ${f.motivo}`).join(' · ');
            mostrarToast(`Algunos artículos no se pudieron vender — ${detalle}`, "error");
        }

        if (exitosos.length > 0) {
            const itemsExitosos = carritoSnapshot.filter(item => exitosos.some(e => e.id === item.id));
            const ventaId = (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

            const registradoEnSupabase = await registrarVentaEnSupabase(itemsExitosos, total, ventaId);
            const notificado = await notificarMake(itemsExitosos, total);

            if (!registradoEnSupabase && !notificado) {
                mostrarToast("Venta registrada en inventario, pero no se pudo registrar en la bitácora (Sheet/Excel). El stock ya está actualizado.", "info");
            } else {
                mostrarToast("¡Venta procesada con éxito!", "success");
            }

            carrito = carrito.filter(item => !exitosos.some(e => e.id === item.id));
        }

        actualizarInterfazCarrito();
        await cargarProductos();

    } catch (error) {
        console.error("Error al procesar la venta:", error);
        mostrarToast(`Ocurrió un error al procesar la venta: ${error.message}`, "error");
    } finally {
        btnPagar.disabled = carrito.length === 0;
        btnPagar.innerHTML = "💵 Procesar venta";
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
    try {
        const estado = lectorHtml5Qrcode.getState();
        if (estado === Html5QrcodeScannerState.SCANNING || estado === Html5QrcodeScannerState.PAUSED) {
            await lectorHtml5Qrcode.stop();
        }
        lectorHtml5Qrcode.clear();
    } catch (err) {
        console.warn("Error al detener la cámara:", err);
    }
    lectorHtml5Qrcode = null;
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
    agregarAlCarrito(producto.id);
    scannerStatus.textContent = `✅ ${producto.nombre} agregado al carrito.`;
    scannerStatus.className = "scanner-status found";

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

btnImprimirEtiqueta.addEventListener('click', () => {
    const codigo = inputCodigoBarras.value.trim();
    if (!codigo) return;

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
            <div style="font-weight:700; font-size:13px; margin-bottom:10px;">L. ${precio.toFixed(2)}</div>
            <svg id="barcode"></svg>
            <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>
            <script>
                JsBarcode("#barcode", ${JSON.stringify(codigo)}, { format: "CODE128", width: 2, height: 50, fontSize: 14, margin: 6 });
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
// y refresca el catálogo automáticamente, sin que el usuario recargue la página.
let refrescoPendiente = null;
function refrescarConDebounce() {
    // Si llegan varios cambios casi juntos (ej. una venta con varios artículos),
    // esperamos un poquito y hacemos un solo refresco en vez de varios seguidos.
    clearTimeout(refrescoPendiente);
    refrescoPendiente = setTimeout(() => {
        cargarProductos();
    }, 400);
}

function suscribirCambiosEnTiempoReal() {
    supabase
        .channel('productos-en-vivo')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'productos' },
            () => refrescarConDebounce()
        )
        .subscribe((estado) => {
            if (estado === 'SUBSCRIBED') {
                console.log('Tiempo real activo: la app se sincroniza sola con Supabase.');
            }
        });
}

// Inicialización automática al cargar el archivo
cargarProductos();
suscribirCambiosEnTiempoReal();
