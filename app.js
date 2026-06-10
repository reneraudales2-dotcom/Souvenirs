// 1. Configuración de Supabase
const SUPABASE_URL = "https://hhrpjyofxmyzrdahqutm.supabase.co";
const SUPABASE_KEY = "sb_publishable_cV1Qsy3U-htu9UvHKB-F9Q_YG_JhNpC";

// Inicialización limpia usando la última versión del SDK
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Variables globales para el estado del sistema
let carrito = [];
let baseDeDatosProductos = []; // Guardará una copia local para validar stock rápidamente

// Referencias del DOM
const gridProductos = document.getElementById('grid-productos');
const carritoItems = document.getElementById('carrito-items');
const cartTotal = document.getElementById('cart-total');
const btnPagar = document.getElementById('btn-pagar');

// ==========================================
// FASE 1: LEER PRODUCTOS DE SUPABASE
// ==========================================
async function cargarProductos() {
    const { data: productos, error } = await supabase
        .from('productos')
        .select('*')
        .order('nombre', { ascending: true });

    if (error) {
        console.error('Error cargando productos:', error);
        gridProductos.innerHTML = `<p class="text-red-500">Error al cargar el inventario.</p>`;
        return;
    }

    baseDeDatosProductos = productos; // Guardamos copia local
    renderizarProductos(productos);
}

function renderizarProductos(productos) {
    if (productos.length === 0) {
        gridProductos.innerHTML = `<p class="text-gray-500">No hay productos en la base de datos. Agrega algunos en la consola de Supabase.</p>`;
        return;
    }

    gridProductos.innerHTML = productos.map(prod => `
        <div class="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex flex-col justify-between">
            <div>
                <h3 class="font-bold text-lg text-gray-800">${prod.nombre}</h3>
                <p class="text-gray-500 text-sm mb-2">Disponibles: <span id="stock-id-${prod.id}" class="font-semibold ${prod.stock < 5 ? 'text-red-500' : 'text-gray-700'}">${prod.stock}</span></p>
            </div>
            <div class="flex justify-between items-center mt-4">
                <span class="text-xl font-bold text-blue-600">L. ${prod.precio.toFixed(2)}</span>
                <button 
                    id="btn-add-${prod.id}"
                    onclick="agregarAlCarrito(${prod.id})"
                    ${prod.stock === 0 ? 'disabled class="bg-gray-300 text-gray-500 px-3 py-1.5 rounded-md cursor-not-allowed"' : 'class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md transition"'}
                >
                    ${prod.stock === 0 ? 'Agotado' : 'Agregar'}
                </button>
            </div>
        </div>
    `).join('');
}

// ==========================================
// FASE 2: GESTIÓN DEL CARRITO EN MEMORIA
// ==========================================
window.agregarAlCarrito = function(id) {
    const productoOriginal = baseDeDatosProductos.find(p => p.id === id);
    const itemEnCarrito = carrito.find(item => item.id === id);
    
    // Validar si queda stock suficiente disponible
    const cantidadActual = itemEnCarrito ? itemEnCarrito.cantidad : 0;
    if (cantidadActual >= productoOriginal.stock) {
        alert(`¡Lo siento! No hay más existencias de ${productoOriginal.nombre}.`);
        return;
    }

    if (itemEnCarrito) {
        itemEnCarrito.cantidad++;
    } else {
        carrito.push({
            id: productoOriginal.id,
            nombre: productoOriginal.nombre,
            precio: productoOriginal.precio,
            cantidad: 1
        });
    }

    actualizarInterfazCarrito();
};

function actualizarInterfazCarrito() {
    if (carrito.length === 0) {
        carritoItems.innerHTML = `<p class="text-gray-400 text-sm">El carrito está vacío.</p>`;
        cartTotal.innerText = "L. 0.00";
        return;
    }

    let total = 0;
    carritoItems.innerHTML = carrito.map(item => {
        const subtotal = item.precio * item.cantidad;
        total += subtotal;
        return `
            <div class="flex justify-between items-center text-sm border-b pb-2">
                <div>
                    <p class="font-semibold text-gray-800">${item.nombre}</p>
                    <p class="text-gray-500">L. ${item.precio.toFixed(2)} x ${item.cantidad}</p>
                </div>
                <span class="font-bold text-gray-700">L. ${subtotal.toFixed(2)}</span>
            </div>
        `;
    }).join('');

    cartTotal.innerText = `L. ${total.toFixed(2)}`;
}

// ==========================================
// FASE 3: PROCESAR VENTA (ESCRITURA EN SUPABASE)
// ==========================================
btnPagar.addEventListener('click', async () => {
    if (carrito.length === 0) {
        alert("El carrito está vacío.");
        return;
    }

    btnPagar.disabled = true;
    btnPagar.innerText = "Procesando...";

    try {
        // Recorremos cada artículo comprado en el carrito
        for (const item of carrito) {
            // 1. Obtener el stock actual directamente de la base de datos para estar seguros
            const { data: prod, error: errFetch } = await supabase
                .from('productos')
                .select('stock')
                .eq('id', item.id)
                .single();

            if (errFetch || prod.stock < item.cantidad) {
                throw new Error(`Stock insuficiente o error con el producto ${item.nombre}.`);
            }

            // 2. Calcular nuevo stock
            const nuevoStock = prod.stock - item.cantidad;

            // 3. Actualizar la tabla de productos (restar stock)
            const { error: errUpdate } = await supabase
                .from('productos')
                .update({ stock: nuevoStock })
                .eq('id', item.id);

            if (errUpdate) throw errUpdate;

            // 4. Registrar el movimiento en la tabla de ventas
            const { error: errVenta } = await supabase
                .from('ventas')
                .insert([
                    { 
                        producto_id: item.id, 
                        cantidad: item.cantidad, 
                        total: item.precio * item.cantidad 
                    }
                ]);

            if (errVenta) throw errVenta;
        }

        alert("¡Venta procesada con éxito!");
        carrito = []; // Limpiamos carrito local
        actualizarInterfazCarrito();
        await cargarProductos(); // Recargamos el catálogo visual desde Supabase

    } catch (error) {
        console.error("Error al procesar la venta:", error);
        alert(`Ocurrió un error: ${error.message}`);
    } finally {
        btnPagar.disabled = false;
        btnPagar.innerText = "Procesar Venta";
    }
});

// Arrancar la aplicación al cargar la página
window.onload = cargarProductos;
