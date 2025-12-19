import { h, render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { html } from 'htm/preact';
import { saveOrderToFirebase } from './firebase-config.js';

// --- DATA CONSTANTS ---
const PRODUCTS = [
    { id: 1, name: 'Azulito', price: 35, img: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=300&q=80' },
    { id: 2, name: 'Baby Blue', price: 30, img: 'https://images.unsplash.com/photo-1546171753-97d7676e4602?auto=format&fit=crop&w=300&q=80' },
    { id: 3, name: 'Michelada', price: 40, img: 'https://images.unsplash.com/photo-1513420901235-f4e953a5d851?auto=format&fit=crop&w=300&q=80' },
    { id: 4, name: 'Michelada Mango', price: 45, img: 'https://images.unsplash.com/photo-1525999059881-ebc9258286a1?auto=format&fit=crop&w=300&q=80' },
    { id: 5, name: 'Cimarrona', price: 25, img: 'https://images.unsplash.com/photo-1595981267035-7b04ca84a82d?auto=format&fit=crop&w=300&q=80' },
    { id: 6, name: 'Mango Breeze', price: 35, img: 'https://images.unsplash.com/photo-1502741224143-90386d7f8c82?auto=format&fit=crop&w=300&q=80' },
    { id: 7, name: 'Cantarito', price: 50, img: 'https://images.unsplash.com/photo-1588612143003-88849ad7b26e?auto=format&fit=crop&w=300&q=80' }
];

const EXTRAS_OPTIONS = [
    { id: 'sin_hielo', name: 'Sin Hielo', price: 0 },
    { id: 'extra_shot', name: 'Extra Shot', price: 10 },
    { id: 'sin_sal', name: 'Sin Sal', price: 0 }
];

// --- UTILS ---
const printOrder = (order, eventData) => {
    let itemsText = '';
    order.items.forEach(item => {
        let price = item.price;
        item.extras.forEach(eid => { const e = EXTRAS_OPTIONS.find(x => x.id === eid); if (e) price += e.price; });
        const subtotal = price * item.qty;
        itemsText += `${item.qty} ${item.name.padEnd(14).slice(0, 14)} Q${subtotal.toFixed(2)}\n`;
        if (item.extras.length) itemsText += `  ${item.extras.join(',')}\n`;
    });

    const text = `
   TURCO'S HOUSE
 ${eventData.eventName}
--------------------------------
${new Date(order.date).toLocaleTimeString()} | ${eventData.seller}
#${order.id}
--------------------------------
CANT PROD           TOTAL
${itemsText}
--------------------------------
TOTAL:             Q${order.total.toFixed(2)}
--------------------------------
Pago: ${order.paymentMethod.toUpperCase()}
${order.paymentMethod === 'cash' ? `Efe: Q${order.cashGiven} | Vuelto: Q${order.change.toFixed(2)}` : ''}

     GRACIAS POR SU COMPRA
   www.turcoshouse.com
\n\n`;

    // Try RawBT Intent
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    if (/android/i.test(userAgent)) {
        const base64 = btoa(text);
        window.location.href = 'intent:base64,' + base64 + '#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;';
    } else {
        // Fallback for PC/iOS
        console.log(text);
    }
};


// --- COMPONENTS ---

function App() {
    const [screen, setScreen] = useState('login');
    const [eventData, setEventData] = useState(null);
    const [cart, setCart] = useState([]);
    const [customerName, setCustomerName] = useState('');
    const [isGift, setIsGift] = useState(false);

    // Payment State
    const [paymentMethod, setPaymentMethod] = useState('cash');
    const [cashGiven, setCashGiven] = useState(0);
    const [lastOrder, setLastOrder] = useState(null);
    const [unsyncedCount, setUnsyncedCount] = useState(0);

    // Initial Load
    useEffect(() => {
        const stored = localStorage.getItem('turco_event');
        if (stored) setEventData(JSON.parse(stored));

        // Count unsynced
        const localOrders = JSON.parse(localStorage.getItem('turco_orders_local') || '[]');
        const pending = localOrders.filter(o => !o.synced).length;
        setUnsyncedCount(pending);
    }, []);

    // Actions
    const startEvent = (data) => {
        setEventData(data);
        localStorage.setItem('turco_event', JSON.stringify(data));
        setScreen('pos');
    };

    const addToCart = (product, qty, extras) => {
        setCart(prev => {
            const existing = prev.findIndex(p => p.id === product.id && JSON.stringify(p.extras.sort()) === JSON.stringify(extras.sort()));
            if (existing > -1) {
                const newCart = [...prev];
                newCart[existing].qty += qty;
                return newCart;
            }
            return [...prev, { ...product, qty, extras }];
        });
    };

    const updateCartQty = (index, delta) => {
        setCart(prev => {
            const newCart = [...prev];
            newCart[index].qty += delta;
            if (newCart[index].qty <= 0) return newCart.filter((_, i) => i !== index);
            return newCart;
        });
    };

    const clearCart = () => setCart([]);

    const finalizeOrder = async () => {
        const total = isGift ? 0 : cart.reduce((acc, item) => {
            let itemPrice = item.price;
            item.extras.forEach(eid => {
                const e = EXTRAS_OPTIONS.find(x => x.id === eid);
                if (e) itemPrice += e.price;
            });
            return acc + (itemPrice * item.qty);
        }, 0);

        const order = {
            id: `ORD-${Date.now().toString().slice(-6)}`,
            customer: customerName,
            items: cart,
            total,
            isGift,
            paymentMethod,
            cashGiven: paymentMethod === 'cash' ? cashGiven : 0,
            change: paymentMethod === 'cash' ? cashGiven - total : 0,
            date: new Date().toISOString(),
            seller: eventData.seller,
            event: eventData.eventName,
            synced: false
        };

        // 1. SAVE LOCAL (Always safe)
        const localOrders = JSON.parse(localStorage.getItem('turco_orders_local') || '[]');
        localOrders.push(order);
        localStorage.setItem('turco_orders_local', JSON.stringify(localOrders));
        setUnsyncedCount(prev => prev + 1);

        // 2. TRY FIREBASE
        saveOrderToFirebase(order).then(res => {
            if (res.success) {
                // Mark as synced locally
                const updated = JSON.parse(localStorage.getItem('turco_orders_local') || '[]');
                const idx = updated.findIndex(o => o.id === order.id);
                if (idx > -1) updated[idx].synced = true;
                localStorage.setItem('turco_orders_local', JSON.stringify(updated));
                setUnsyncedCount(prev => Math.max(0, prev - 1));
            }
        });

        // 3. PRINT
        printOrder(order, eventData);

        setLastOrder(order);
        setScreen('success');
    };

    const resetOrder = () => {
        setCart([]);
        setCustomerName('');
        setIsGift(false);
        setCashGiven(0);
        setScreen('pos');
    };

    // Routing
    if (screen === 'login') return html`<${LoginScreen} onStart=${startEvent} existingEvent=${eventData} />`;
    if (screen === 'success') return html`<${SuccessScreen} order=${lastOrder} onNew=${resetOrder} onPrint=${() => printOrder(lastOrder, eventData)} />`;

    return html`
        <div class="flex flex-col h-full bg-turco-black">
             <${Header} eventData=${eventData} unsyncedCount=${unsyncedCount} onLogout=${() => { localStorage.removeItem('turco_event'); location.reload(); }} />
             
             ${screen === 'payment'
            ? html`<${PaymentScreen} 
                        cart=${cart} 
                        isGift=${isGift} 
                        onBack=${() => setScreen('pos')} 
                        onConfirm=${finalizeOrder}
                        paymentMethod=${paymentMethod} setPaymentMethod=${setPaymentMethod}
                        cashGiven=${cashGiven} setCashGiven=${setCashGiven}
                       />`
            : html`<${POSScreen} 
                        products=${PRODUCTS} 
                        cart=${cart} 
                        addToCart=${addToCart}
                        customerName=${customerName} setCustomerName=${setCustomerName}
                        updateCartQty=${updateCartQty}
                        clearCart=${clearCart}
                        isGift=${isGift} setIsGift=${setIsGift}
                        onCheckout=${() => setScreen('payment')}
                       />`
        }
        </div>
    `;
}

// --- SUB-COMPONENTS ---

function LoginScreen({ onStart, existingEvent }) {
    const [seller, setSeller] = useState('');
    const [evt, setEvt] = useState('');
    const handleSubmit = () => { if (!seller || !evt) return; onStart({ seller, eventName: evt, startTime: new Date().toISOString() }); };
    return html`
        <section class="flex flex-col h-full items-center justify-center p-6 space-y-8 bg-turco-black">
            <div class="text-center space-y-2"><h1 class="text-4xl font-extrabold text-white tracking-tight">TURCO'S<span class="text-turco-red">HOUSE</span></h1><p class="text-gray-400 text-sm">POS System v2.0</p></div>
            <div class="w-full max-w-sm space-y-4">
                <div><label class="block text-xs font-bold text-gray-500 uppercase mb-1">Vendedor</label><input type="text" value=${seller} onInput=${e => setSeller(e.target.value)} class="w-full bg-turco-gray text-white text-lg p-4 rounded-xl border border-transparent focus:border-turco-red focus:outline-none" placeholder="Tu nombre" /></div>
                <div><label class="block text-xs font-bold text-gray-500 uppercase mb-1">Evento</label><input type="text" value=${evt} onInput=${e => setEvt(e.target.value)} class="w-full bg-turco-gray text-white text-lg p-4 rounded-xl border border-transparent focus:border-turco-red focus:outline-none" placeholder="Ej. Feria Navideña" /></div>
            </div>
            <button onClick=${handleSubmit} class="w-full max-w-sm bg-turco-red text-white font-bold text-xl py-5 rounded-2xl btn-press shadow-lg shadow-red-900/20">INICIAR EVENTO</button>
            ${existingEvent && html`<button onClick=${() => onStart(existingEvent)} class="w-full max-w-sm border border-turco-gray text-gray-400 font-semibold text-sm py-4 rounded-2xl btn-press">Continuar: ${existingEvent.eventName}</button>`}
        </section>
    `;
}

function Header({ eventData, onLogout, unsyncedCount }) {
    return html`
        <header class="bg-turco-dark border-b border-white/5 p-3 flex justify-between items-center shrink-0">
            <div class="flex flex-col">
                <span class="text-xs text-gray-400 font-bold uppercase tracking-wider">${eventData?.seller || 'Vendedor'}</span>
                <span class="text-white font-semibold leading-tight flex items-center gap-2">
                    ${eventData?.eventName || 'Evento'}
                    ${unsyncedCount > 0 ? html`<span class="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" title="Datos no sincronizados"></span>` : html`<span class="w-2 h-2 rounded-full bg-green-500" title="Todo sincronizado"></span>`}
                </span>
            </div>
            <button onClick=${onLogout} class="text-xs text-turco-red font-bold p-2">SALIR</button>
        </header>
    `;
}

function POSScreen({ products, cart, addToCart, customerName, setCustomerName, updateCartQty, clearCart, isGift, setIsGift, onCheckout }) {
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [showCart, setShowCart] = useState(false);
    const cartTotal = cart.reduce((acc, item) => { let p = item.price; item.extras.forEach(eid => { const e = EXTRAS_OPTIONS.find(x => x.id === eid); if (e) p += e.price; }); return acc + (p * item.qty); }, 0);
    const displayTotal = isGift ? 0 : cartTotal;

    return html`
        <div class="flex-1 flex flex-col overflow-hidden relative">
            <div class="p-4 bg-turco-black shrink-0">
                <input type="text" value=${customerName} onInput=${e => setCustomerName(e.target.value)} class="w-full bg-turco-gray text-white placeholder-gray-500 font-bold text-xl p-3 rounded-lg border-2 border-transparent focus:border-turco-red focus:outline-none" placeholder="NOMBRE DEL CLIENTE *" />
            </div>
            <div class="flex-1 overflow-y-auto p-2 pb-20">
                <div class="grid grid-cols-2 gap-2">
                    ${products.map(p => html`
                        <div onClick=${() => setSelectedProduct({ ...p, qty: 1, extras: [] })} class="bg-turco-gray rounded-xl overflow-hidden shadow-lg active:scale-95 transition-transform cursor-pointer relative group h-40">
                             <div class="absolute inset-0 bg-cover bg-center opacity-80" style="background-image: url('${p.img}')"></div>
                             <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-3 pt-10">
                                <div class="text-white font-bold leading-none text-lg">${p.name}</div>
                                <div class="text-turco-red font-bold text-sm">Q${p.price}</div>
                             </div>
                        </div>
                    `)}
                </div>
            </div>
            <div class="bg-turco-dark border-t border-white/5 p-4 pb-6 shadow-[0_-5px_20px_rgba(0,0,0,0.5)] z-20 shrink-0">
                <div class="flex justify-between items-end mb-4 cursor-pointer" onClick=${() => setShowCart(true)}>
                    <div class="flex flex-col">
                        <span class="text-gray-400 text-xs font-bold uppercase">Total a Pagar</span>
                        <div class="text-4xl font-black text-white">Q${displayTotal.toFixed(2)}</div>
                    </div>
                    <div class="bg-white/10 px-3 py-1 rounded-full text-xs font-bold text-gray-300">${cart.reduce((a, b) => a + b.qty, 0)} items ^</div>
                </div>
                <button disabled=${!customerName || cart.length === 0} onClick=${onCheckout} class="w-full bg-turco-red disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold text-xl rounded-xl py-4 shadow-lg shadow-red-900/20 btn-press transition-all">PAGAR</button>
            </div>
            ${selectedProduct && html`<${ProductModal} product=${selectedProduct} onClose=${() => setSelectedProduct(null)} onAdd=${(p, q, e) => { addToCart(p, q, e); setSelectedProduct(null); }} />`}
            ${showCart && html`<${CartModal} cart=${cart} updateQty=${updateCartQty} clear=${clearCart} isGift=${isGift} setIsGift=${setIsGift} onClose=${() => setShowCart(false)} />`}
        </div>
    `;
}

function ProductModal({ product, onClose, onAdd }) {
    const [qty, setQty] = useState(1);
    const [extras, setExtras] = useState([]);
    const toggleExtra = (id) => { if (extras.includes(id)) setExtras(extras.filter(e => e !== id)); else setExtras([...extras, id]); };
    return html`
        <div class="fixed inset-0 bg-black/90 z-50 backdrop-blur-sm flex items-center justify-center p-4">
            <div class="bg-turco-dark w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl border border-white/10 animate-scale-in">
                 <div class="h-32 bg-gray-800 relative bg-cover bg-center" style="background-image: url('${product.img}')">
                   <button onClick=${onClose} class="absolute top-2 right-2 bg-black/50 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold">✕</button>
                </div>
                <div class="p-5">
                    <h3 class="text-2xl font-bold text-white mb-1">${product.name}</h3>
                    <p class="text-turco-red font-bold text-xl mb-4">Q${product.price.toFixed(2)}</p>
                    <div class="flex items-center justify-between bg-turco-gray rounded-xl p-2 px-4 mb-6">
                        <button onClick=${() => setQty(Math.max(1, qty - 1))} class="w-10 h-10 bg-white/10 rounded-lg text-xl font-bold text-white">-</button>
                        <span class="text-3xl font-bold text-white">${qty}</span>
                        <button onClick=${() => setQty(qty + 1)} class="w-10 h-10 bg-white/10 rounded-lg text-xl font-bold text-white">+</button>
                    </div>
                    <div class="space-y-2 mb-6">
                        ${EXTRAS_OPTIONS.map(e => html`<label class="flex items-center justify-between p-3 bg-white/5 rounded-lg active:bg-white/10"><span class="text-gray-300 font-semibold">${e.name} ${e.price > 0 ? `(+Q${e.price})` : ''}</span><input type="checkbox" checked=${extras.includes(e.id)} onChange=${() => toggleExtra(e.id)} class="w-6 h-6 rounded border-gray-600 bg-gray-700 text-turco-red focus:ring-turco-red" /></label>`)}
                    </div>
                    <button onClick=${() => onAdd(product, qty, extras)} class="w-full bg-white text-black font-bold text-lg py-4 rounded-xl btn-press">AGREGAR</button>
                </div>
            </div>
        </div>
    `;
}

function CartModal({ cart, updateQty, clear, isGift, setIsGift, onClose }) {
    return html`
        <div class="fixed inset-0 bg-black/90 z-50 backdrop-blur-sm flex flex-col justify-end">
            <div class="bg-turco-dark rounded-t-3xl h-[80vh] flex flex-col w-full max-w-md mx-auto relative">
                <div class="p-4 border-b border-white/5 flex justify-between items-center"><h2 class="text-xl font-bold text-white">Orden Actual</h2><button onClick=${onClose} class="text-gray-400 p-2">✕</button></div>
                <div class="flex-1 overflow-y-auto p-4 space-y-3">
                    ${cart.length === 0 ? html`<div class="text-center py-10 text-gray-600 italic">Carrito vacío</div>` : cart.map((item, idx) => {
        let price = item.price;
        item.extras.forEach(eid => { const e = EXTRAS_OPTIONS.find(x => x.id === eid); if (e) price += e.price; });
        return html`
                            <div class="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/5">
                                <div class="flex-1"><div class="text-white font-bold">${item.name}</div><div class="text-xs text-gray-400 mb-1">${item.extras.join(', ')}</div><div class="text-sm text-turco-red font-bold">Q${(price * item.qty).toFixed(2)}</div></div>
                                <div class="flex items-center space-x-3 bg-black/20 rounded-lg p-1"><button onClick=${() => updateQty(idx, -1)} class="w-8 h-8 flex items-center justify-center text-white font-bold bg-white/5 rounded">-</button><span class="text-white w-4 text-center font-bold">${item.qty}</span><button onClick=${() => updateQty(idx, 1)} class="w-8 h-8 flex items-center justify-center text-white font-bold bg-white/5 rounded">+</button></div>
                            </div>`;
    })}
                </div>
                <div class="p-4 border-t border-white/5 bg-black/20"><div class="flex items-center justify-between mb-4"><label class="flex items-center space-x-2 text-white"><input type="checkbox" checked=${isGift} onChange=${e => setIsGift(e.target.checked)} class="w-6 h-6 rounded border-gray-600 bg-gray-700 text-turco-red" /><span class="font-bold">✨ Es Regalía</span></label><button onClick=${clear} class="text-xs text-red-500 font-bold uppercase tracking-wide">Limpiar Todo</button></div></div>
            </div>
        </div>
    `;
}

function PaymentScreen({ cart, isGift, onBack, onConfirm, paymentMethod, setPaymentMethod, cashGiven, setCashGiven }) {
    const total = isGift ? 0 : cart.reduce((acc, item) => { let p = item.price; item.extras.forEach(eid => { const e = EXTRAS_OPTIONS.find(x => x.id === eid); if (e) p += e.price; }); return acc + (p * item.qty); }, 0);
    const change = cashGiven - total;
    const isValid = paymentMethod === 'card' || (cashGiven >= total);
    const addBill = (amount) => setCashGiven(prev => prev + amount);

    return html`
        <div class="flex-1 flex flex-col bg-turco-black">
             <header class="p-4 flex items-center border-b border-white/5"><button onClick=${onBack} class="text-gray-400 font-bold mr-4">← VOLVER</button><h2 class="text-white font-bold text-lg">Cobrar</h2></header>
            <div class="p-6 text-center border-b border-white/5 bg-turco-dark"><div class="text-gray-400 text-sm font-bold uppercase">Total a Cobrar</div><div class="text-5xl font-black text-white mt-1">Q${total.toFixed(2)}</div></div>
            <div class="flex-1 p-4 flex flex-col">
                <div class="grid grid-cols-2 gap-2 bg-turco-gray p-1 rounded-xl mb-6"><button onClick=${() => setPaymentMethod('cash')} class="py-3 rounded-lg font-bold text-sm transition-all ${paymentMethod === 'cash' ? 'bg-white text-black' : 'text-gray-400'}">EFECTIVO</button><button onClick=${() => setPaymentMethod('card')} class="py-3 rounded-lg font-bold text-sm transition-all ${paymentMethod === 'card' ? 'bg-white text-black' : 'text-gray-400'}">TARJETA</button></div>
                ${paymentMethod === 'cash' && html`
                    <div class="flex-1 flex flex-col">
                        <div class="mb-4 flex items-center space-x-2"><input type="number" readonly value=${cashGiven > 0 ? cashGiven : ''} class="flex-1 bg-turco-dark text-white text-3xl font-mono p-4 rounded-xl border border-white/10 text-right" placeholder="0" /><button onClick=${() => setCashGiven(0)} class="w-12 h-12 flex items-center justify-center bg-gray-800 rounded-xl text-white font-bold">C</button></div>
                        <div class="grid grid-cols-3 gap-2 mb-6">${[5, 10, 20, 50, 100, 200].map(amt => html`<button onClick=${() => addBill(amt)} class="bg-green-900/30 text-green-400 border border-green-900/50 py-3 rounded-xl font-bold text-lg btn-press">+Q${amt}</button>`)}</div>
                        <div class="bg-gray-900 p-4 rounded-xl flex justify-between items-center mb-4"><span class="text-gray-400 font-bold uppercase text-sm">Vuelto</span><span class="text-3xl font-black ${change >= 0 ? 'text-green-500' : 'text-red-500'}">${change >= 0 ? `Q${change.toFixed(2)}` : `Falta Q${Math.abs(change).toFixed(2)}`}</span></div>
                    </div>`}
                <button disabled=${!isValid} onClick=${onConfirm} class="w-full bg-turco-red disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold text-xl py-5 rounded-2xl shadow-lg shadow-red-900/20 btn-press mt-auto">CONFIRMAR Y PAGAR</button>
            </div>
        </div>
    `;
}

function SuccessScreen({ order, onNew, onPrint }) {
    // Auto-print attempt on mount
    useEffect(() => { onPrint(); }, []);

    return html`
        <section class="flex flex-col h-full bg-turco-red items-center justify-center text-center p-8">
            <div class="w-24 h-24 bg-white rounded-full flex items-center justify-center mb-6 shadow-xl"><svg class="w-12 h-12 text-turco-red" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="4" d="M5 13l4 4L19 7"></path></svg></div>
            <h2 class="text-4xl font-extrabold text-white mb-2">¡LISTO!</h2><p class="text-white/80 font-semibold text-lg mb-10">Orden #<span>${order.id}</span> guardada</p>
             <div class="w-full space-y-3 max-w-sm">
                <button onClick=${onPrint} class="w-full bg-white/20 hover:bg-white/30 text-white font-bold py-4 rounded-xl border border-white/50 btn-press">🖨️ RE-IMPRIMIR</button>
                <button onClick=${onNew} class="w-full bg-white text-turco-red font-bold py-4 rounded-xl shadow-xl btn-press text-xl">NUEVA ORDEN</button>
             </div>
        </section>
    `;
}

render(html`<${App} />`, document.getElementById('app'));
