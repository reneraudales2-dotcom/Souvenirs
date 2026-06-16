// ==========================================
// 1. CONFIGURACIÓN E INICIALIZACIÓN DE APIS
// ==========================================
const SUPABASE_URL = "https://hhrpjyofxmyzrdahqutm.supabase.co";
const SUPABASE_KEY = "sb_publishable_cV1Qsy3U-htu9UvHKB-F9Q_YG_JhNpC";
const MAKE_WEBHOOK_URL = "https://hook.us2.make.com/xbk57afdr4761jqan7bfkgzynx7fp77x";

// Cliente global de Supabase (usado para LEER el catálogo rápido)
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Variables globales para el estado de la aplicación
let carrito = [];
let baseDeDatosProductos = []; 

// Referencias a los elementos del DOM (HTML)
const gridProductos = document.getElementById('grid-productos');
const carritoItems = document.getElementById('carrito-items');
const cartTotal = document.getElementById('cart-total');
const btnPagar = document.getElementById('btn-pagar');

// ==========================================
// 2. FASE 1: LEER PRODUCTOS DESDE SUPABASE
// ==========================================
async function cargarProductos() {
    try {
        // Consultamos la tabla de productos
        const { data, error } = await supabase
            .from('productos')
            .select('*');

        if (error) throw error;

        baseDeDatosProductos = data || [];
        renderizarCatalogo(baseDeDatosProductos);

    } catch (error) {
        console.error("Error al cargar productos de Supabase:", error);
        gridProductos.innerHTML = `
            <div class="col-span-full bg-white p-6 rounded-xl shadow-sm border border-red-200 text-center text-red-600">
                <p class="font-bold">⚠️ Error de conexión</p>
                <p class="text-sm text-gray-500">${error.message}</p>
            </div>
        `;
    }
}

// ==========================================
// 3. FASE 2: RENDERIZAR E INTERFAZ DEL CARRITO
// ==========================================
function renderizarCatalogo(productos) {
    if (productos.length === 0) {
        gridProductos.innerHTML = `
            <div class="col-span-full bg-white p-8 rounded-xl shadow-sm border border-gray-200 text-center">
                <span class="text-4xl block mb-2">📦</span>
                <p class="text-gray-500 font-medium">No hay productos en la base de datos.</p>
                <p class="text-xs text-gray-400 mt-1">Agrega algunos artículos en el panel de Supabase para verlos aquí.</p>
            </div>
        `;
        return;
    }

    gridProductos.innerHTML = productos.map(prod => `
        <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex flex-col justify-between">
            <div>
                <h3 class="font-bold text-lg text-gray-800">${prod.nombre}</h3>
                <p class="text-sm text-gray-400 mt-1">Disponible: ${prod.stock} uds</p>
            </div>
            <div class="flex justify-between items-center mt-6">
                <span class="text-xl font-black text-blue-600">L. ${parseFloat(prod.precio).toFixed(2)}</span>
                <button 
                    onclick="agregarAlCarrito(${prod.id})" 
                    class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-2 px-4 rounded-lg transition-all transform active:scale-95"
                >
                    + Agregar
                </button>
            </div>
        </div>
    `).join('');
}

function agregarAlCarrito(id) {
    const producto = baseDeDatosProductos.find(p => p.id === id);
    if (!producto) return;

    if (producto.stock <= 0) {
        alert("Este producto no cuenta con stock disponible.");
        return;
    }

    const itemEnCarrito = carrito.find(item => item.id === id);
    if (itemEnCarrito) {
        if (itemEnCarrito.cantidad >= producto.stock) {
            alert("No puedes agregar más unidades de las disponibles en el inventario.");
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

    if (item.cantidad > productoOriginal.stock) {
        alert("Límite de stock alcanzado.");
        item.cantidad = productoOriginal.stock;
    }

    if (item.cantidad <= 0) {
        carrito = carrito.filter(i => i.id !== id);
    }

    actualizarInterfazCarrito();
}

function actualizarInterfazCarrito() {
    if (carrito.length === 0) {
        carritoItems.innerHTML = `
            <div class="text-center py-8 text-gray-400">
                <span class="text-4xl block mb-2">🛍️</span>
                <p class="text-sm">El carrito está vacío.</p>
                <p class="text-xs text-gray-400 mt-1">Presiona "Agregar" en cualquier producto.</p>
            </div>
        `;
        cartTotal.innerText = "L. 0.00";
        return;
    }

    carritoItems.innerHTML = carrito.map(item => `
        <div class="flex justify-between items-center bg-gray-50 p-3 rounded-lg border">
            <div class="flex-1 min-w-0 pr-2">
                <h4 class="font-bold text-sm text-gray-800 truncate">${item.nombre}</h4>
                <p class="text-xs text-blue-600 font-semibold">L. ${parseFloat(item.precio).toFixed(2)} c/u</p>
            </div>
            <div class="flex items-center space-x-2">
                <button onclick="cambiarCantidad(${item.id}, -1)" class="w-6 h-6 bg-gray-200 hover:bg-gray-300 rounded text-sm font-bold flex items-center justify-center">-</button>
                <span class="text-sm font-bold w-6 text-center">${item.cantidad}</span>
                <button onclick="cambiarCantidad(${item.id}, 1)" class="w-6 h-6 bg-gray-200 hover:bg-gray-300 rounded text-sm font-bold flex items-center justify-center">+</button>
            </div>
        </div>
    `).join('');

    const total = carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
    cartTotal.innerText = `L. ${total.toFixed(2)}`;
}

// ==========================================
// 4. FASE 3: ENVIAR VENTA A MAKE.COM (EXCEL)
// ==========================================
btnPagar.addEventListener('click', async () => {
    if (carrito.length === 0) {
        alert("El carrito está vacío.");
        return;
    }

    btnPagar.disabled = true;
    btnPagar.innerText = "Procesando...";

    try {
        // Disparamos la venta directamente hacia el webhook de Make
        const response = await fetch(MAKE_WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                fecha: new Date().toISOString(),
                productos_vendidos: carrito
            })
        });

        if (!response.ok) {
            throw new Error("No se pudo conectar con el servidor de Make.com");
        }

        alert("¡Venta enviada y procesada con éxito!");
        carrito = [];
        actualizarInterfazCarrito();
        await cargarProductos();

    } catch (error) {
        console.error("Error al procesar la venta:", error);
        alert(`Ocurrió un error: ${error.message}`);
    } finally {
        btnPagar.disabled = false;
        btnPagar.innerText = "Procesar Venta";
    }
});

// Inicialización automática al cargar el archivo
cargarProductos();
